package deploy

import (
	"fmt"
	"os/exec"
	"strings"

	"github.com/user/dev-tools/kube-deploy/internal/config"
	"github.com/user/dev-tools/kube-deploy/internal/ecr"
	"github.com/user/dev-tools/kube-deploy/internal/gitlab"
	"github.com/user/dev-tools/kube-deploy/internal/slack"
	"github.com/user/dev-tools/kube-deploy/internal/ui"
)

// Update は自分のデプロイを最新コミットに一括更新する
func Update(d Deps, cfg Config) error {
	if err := d.KubeEnsureContext(); err != nil {
		return err
	}

	me := currentUser()

	// 自分の annotation があるサービスを収集
	type myEntry struct {
		svc string
		ann struct{ ticket, mrURL, tag string }
	}
	var myServices []myEntry
	for _, svc := range config.ListServices() {
		ns := config.ServiceNamespace[svc]
		ann, err := d.KubeGetAnnotations(svc, ns)
		if err != nil || !ann.HasAnnotation() {
			continue
		}
		if ann.DeployedBy == me || ann.DeployedBy == d.GitLabCurrentUsername() {
			myServices = append(myServices, myEntry{
				svc: svc,
				ann: struct{ ticket, mrURL, tag string }{ann.Ticket, ann.MRUrl, ann.Tag},
			})
		}
	}

	if len(myServices) == 0 {
		ui.Info(fmt.Sprintf("現在オーバーライドしているサービスはありません（user: %s）", me))
		return nil
	}

	ui.Header(fmt.Sprintf("更新チェック (%d サービス)", len(myServices)))
	var plan []DeployPlanEntry
	skipped := 0
	upToDate := 0

	for _, entry := range myServices {
		mrURL := entry.ann.mrURL

		// 手動設定はスキップ
		if mrURL == "manual" || mrURL == "" {
			ui.Info(entry.svc + ": 手動設定 — スキップ")
			skipped++
			continue
		}

		// MR URL をパース（URL形式の検証のみ）
		if _, _, err := gitlab.ParseMRURL(mrURL); err != nil {
			ui.Warn(entry.svc + ": MR URL解析失敗 — スキップ")
			skipped++
			continue
		}

		// MR の最新情報を取得
		mr, err := d.GitLabGetMR(mrURL)
		if err != nil {
			ui.Warn(entry.svc + ": MR情報の取得失敗 — スキップ")
			skipped++
			continue
		}

		latestTag := ecr.MakeImageTag(mr.SHA)

		// 変更なしチェック
		if latestTag == entry.ann.tag {
			ui.Info(fmt.Sprintf("%s: 最新（%s...）", entry.svc, truncate(entry.ann.tag, 20)))
			upToDate++
			continue
		}

		// パイプライン確認
		if !checkPipelineDeployable(entry.svc, mr.PipelineStatus, mr.PipelineWebURL) {
			skipped++
			continue
		}

		ui.Success(fmt.Sprintf("%s: 新コミット検出 %s... → %s...",
			entry.svc, truncate(entry.ann.tag, 16), truncate(latestTag, 16)))
		plan = append(plan, DeployPlanEntry{
			Service:   entry.svc,
			Namespace: config.ServiceNamespace[entry.svc],
			Tag:       latestTag,
			MRUrl:     mrURL,
			Author:    mr.Author,
			Ticket:    entry.ann.ticket,
		})
	}

	if upToDate > 0 {
		ui.Info(fmt.Sprintf("%d 件は最新コミットで稼働中", upToDate))
	}
	if skipped > 0 {
		ui.Info(fmt.Sprintf("%d 件をスキップ", skipped))
	}
	if len(plan) == 0 {
		ui.Success("全サービス最新です — 更新不要")
		return nil
	}

	// 更新計画表示
	ui.Header(fmt.Sprintf("更新計画 (%d サービス)", len(plan)))
	for _, entry := range plan {
		ui.Info(fmt.Sprintf("  %s: → %s...", entry.Service, truncate(entry.Tag, 20)))
	}
	fmt.Println()

	if cfg.DryRun {
		ui.Info("[DRY-RUN] ここで終了します")
		return nil
	}

	if !d.UIConfirm("上記のサービスを最新コミットに更新しますか？") {
		ui.Info("キャンセルしました")
		return nil
	}

	// デプロイ実行
	ui.Header("更新実行")
	previousTags := make(map[string]string)
	for _, entry := range plan {
		ecrRepo := config.ServiceECRRepo[entry.Service]
		fullImage := ecr.MakeFullImage(ecrRepo, entry.Tag)

		currentTag, err := d.KubeGetCurrentImageTag(entry.Service, entry.Namespace)
		if err != nil {
			currentTag = "unknown"
		}
		previousTags[entry.Service] = currentTag

		ui.Info(entry.Service + ": 更新中...")
		if err := d.KubeSetDeploymentImage(entry.Service, entry.Namespace, fullImage); err != nil {
			ui.Error(fmt.Sprintf("%s: 更新に失敗しました: %v", entry.Service, err))
			continue
		}
		setAnnotation(d, entry.Service, entry.Namespace, entry.Ticket, entry.Tag, entry.MRUrl, entry.Author)
		ui.Success(entry.Service + ": 更新完了")
	}

	// rollout 待機
	ui.Header("Rollout Status")
	for _, entry := range plan {
		ui.Info(fmt.Sprintf("%s: rollout を待機中...", entry.Service))
		if err := d.KubeWaitRollout(entry.Service, entry.Namespace); err != nil {
			ui.Warn(entry.Service + ": rollout がタイムアウトしました")
			ui.Info(fmt.Sprintf("  確認: kubectl get pods -n %s", entry.Namespace))
		} else {
			ui.Success(entry.Service + ": rollout 完了")
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
		if len(entries) > 0 {
			tickets := uniqueTickets(plan)
			d.SlackNotify(slack.DeployResult{
				Ticket:  tickets,
				Entries: entries,
				User:    d.GitLabCurrentUsername(),
			})
		}
	}

	fmt.Println()
	ui.Success("更新完了")
	return nil
}

func currentUser() string {
	out, err := exec.Command("whoami").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func uniqueTickets(plan []DeployPlanEntry) string {
	seen := map[string]struct{}{}
	var tickets []string
	for _, entry := range plan {
		if _, ok := seen[entry.Ticket]; !ok {
			seen[entry.Ticket] = struct{}{}
			tickets = append(tickets, entry.Ticket)
		}
	}
	return strings.Join(tickets, ", ")
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
