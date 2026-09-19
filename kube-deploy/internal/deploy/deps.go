package deploy

import (
	"github.com/user/dev-tools/kube-deploy/internal/argocd"
	"github.com/user/dev-tools/kube-deploy/internal/ecr"
	"github.com/user/dev-tools/kube-deploy/internal/gitlab"
	"github.com/user/dev-tools/kube-deploy/internal/kube"
	"github.com/user/dev-tools/kube-deploy/internal/slack"
	"github.com/user/dev-tools/kube-deploy/internal/ui"
)

// Deps は deploy パッケージが使用する外部依存をまとめた構造体。
// テストではフィールドをモック関数で置き換えることができる。
type Deps struct {
	// kube
	KubeEnsureContext      func() error
	KubeSetDeploymentImage func(svc, ns, fullImage string) error
	KubeGetCurrentImageTag func(svc, ns string) (string, error)
	KubeWaitRollout        func(svc, ns string) error
	KubeSetAnnotations     func(svc, ns string, ann kube.DeployAnnotation) error
	KubeGetAnnotations     func(svc, ns string) (kube.DeployAnnotation, error)
	KubeRemoveAnnotations  func(svc, ns string) error
	// ecr
	ECRCheckAWSAuth func() error
	ECRImageExists  func(repo, tag string) bool
	// gitlab
	GitLabGetMR             func(mrURL string) (gitlab.MRInfo, error)
	GitLabSearchMRsByTicket func(ticket string) ([]gitlab.MRInfo, error)
	GitLabCurrentUsername   func() string
	GitLabGetCommitInfo     func(projectPath, sha string) (gitlab.CommitInfo, error)
	// slack
	SlackNotify func(result slack.DeployResult)
	// ui
	UIConfirm func(msg string) bool
	// argocd
	ArgoCDStatus  func()
	ArgoCDSync    func(target string) error
	ArgoCDRestart func(target string) error
	// slack (reset用)
	SlackNotifyReset func(result slack.ResetResult)
	// slack (refresh用)
	SlackNotifyRefresh func(user string)
}

// NewProductionDeps は実際の実装を使用する Deps を返す。
func NewProductionDeps() Deps {
	return Deps{
		KubeEnsureContext:       kube.EnsureContext,
		KubeSetDeploymentImage:  kube.SetDeploymentImage,
		KubeGetCurrentImageTag:  kube.GetCurrentImageTag,
		KubeWaitRollout:         kube.WaitRollout,
		KubeSetAnnotations:      kube.SetAnnotations,
		KubeGetAnnotations:      kube.GetAnnotations,
		KubeRemoveAnnotations:   kube.RemoveAnnotations,
		ECRCheckAWSAuth:         ecr.CheckAWSAuth,
		ECRImageExists:          ecr.ImageExists,
		GitLabGetMR:             gitlab.GetMR,
		GitLabSearchMRsByTicket: gitlab.SearchMRsByTicket,
		GitLabCurrentUsername:   gitlab.CurrentUsername,
		GitLabGetCommitInfo:     gitlab.GetCommitInfo,
		SlackNotify:             slack.Notify,
		UIConfirm:               ui.Confirm,
		ArgoCDStatus:            argocd.Status,
		ArgoCDSync:              argocd.Sync,
		ArgoCDRestart:           argocd.Restart,
		SlackNotifyReset:        slack.NotifyReset,
		SlackNotifyRefresh:      slack.NotifyRefresh,
	}
}
