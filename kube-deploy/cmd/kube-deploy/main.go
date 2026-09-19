package main

import (
	"errors"
	"fmt"
	"os"
	"regexp"

	"github.com/spf13/cobra"

	"github.com/user/dev-tools/kube-deploy/internal/deploy"
)

var (
	dryRun  bool
	force   bool
	noSlack bool
)

func cfg() deploy.Config {
	return deploy.Config{DryRun: dryRun, Force: force, NoSlack: noSlack}
}

func main() {
	rootCmd := buildRootCmd()
	if err := rootCmd.Execute(); err != nil {
		if !errors.Is(err, deploy.ErrSilent) {
			fmt.Fprintf(os.Stderr, "\033[0;31m[ERROR]\033[0m %v\n", err)
		}
		os.Exit(1)
	}
}

func buildRootCmd() *cobra.Command {
	d := deploy.NewProductionDeps()

	root := &cobra.Command{
		Use:           "kube-deploy",
		Short:         "Kubernetes環境デプロイ・管理CLI",
		SilenceErrors: true,
		SilenceUsage:  true,
		Args:          cobra.ArbitraryArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(args) == 0 {
				return cmd.Help()
			}
			arg := args[0]
			mrURLRe := regexp.MustCompile(`^https?://.*merge_requests/\d+`)
			ticketRe := regexp.MustCompile(`^[A-Z]+-\d+$`)

			if mrURLRe.MatchString(arg) {
				return deploy.DeployMRURL(d, cfg(), arg)
			}
			if ticketRe.MatchString(arg) {
				return deploy.DeployTicket(d, cfg(), arg)
			}
			return fmt.Errorf("不明なコマンド: %s\n\nkube-deploy --help でヘルプを表示", arg)
		},
	}

	root.PersistentFlags().BoolVar(&dryRun, "dry-run", false, "実行せずに計画だけ表示")
	root.PersistentFlags().BoolVar(&force, "force", false, "競合警告をスキップ")
	root.PersistentFlags().BoolVar(&noSlack, "no-slack", false, "Slack通知を無効化")

	root.AddCommand(
		newSetCmd(d),
		newUpdateCmd(d),
		newDiffCmd(d),
		newStatusCmd(d),
		newResetCmd(d),
		newRefreshCmd(d),
	)
	return root
}

func newSetCmd(d deploy.Deps) *cobra.Command {
	var tag, ticket string
	cmd := &cobra.Command{
		Use:          "set <SERVICE>",
		Short:        "手動でサービスのイメージタグを指定してデプロイ",
		SilenceUsage: true,
		Args:         cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return deploy.Set(d, cfg(), args[0], tag, ticket)
		},
	}
	cmd.Flags().StringVar(&tag, "tag", "", "イメージタグ (必須)")
	cmd.Flags().StringVar(&ticket, "ticket", "manual", "チケット番号")
	if err := cmd.MarkFlagRequired("tag"); err != nil {
		panic(err)
	}
	return cmd
}

func newUpdateCmd(d deploy.Deps) *cobra.Command {
	return &cobra.Command{
		Use:          "update",
		Short:        "自分のデプロイを最新コミットに一括更新",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return deploy.Update(d, cfg())
		},
	}
}

func newDiffCmd(d deploy.Deps) *cobra.Command {
	return &cobra.Command{
		Use:          "diff",
		Short:        "latestとの差分表示（誰が何を変えたか）",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return deploy.Diff(d, cfg())
		},
	}
}

func newStatusCmd(d deploy.Deps) *cobra.Command {
	return &cobra.Command{
		Use:          "status",
		Short:        "デプロイ状態 + ArgoCD + Pod 状態表示",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return deploy.Status(d, cfg())
		},
	}
}

func newResetCmd(d deploy.Deps) *cobra.Command {
	return &cobra.Command{
		Use:          "reset <SERVICE|TICKET|--mine|--all>",
		Short:        "サービスまたはチケットをlatestにリセット",
		SilenceUsage: true,
		Args:         cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return deploy.Reset(d, cfg(), args[0])
		},
	}
}

func newRefreshCmd(d deploy.Deps) *cobra.Command {
	return &cobra.Command{
		Use:          "refresh",
		Short:        "全サービスをArgoCD sync + Pod再起動で最新化",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return deploy.Refresh(d, cfg())
		},
	}
}
