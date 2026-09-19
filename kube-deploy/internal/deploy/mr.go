package deploy

import (
	"fmt"
	"regexp"

	"github.com/user/dev-tools/kube-deploy/internal/config"
	"github.com/user/dev-tools/kube-deploy/internal/ecr"
	"github.com/user/dev-tools/kube-deploy/internal/gitlab"
	"github.com/user/dev-tools/kube-deploy/internal/slack"
	"github.com/user/dev-tools/kube-deploy/internal/ui"
)

var ticketRe = regexp.MustCompile(`[A-Z]+-\d+`)

// DeployMRURL は MR URL を指定してデプロイする
func DeployMRURL(d Deps, cfg Config, mrURL string) error {
	projectPath, iid, err := gitlab.ParseMRURL(mrURL)
	if err != nil {
		ui.Error("MR URLのパースに失敗しました: " + mrURL)
		return ErrSilent
	}

	svc := config.GitLabToService[projectPath]
	if svc == "" {
		ui.Error("不明なプロジェクト: " + projectPath)
		ui.Info("マッピングされているプロジェクト:")
		for proj, service := range config.GitLabToService {
			ui.Info(fmt.Sprintf("  %s → %s", proj, service))
		}
		return ErrSilent
	}

	if err := d.KubeEnsureContext(); err != nil {
		return err
	}

	// MR 情報取得
	mr, err := d.GitLabGetMR(mrURL)
	if err != nil {
		return fmt.Errorf("MR情報の取得に失敗: %w", err)
	}

	// チケット番号を抽出
	ticket := ticketRe.FindString(mr.Title)
	if ticket == "" {
		ticket = fmt.Sprintf("MR-%d", iid)
	}

	ns := config.ServiceNamespace[svc]
	ecrRepo := config.ServiceECRRepo[svc]
	tag := ecr.MakeImageTag(mr.SHA)
	fullImage := ecr.MakeFullImage(ecrRepo, tag)

	// パイプラインステータス確認
	if !checkPipelineDeployable(svc, mr.PipelineStatus, mr.PipelineWebURL) {
		return ErrSilent
	}
	if mr.PipelineStatus == "success" {
		ui.Success(fmt.Sprintf("%s: CI成功 → %s", svc, tag))
	}

	// 競合チェック
	checkConflict(d, svc)

	// 現在のタグを取得
	currentTag, err := d.KubeGetCurrentImageTag(svc, ns)
	if err != nil {
		currentTag = "unknown"
	}

	ui.Header("デプロイ計画")
	ui.Info(fmt.Sprintf("サービス:  %s (%s)", svc, ns))
	ui.Info(fmt.Sprintf("MR:        !%d %s", iid, mr.Title))
	ui.Info("チケット:  " + ticket)
	ui.Info(fmt.Sprintf("タグ:      %s → %s", currentTag, tag))
	fmt.Println()

	if cfg.DryRun {
		ui.Info(fmt.Sprintf("[DRY-RUN] kubectl set image deployment/%s %s=%s -n %s", svc, svc, fullImage, ns))
		return nil
	}

	if !d.UIConfirm("デプロイしますか？") {
		ui.Info("キャンセルしました")
		return nil
	}

	ui.Info(svc + ": デプロイ中...")
	if err := d.KubeSetDeploymentImage(svc, ns, fullImage); err != nil {
		ui.Error(svc + ": デプロイに失敗しました")
		return ErrSilent
	}
	setAnnotation(d, svc, ns, ticket, tag, mrURL, mr.Author)
	ui.Success(svc + ": デプロイ完了")
	ui.Info("rollout を待機中...")
	if err := d.KubeWaitRollout(svc, ns); err != nil {
		ui.Warn(fmt.Sprintf("rollout がタイムアウトしました。kubectl get pods -n %s で確認してください", ns))
	}

	// Slack 通知
	if !cfg.NoSlack {
		d.SlackNotify(slack.DeployResult{
			Ticket: ticket,
			Entries: []slack.DeployResultEntry{
				{Service: svc, Tag: tag, PreviousTag: currentTag, MRUrl: mrURL},
			},
			User: d.GitLabCurrentUsername(),
		})
	}

	fmt.Println()
	ui.Success("完了 (" + ticket + ")")
	ui.Info("状態確認: kube-deploy status")
	ui.Info("リセット: kube-deploy reset " + svc)
	return nil
}
