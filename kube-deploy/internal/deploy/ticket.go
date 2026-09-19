package deploy

import (
	"fmt"

	"github.com/user/dev-tools/kube-deploy/internal/config"
	"github.com/user/dev-tools/kube-deploy/internal/ecr"
	"github.com/user/dev-tools/kube-deploy/internal/slack"
	"github.com/user/dev-tools/kube-deploy/internal/ui"
)

// DeployTicket はチケット番号に関連する MR を自動デプロイする
func DeployTicket(d Deps, cfg Config, ticket string) error {
	if err := d.KubeEnsureContext(); err != nil {
		return err
	}

	// MR 検索
	ui.Header("MR検索: " + ticket)
	mrs, err := d.GitLabSearchMRsByTicket(ticket)
	if err != nil {
		return fmt.Errorf("GitLab API リクエストに失敗しました: %w", err)
	}
	if len(mrs) == 0 {
		ui.Error("チケット " + ticket + " に関連するオープンMRが見つかりません")
		return ErrSilent
	}
	ui.Info(fmt.Sprintf("%d 件のMRが見つかりました", len(mrs)))

	// デプロイ計画構築
	ui.Header("デプロイ計画構築")
	var plan []DeployPlanEntry
	skipped := 0

	for _, mr := range mrs {
		tag := ecr.MakeImageTag(mr.SHA)
		pipelineURL := mr.WebURL + "/pipelines"
		if mr.PipelineWebURL != "" {
			pipelineURL = mr.PipelineWebURL
		}
		if !checkPipelineDeployable(mr.Service, mr.PipelineStatus, pipelineURL) {
			skipped++
			continue
		}
		if mr.PipelineStatus == "success" {
			ui.Success(fmt.Sprintf("%s: CI成功 → %s", mr.Service, tag))
		}
		plan = append(plan, DeployPlanEntry{
			Service:   mr.Service,
			Namespace: config.ServiceNamespace[mr.Service],
			Tag:       tag,
			MRUrl:     mr.WebURL,
			Author:    mr.Author,
			Ticket:    ticket,
		})
	}

	if skipped > 0 {
		ui.Info(fmt.Sprintf("%d 件のサービスをスキップしました（CI未完了/失敗）", skipped))
	}
	if len(plan) == 0 {
		ui.Error("デプロイ可能なサービスがありません")
		return ErrSilent
	}

	// 競合チェック
	ui.Header("競合チェック")
	for _, entry := range plan {
		checkConflict(d, entry.Service)
	}

	// デプロイ計画表示
	printDeployPlan(plan)

	if cfg.DryRun {
		ui.Info("[DRY-RUN] ここで終了します")
		return nil
	}

	if !d.UIConfirm("上記の計画でデプロイしますか？") {
		ui.Info("キャンセルしました")
		return nil
	}

	// デプロイ実行
	ui.Header("デプロイ実行")
	previousTags := make(map[string]string)
	for _, entry := range plan {
		ecrRepo := config.ServiceECRRepo[entry.Service]
		fullImage := ecr.MakeFullImage(ecrRepo, entry.Tag)

		currentTag, err := d.KubeGetCurrentImageTag(entry.Service, entry.Namespace)
		if err != nil {
			currentTag = "unknown"
		}
		previousTags[entry.Service] = currentTag

		ui.Info(fmt.Sprintf("%s: デプロイ中...", entry.Service))
		if err := d.KubeSetDeploymentImage(entry.Service, entry.Namespace, fullImage); err != nil {
			ui.Error(fmt.Sprintf("%s: デプロイに失敗しました: %v", entry.Service, err))
			continue
		}
		setAnnotation(d, entry.Service, entry.Namespace, ticket, entry.Tag, entry.MRUrl, entry.Author)
		ui.Success(fmt.Sprintf("%s: イメージを更新しました", entry.Service))
	}

	// rollout 待機
	ui.Header("Rollout Status")
	for _, entry := range plan {
		ui.Info(fmt.Sprintf("%s: rollout を待機中...", entry.Service))
		if err := d.KubeWaitRollout(entry.Service, entry.Namespace); err != nil {
			ui.Warn(fmt.Sprintf("%s: rollout がタイムアウトしました", entry.Service))
			ui.Info(fmt.Sprintf("  確認: kubectl get pods -n %s", entry.Namespace))
		} else {
			ui.Success(fmt.Sprintf("%s: rollout 完了", entry.Service))
		}
	}

	// Slack 通知
	if !cfg.NoSlack {
		var entries []slack.DeployResultEntry
		for _, entry := range plan {
			entries = append(entries, slack.DeployResultEntry{
				Service:     entry.Service,
				Tag:         entry.Tag,
				PreviousTag: previousTags[entry.Service],
				MRUrl:       entry.MRUrl,
			})
		}
		d.SlackNotify(slack.DeployResult{
			Ticket:  ticket,
			Entries: entries,
			User:    d.GitLabCurrentUsername(),
		})
	}

	fmt.Println()
	ui.Success("デプロイ完了 (ticket: " + ticket + ")")
	ui.Info("状態確認: kube-deploy status")
	ui.Info("リセット: kube-deploy reset " + ticket)
	return nil
}

// printDeployPlan はデプロイ計画をテーブル形式で表示する
func printDeployPlan(plan []DeployPlanEntry) {
	ui.Header("デプロイ計画")
	fmt.Printf("\033[1m%-28s %-12s %-44s %s\033[0m\n", "サービス", "namespace", "イメージタグ", "MR")
	fmt.Printf("%-28s %-12s %-44s %s\n", "---", "---", "---", "---")
	for _, entry := range plan {
		fmt.Printf("%-28s %-12s %-44s %s\n", entry.Service, entry.Namespace, entry.Tag, entry.MRUrl)
	}
	fmt.Println()
}
