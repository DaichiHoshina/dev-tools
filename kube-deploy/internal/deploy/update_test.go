package deploy

import (
	"fmt"
	"os/exec"
	"strings"
	"testing"

	"github.com/user/dev-tools/kube-deploy/internal/gitlab"
	"github.com/user/dev-tools/kube-deploy/internal/kube"
)

// currentSystemUser はテスト実行環境のユーザー名を返す。
func currentSystemUser() string {
	out, err := exec.Command("whoami").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// TestUpdate_NoAnnotations は自分のannotationがない場合、エラーなしで終了することを検証する
func TestUpdate_NoAnnotations(t *testing.T) {
	t.Helper()

	d := mockDeps()
	d.KubeGetAnnotations = func(svc, ns string) (kube.DeployAnnotation, error) {
		return kube.DeployAnnotation{}, nil
	}

	cfg := defaultConfig()

	err := Update(d, cfg)
	if err != nil {
		t.Errorf("Update(no annotations) = %v, want nil", err)
	}
}

// TestUpdate_OtherUserAnnotationsOnly は他ユーザーのannotationのみで、自分のannotationがない場合を検証する
func TestUpdate_OtherUserAnnotationsOnly(t *testing.T) {
	t.Helper()

	setImageCallCount := 0
	d := mockDeps()
	d.KubeGetAnnotations = func(svc, ns string) (kube.DeployAnnotation, error) {
		if svc == "api-server" {
			return kube.DeployAnnotation{
				DeployedBy: "other-user",
				Ticket:     "TICKET-50",
				Tag:        "abc123",
				MRUrl:      "https://gitlab.example.com/myorg/application/web-frontend/-/merge_requests/100",
			}, nil
		}
		return kube.DeployAnnotation{}, nil
	}
	d.KubeSetDeploymentImage = func(svc, ns, fullImage string) error {
		setImageCallCount++
		return nil
	}

	cfg := defaultConfig()

	err := Update(d, cfg)
	if err != nil {
		t.Errorf("Update(other user annotations only) = %v, want nil", err)
	}
	if setImageCallCount != 0 {
		t.Errorf("KubeSetDeploymentImage called %d times, want 0", setImageCallCount)
	}
}

// TestUpdate_DryRun は DryRun=true で更新が実行されないことを検証する
func TestUpdate_DryRun(t *testing.T) {
	t.Helper()

	me := currentSystemUser()
	setImageCallCount := 0
	d := mockDeps()
	d.KubeGetAnnotations = func(svc, ns string) (kube.DeployAnnotation, error) {
		if svc == "api-server" {
			return kube.DeployAnnotation{
				DeployedBy: me,
				Ticket:     "TICKET-100",
				Tag:        "oldsha123",
				MRUrl:      "https://gitlab.example.com/myorg/application/web-frontend/-/merge_requests/100",
			}, nil
		}
		return kube.DeployAnnotation{}, nil
	}
	d.GitLabGetMR = func(mrURL string) (gitlab.MRInfo, error) {
		return gitlab.MRInfo{
			SHA:            "newsha456",
			PipelineStatus: "success",
		}, nil
	}
	d.KubeSetDeploymentImage = func(svc, ns, fullImage string) error {
		setImageCallCount++
		return nil
	}

	cfg := defaultConfig()
	cfg.DryRun = true

	err := Update(d, cfg)
	if err != nil {
		t.Errorf("Update(dryrun) = %v, want nil", err)
	}
	if setImageCallCount != 0 {
		t.Errorf("KubeSetDeploymentImage called %d times in dry-run, want 0", setImageCallCount)
	}
}

// TestUpdate_ManualMRURLSkipped は mrURL="manual" のサービスがスキップされることを検証する
func TestUpdate_ManualMRURLSkipped(t *testing.T) {
	t.Helper()

	me := currentSystemUser()
	getMRCallCount := 0
	d := mockDeps()
	d.KubeGetAnnotations = func(svc, ns string) (kube.DeployAnnotation, error) {
		if svc == "api-server" {
			return kube.DeployAnnotation{
				DeployedBy: me,
				Ticket:     "TICKET-100",
				Tag:        "abc123",
				MRUrl:      "manual",
			}, nil
		}
		return kube.DeployAnnotation{}, nil
	}
	d.GitLabGetMR = func(mrURL string) (gitlab.MRInfo, error) {
		getMRCallCount++
		return gitlab.MRInfo{}, nil
	}

	cfg := defaultConfig()

	err := Update(d, cfg)
	if err != nil {
		t.Errorf("Update(manual mrURL) = %v, want nil", err)
	}
	if getMRCallCount != 0 {
		t.Errorf("GitLabGetMR called %d times for manual mrURL, want 0", getMRCallCount)
	}
}

// TestUpdate_EmptyMRURLSkipped は mrURL="" のサービスがスキップされることを検証する
func TestUpdate_EmptyMRURLSkipped(t *testing.T) {
	t.Helper()

	me := currentSystemUser()
	getMRCallCount := 0
	d := mockDeps()
	d.KubeGetAnnotations = func(svc, ns string) (kube.DeployAnnotation, error) {
		if svc == "api-server" {
			return kube.DeployAnnotation{
				DeployedBy: me,
				Ticket:     "TICKET-100",
				Tag:        "abc123",
				MRUrl:      "",
			}, nil
		}
		return kube.DeployAnnotation{}, nil
	}
	d.GitLabGetMR = func(mrURL string) (gitlab.MRInfo, error) {
		getMRCallCount++
		return gitlab.MRInfo{}, nil
	}

	cfg := defaultConfig()

	err := Update(d, cfg)
	if err != nil {
		t.Errorf("Update(empty mrURL) = %v, want nil", err)
	}
	if getMRCallCount != 0 {
		t.Errorf("GitLabGetMR called %d times for empty mrURL, want 0", getMRCallCount)
	}
}

// TestUpdate_KubeEnsureContextError は KubeEnsureContext エラーが伝播されることを検証する
func TestUpdate_KubeEnsureContextError(t *testing.T) {
	t.Helper()

	d := mockDeps()
	d.KubeEnsureContext = func() error { return fmt.Errorf("context error") }

	cfg := defaultConfig()

	err := Update(d, cfg)
	if err == nil {
		t.Error("Update(context error) = nil, want error")
	}
}

// TestUpdate_UpToDate はタグが変わっていない場合、デプロイが実行されないことを検証する
func TestUpdate_UpToDate(t *testing.T) {
	t.Helper()

	me := currentSystemUser()
	setImageCallCount := 0
	sha := "abc123def456"
	overrideTag := "dev-" + sha

	d := mockDeps()
	d.KubeGetAnnotations = func(svc, ns string) (kube.DeployAnnotation, error) {
		if svc == "api-server" {
			return kube.DeployAnnotation{
				DeployedBy: me,
				Ticket:     "TICKET-100",
				Tag:        overrideTag,
				MRUrl:      "https://gitlab.example.com/myorg/application/web-frontend/-/merge_requests/100",
			}, nil
		}
		return kube.DeployAnnotation{}, nil
	}
	d.GitLabGetMR = func(mrURL string) (gitlab.MRInfo, error) {
		return gitlab.MRInfo{
			SHA:            sha,
			PipelineStatus: "success",
		}, nil
	}
	d.KubeSetDeploymentImage = func(svc, ns, fullImage string) error {
		setImageCallCount++
		return nil
	}

	cfg := defaultConfig()

	err := Update(d, cfg)
	if err != nil {
		t.Errorf("Update(up-to-date) = %v, want nil", err)
	}
	if setImageCallCount != 0 {
		t.Errorf("KubeSetDeploymentImage called %d times when up-to-date, want 0", setImageCallCount)
	}
}
