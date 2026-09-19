package deploy

import (
	"fmt"

	"github.com/user/dev-tools/kube-deploy/internal/config"
	"github.com/user/dev-tools/kube-deploy/internal/ecr"
	"github.com/user/dev-tools/kube-deploy/internal/slack"
	"github.com/user/dev-tools/kube-deploy/internal/ui"
)

// Set は手動でサービスのイメージタグを指定してデプロイする
func Set(d Deps, cfg Config, service, tag, ticket string) error {
	if !config.IsValidService(service) {
		ui.Error("不明なサービス: " + service)
		ui.Info("有効なサービス: " + joinServices())
		return ErrSilent
	}

	if err := d.KubeEnsureContext(); err != nil {
		return err
	}

	ns := config.ServiceNamespace[service]
	ecrRepo := config.ServiceECRRepo[service]

	// ECR イメージ確認（ベストエフォート）
	if d.ECRCheckAWSAuth() == nil {
		if !d.ECRImageExists(ecrRepo, tag) {
			ui.Warn(fmt.Sprintf("ECR にイメージが見つかりません: %s:%s", ecrRepo, tag))
			ui.Info("CI/CDのビルドが完了しているか確認してください")
		}
	}

	// 競合チェック
	checkConflict(d, service)

	// 現在のタグを取得
	currentTag, err := d.KubeGetCurrentImageTag(service, ns)
	if err != nil {
		currentTag = "unknown"
	}

	fullImage := ecr.MakeFullImage(ecrRepo, tag)
	ui.Info(fmt.Sprintf("%s: %s → %s", service, currentTag, tag))

	if cfg.DryRun {
		ui.Info(fmt.Sprintf("[DRY-RUN] kubectl set image deployment/%s %s=%s -n %s",
			service, service, fullImage, ns))
		return nil
	}

	if !d.UIConfirm("デプロイしますか？") {
		ui.Info("キャンセルしました")
		return nil
	}

	if err := d.KubeSetDeploymentImage(service, ns, fullImage); err != nil {
		ui.Error(service + ": デプロイに失敗しました")
		return ErrSilent
	}
	setAnnotation(d, service, ns, ticket, tag, "manual", d.GitLabCurrentUsername())
	ui.Success(service + ": デプロイ完了")
	ui.Info("rollout status を確認中...")
	if err := d.KubeWaitRollout(service, ns); err != nil {
		ui.Warn(fmt.Sprintf("rollout がタイムアウトしました。kubectl get pods -n %s で確認してください", ns))
	}

	// Slack 通知
	if !cfg.NoSlack {
		d.SlackNotify(slack.DeployResult{
			Ticket: ticket,
			Entries: []slack.DeployResultEntry{
				{Service: service, Tag: tag, PreviousTag: currentTag, MRUrl: "manual"},
			},
			User: d.GitLabCurrentUsername(),
		})
	}
	return nil
}

func joinServices() string {
	svcs := config.ListServices()
	result := ""
	for i, s := range svcs {
		if i > 0 {
			result += " "
		}
		result += s
	}
	return result
}
