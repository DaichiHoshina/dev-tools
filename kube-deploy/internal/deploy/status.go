package deploy

import (
	"fmt"
	"os"
	"regexp"
	"text/tabwriter"

	"github.com/user/dev-tools/kube-deploy/internal/config"
	"github.com/user/dev-tools/kube-deploy/internal/ui"
)

var devTagSHARe = regexp.MustCompile(`^dev-([0-9a-f]{7,40})$`)

// Status はデプロイ状態 + ArgoCD + Pod の状態を表示する
func Status(d Deps, cfg Config) error {
	if err := d.KubeEnsureContext(); err != nil {
		return err
	}

	// latestでないサービスを収集
	type overrideInfo struct {
		svc, ns, tag, ticket, deployedBy, mrURL string
	}
	var overrides []overrideInfo

	for _, svc := range config.ListServices() {
		ns := config.ServiceNamespace[svc]
		currentTag, err := d.KubeGetCurrentImageTag(svc, ns)
		if err != nil || currentTag == "latest" || currentTag == "unknown" {
			continue
		}

		ticket := "-"
		deployedBy := "-"
		mrURL := "-"

		ann, err := d.KubeGetAnnotations(svc, ns)
		if err == nil && ann.HasAnnotation() {
			ticket = ann.Ticket
			deployedBy = ann.DeployedBy
			mrURL = ann.MRUrl
		} else if sha := extractSHAFromTag(currentTag); sha != "" {
			if projectPath, ok := config.ServiceGitLabProject[svc]; ok {
				if info, err := d.GitLabGetCommitInfo(projectPath, sha); err == nil {
					deployedBy = info.AuthorName
				}
			}
		}

		shortTag := currentTag
		if len(currentTag) > 20 {
			shortTag = currentTag[:20] + "..."
		}

		overrides = append(overrides, overrideInfo{
			svc: ns + "/" + svc, ns: ns, tag: shortTag,
			ticket: ticket, deployedBy: deployedBy, mrURL: mrURL,
		})
	}

	if len(overrides) == 0 {
		ui.Success("全サービス latest で稼働中")
	} else {
		ui.Header(fmt.Sprintf("オーバーライド中のサービス (%d 件)", len(overrides)))
		w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		fmt.Fprintln(w, "サービス\tタグ\tチケット\tデプロイ者\tMR")
		for _, o := range overrides {
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n", o.svc, o.tag, o.ticket, o.deployedBy, o.mrURL)
		}
		w.Flush()
		fmt.Println()
	}

	d.ArgoCDStatus()
	return nil
}

// Diff は latest との差分（オーバーライド中のサービス）を表示する
func Diff(d Deps, cfg Config) error {
	if err := d.KubeEnsureContext(); err != nil {
		return err
	}

	type diffRow struct {
		service, tag, ticket, deployedBy, mrURL string
	}
	var rows []diffRow

	for _, svc := range config.ListServices() {
		ns := config.ServiceNamespace[svc]
		currentTag, err := d.KubeGetCurrentImageTag(svc, ns)
		if err != nil {
			currentTag = "unknown"
		}

		if currentTag == "latest" || currentTag == "unknown" {
			continue
		}

		ticket := "-"
		deployedBy := "-"
		mrURL := "-"

		ann, err := d.KubeGetAnnotations(svc, ns)
		if err == nil && ann.HasAnnotation() {
			ticket = ann.Ticket
			deployedBy = ann.DeployedBy
			mrURL = ann.MRUrl
		} else if sha := extractSHAFromTag(currentTag); sha != "" {
			if projectPath, ok := config.ServiceGitLabProject[svc]; ok {
				if info, err := d.GitLabGetCommitInfo(projectPath, sha); err == nil {
					deployedBy = info.AuthorName
				}
			}
		}

		shortTag := currentTag
		if len(currentTag) > 12 {
			shortTag = currentTag[:12] + "..."
		}

		rows = append(rows, diffRow{ns + "/" + svc, shortTag, ticket, deployedBy, mrURL})
	}

	if len(rows) == 0 {
		ui.Success("差分なし — 全サービス latest で稼働中")
		return nil
	}

	ui.Header("オーバーライド中のサービス")
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "サービス\tタグ\tチケット\tデプロイ者\tMR")
	for _, r := range rows {
		fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n", r.service, r.tag, r.ticket, r.deployedBy, r.mrURL)
	}
	w.Flush()
	return nil
}

// Refresh は全サービスを ArgoCD sync + Pod 再起動で最新化する
func Refresh(d Deps, cfg Config) error {
	if err := d.ArgoCDSync(""); err != nil {
		return err
	}
	if err := d.ArgoCDRestart(""); err != nil {
		return err
	}
	if !cfg.NoSlack {
		d.SlackNotifyRefresh(d.GitLabCurrentUsername())
	}
	return nil
}

// extractSHAFromTag は "dev-<sha>" 形式のタグからコミットSHAを抽出する
func extractSHAFromTag(tag string) string {
	m := devTagSHARe.FindStringSubmatch(tag)
	if len(m) < 2 {
		return ""
	}
	return m[1]
}
