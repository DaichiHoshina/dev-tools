package deploy

import (
	"github.com/user/dev-tools/kube-deploy/internal/gitlab"
	"github.com/user/dev-tools/kube-deploy/internal/kube"
	"github.com/user/dev-tools/kube-deploy/internal/slack"
)

// mockDeps は全フィールドが no-op（デフォルト値を返す）の Deps を返すテストヘルパー。
func mockDeps() Deps {
	return Deps{
		KubeEnsureContext:      func() error { return nil },
		KubeSetDeploymentImage: func(svc, ns, fullImage string) error { return nil },
		KubeGetCurrentImageTag: func(svc, ns string) (string, error) { return "latest", nil },
		KubeWaitRollout:        func(svc, ns string) error { return nil },
		KubeSetAnnotations: func(svc, ns string, ann kube.DeployAnnotation) error {
			return nil
		},
		KubeGetAnnotations: func(svc, ns string) (kube.DeployAnnotation, error) {
			return kube.DeployAnnotation{}, nil
		},
		KubeRemoveAnnotations: func(svc, ns string) error { return nil },
		ECRCheckAWSAuth:       func() error { return nil },
		ECRImageExists:        func(repo, tag string) bool { return true },
		GitLabGetMR: func(mrURL string) (gitlab.MRInfo, error) {
			return gitlab.MRInfo{}, nil
		},
		GitLabSearchMRsByTicket: func(ticket string) ([]gitlab.MRInfo, error) {
			return nil, nil
		},
		GitLabCurrentUsername: func() string { return "test-user" },
		GitLabGetCommitInfo: func(projectPath, sha string) (gitlab.CommitInfo, error) {
			return gitlab.CommitInfo{}, nil
		},
		SlackNotify:        func(result slack.DeployResult) {},
		UIConfirm:          func(msg string) bool { return true },
		ArgoCDStatus:       func() {},
		ArgoCDSync:         func(target string) error { return nil },
		ArgoCDRestart:      func(target string) error { return nil },
		SlackNotifyReset:   func(result slack.ResetResult) {},
		SlackNotifyRefresh: func(user string) {},
	}
}

// defaultConfig はテスト用のデフォルト Config を返す。
func defaultConfig() Config {
	return Config{
		DryRun:  false,
		NoSlack: true,
		Force:   false,
	}
}
