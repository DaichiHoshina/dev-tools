package deploy

import (
	"fmt"

	"github.com/user/dev-tools/kube-deploy/internal/config"
	"github.com/user/dev-tools/kube-deploy/internal/slack"
	"github.com/user/dev-tools/kube-deploy/internal/ui"
)

// Reset はサービス、チケット、--mine、または --all でリセットする
func Reset(d Deps, cfg Config, target string) error {
	if err := d.KubeEnsureContext(); err != nil {
		return err
	}

	switch {
	case target == "--mine":
		return resetMine(d, cfg)
	case target == "--all":
		return resetAll(d, cfg)
	case config.IsValidService(target):
		return resetByService(d, cfg, target)
	default:
		return resetByTicket(d, cfg, target)
	}
}

func resetMine(d Deps, cfg Config) error {
	me := currentUser()
	gitlabUser := d.GitLabCurrentUsername()
	var svcs []string
	for _, svc := range config.ListServices() {
		ns := config.ServiceNamespace[svc]
		ann, err := d.KubeGetAnnotations(svc, ns)
		if err != nil || !ann.HasAnnotation() {
			continue
		}
		if ann.DeployedBy == me || ann.DeployedBy == gitlabUser {
			svcs = append(svcs, svc)
		}
	}

	if len(svcs) == 0 {
		ui.Info(fmt.Sprintf("リセット対象のサービスはありません（user: %s）", me))
		return nil
	}

	ui.Info(fmt.Sprintf("以下のサービスをリセットします（user: %s）:", me))
	for _, svc := range svcs {
		fmt.Println("  - " + svc)
	}

	if !cfg.Force && !d.UIConfirm("リセットを実行しますか？") {
		ui.Info("キャンセルしました")
		return nil
	}

	var entries []slack.ResetEntry
	for _, svc := range svcs {
		ann, _ := d.KubeGetAnnotations(svc, config.ServiceNamespace[svc])
		if err := resetSingleService(d, cfg, svc); err != nil {
			ui.Error(fmt.Sprintf("%s: %v", svc, err))
		} else if !cfg.DryRun {
			entries = append(entries, slack.ResetEntry{Service: svc, PreviousTag: ann.Tag, RestoredTag: "latest"})
		}
	}
	if !cfg.NoSlack && len(entries) > 0 {
		d.SlackNotifyReset(slack.ResetResult{
			Target:  "--mine",
			Entries: entries,
			User:    d.GitLabCurrentUsername(),
		})
	}
	return nil
}

func resetAll(d Deps, cfg Config) error {
	var svcs []string
	for _, svc := range config.ListServices() {
		ns := config.ServiceNamespace[svc]
		currentTag, err := d.KubeGetCurrentImageTag(svc, ns)
		if err != nil {
			continue
		}
		if currentTag != "latest" {
			svcs = append(svcs, svc)
		}
	}

	if len(svcs) == 0 {
		ui.Success("全サービスが latest で稼働中です")
		return nil
	}

	ui.Info("以下のサービスをリセットします:")
	for _, svc := range svcs {
		fmt.Println("  - " + svc)
	}

	if !cfg.Force && !d.UIConfirm("リセットを実行しますか？") {
		ui.Info("キャンセルしました")
		return nil
	}

	var entries []slack.ResetEntry
	for _, svc := range svcs {
		ann, _ := d.KubeGetAnnotations(svc, config.ServiceNamespace[svc])
		if err := resetSingleService(d, cfg, svc); err != nil {
			ui.Error(fmt.Sprintf("%s: %v", svc, err))
		} else if !cfg.DryRun {
			entries = append(entries, slack.ResetEntry{Service: svc, PreviousTag: ann.Tag, RestoredTag: "latest"})
		}
	}
	if !cfg.NoSlack && len(entries) > 0 {
		d.SlackNotifyReset(slack.ResetResult{
			Target:  "--all",
			Entries: entries,
			User:    d.GitLabCurrentUsername(),
		})
	}
	return nil
}

func resetByService(d Deps, cfg Config, svc string) error {
	ns := config.ServiceNamespace[svc]
	currentTag, err := d.KubeGetCurrentImageTag(svc, ns)
	if err != nil {
		currentTag = "unknown"
	}
	if currentTag == "latest" {
		ui.Info(svc + " は既に latest です")
		return nil
	}

	if !cfg.Force && !d.UIConfirm(svc+" をリセットしますか？") {
		ui.Info("キャンセルしました")
		return nil
	}

	ann, _ := d.KubeGetAnnotations(svc, ns)
	if err := resetSingleService(d, cfg, svc); err != nil {
		return err
	}
	if !cfg.NoSlack && !cfg.DryRun {
		d.SlackNotifyReset(slack.ResetResult{
			Target:  svc,
			Entries: []slack.ResetEntry{{Service: svc, PreviousTag: ann.Tag, RestoredTag: "latest"}},
			User:    d.GitLabCurrentUsername(),
		})
	}
	return nil
}

func resetByTicket(d Deps, cfg Config, ticket string) error {
	var svcs []string
	for _, svc := range config.ListServices() {
		ns := config.ServiceNamespace[svc]
		ann, err := d.KubeGetAnnotations(svc, ns)
		if err != nil {
			continue
		}
		if ann.Ticket == ticket {
			svcs = append(svcs, svc)
		}
	}

	if len(svcs) == 0 {
		ui.Info("チケット " + ticket + " のデプロイは見つかりません")
		return nil
	}

	ui.Info("チケット " + ticket + " の以下のサービスをリセットします:")
	for _, svc := range svcs {
		fmt.Println("  - " + svc)
	}

	if !cfg.Force && !d.UIConfirm("リセットを実行しますか？") {
		ui.Info("キャンセルしました")
		return nil
	}

	var entries []slack.ResetEntry
	for _, svc := range svcs {
		ann, _ := d.KubeGetAnnotations(svc, config.ServiceNamespace[svc])
		if err := resetSingleService(d, cfg, svc); err != nil {
			ui.Error(fmt.Sprintf("%s: %v", svc, err))
		} else if !cfg.DryRun {
			entries = append(entries, slack.ResetEntry{Service: svc, PreviousTag: ann.Tag, RestoredTag: "latest"})
		}
	}
	if !cfg.NoSlack && len(entries) > 0 {
		d.SlackNotifyReset(slack.ResetResult{
			Target:  ticket,
			Entries: entries,
			User:    d.GitLabCurrentUsername(),
		})
	}
	return nil
}
