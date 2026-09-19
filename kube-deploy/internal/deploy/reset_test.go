package deploy

import (
	"fmt"
	"testing"

	"github.com/user/dev-tools/kube-deploy/internal/kube"
)

// TestReset_Mine_NoAnnotations は --mine で自分のannotationがない場合、エラーなしで終了することを検証する
func TestReset_Mine_NoAnnotations(t *testing.T) {
	t.Helper()

	d := mockDeps()
	d.KubeGetAnnotations = func(svc, ns string) (kube.DeployAnnotation, error) {
		return kube.DeployAnnotation{}, nil
	}

	cfg := defaultConfig()

	err := Reset(d, cfg, "--mine")
	if err != nil {
		t.Errorf("Reset(--mine, no annotations) = %v, want nil", err)
	}
}

// TestReset_Mine_WithOtherUserAnnotations は --mine で他ユーザーのannotationのみある場合、リセットが行われないことを検証する
func TestReset_Mine_WithOtherUserAnnotations(t *testing.T) {
	t.Helper()

	removeCallCount := 0
	d := mockDeps()
	d.KubeGetAnnotations = func(svc, ns string) (kube.DeployAnnotation, error) {
		if svc == "api-server" {
			return kube.DeployAnnotation{
				DeployedBy: "other-user",
				Ticket:     "TICKET-50",
				Tag:        "abc123",
			}, nil
		}
		return kube.DeployAnnotation{}, nil
	}
	d.KubeRemoveAnnotations = func(svc, ns string) error {
		removeCallCount++
		return nil
	}

	cfg := defaultConfig()

	err := Reset(d, cfg, "--mine")
	if err != nil {
		t.Errorf("Reset(--mine, other user annotations) = %v, want nil", err)
	}
	if removeCallCount != 0 {
		t.Errorf("KubeRemoveAnnotations called %d times, want 0 (other user's annotation)", removeCallCount)
	}
}

// TestReset_Service_AlreadyLatest はサービスが既にlatestの場合、エラーなしで終了することを検証する
func TestReset_Service_AlreadyLatest(t *testing.T) {
	t.Helper()

	d := mockDeps()
	d.KubeGetCurrentImageTag = func(svc, ns string) (string, error) {
		return "latest", nil
	}

	cfg := defaultConfig()

	err := Reset(d, cfg, "api-server")
	if err != nil {
		t.Errorf("Reset(web, already latest) = %v, want nil", err)
	}
}

// TestReset_Service_UIConfirmFalse はUIConfirm=false でキャンセルされることを検証する
func TestReset_Service_UIConfirmFalse(t *testing.T) {
	t.Helper()

	setImageCallCount := 0
	d := mockDeps()
	d.KubeGetCurrentImageTag = func(svc, ns string) (string, error) {
		return "dev-abc123", nil
	}
	d.KubeSetDeploymentImage = func(svc, ns, fullImage string) error {
		setImageCallCount++
		return nil
	}
	d.UIConfirm = func(msg string) bool { return false }

	cfg := defaultConfig()

	err := Reset(d, cfg, "api-server")
	if err != nil {
		t.Errorf("Reset(web, confirm=false) = %v, want nil", err)
	}
	if setImageCallCount != 0 {
		t.Errorf("KubeSetDeploymentImage called %d times after cancel, want 0", setImageCallCount)
	}
}

// TestReset_Service_DryRun は DryRun=true でリセットが実行されないことを検証する
func TestReset_Service_DryRun(t *testing.T) {
	t.Helper()

	setImageCallCount := 0
	d := mockDeps()
	d.KubeGetCurrentImageTag = func(svc, ns string) (string, error) {
		return "dev-abc123", nil
	}
	d.KubeSetDeploymentImage = func(svc, ns, fullImage string) error {
		setImageCallCount++
		return nil
	}
	d.UIConfirm = func(msg string) bool { return true }

	cfg := defaultConfig()
	cfg.DryRun = true

	err := Reset(d, cfg, "api-server")
	if err != nil {
		t.Errorf("Reset(web, dryrun) = %v, want nil", err)
	}
	if setImageCallCount != 0 {
		t.Errorf("KubeSetDeploymentImage called %d times in dry-run, want 0", setImageCallCount)
	}
}

// TestReset_TicketNotFound はチケットに一致するannotationがない場合エラーなしで終了することを検証する
func TestReset_TicketNotFound(t *testing.T) {
	t.Helper()

	d := mockDeps()
	d.KubeGetAnnotations = func(svc, ns string) (kube.DeployAnnotation, error) {
		return kube.DeployAnnotation{}, nil
	}

	cfg := defaultConfig()

	err := Reset(d, cfg, "TICKET-999")
	if err != nil {
		t.Errorf("Reset(TICKET-999 as ticket, no match) = %v, want nil", err)
	}
}

// TestReset_Force_SkipsUIConfirm は Force=true でUIConfirm不要にリセットが実行されることを検証する
func TestReset_Force_SkipsUIConfirm(t *testing.T) {
	t.Helper()

	setImageCallCount := 0
	d := mockDeps()
	d.KubeGetCurrentImageTag = func(svc, ns string) (string, error) {
		return "dev-abc123", nil
	}
	d.KubeSetDeploymentImage = func(svc, ns, fullImage string) error {
		setImageCallCount++
		return nil
	}
	confirmCallCount := 0
	d.UIConfirm = func(msg string) bool {
		confirmCallCount++
		return false
	}

	cfg := defaultConfig()
	cfg.Force = true

	err := Reset(d, cfg, "api-server")
	if err != nil {
		t.Errorf("Reset(web, force) = %v, want nil", err)
	}
	if confirmCallCount != 0 {
		t.Errorf("UIConfirm called %d times with Force=true, want 0", confirmCallCount)
	}
}

// TestReset_KubeEnsureContextError は KubeEnsureContext エラーが伝播されることを検証する
func TestReset_KubeEnsureContextError(t *testing.T) {
	t.Helper()

	d := mockDeps()
	d.KubeEnsureContext = func() error { return fmt.Errorf("context error") }

	cfg := defaultConfig()

	err := Reset(d, cfg, "api-server")
	if err == nil {
		t.Error("Reset(context error) = nil, want error")
	}
}

// TestReset_All_AllLatest は --all で全サービスがlatestの場合、リセット不要で終了することを検証する
func TestReset_All_AllLatest(t *testing.T) {
	t.Helper()

	d := mockDeps()
	d.KubeGetCurrentImageTag = func(svc, ns string) (string, error) {
		return "latest", nil
	}

	cfg := defaultConfig()

	err := Reset(d, cfg, "--all")
	if err != nil {
		t.Errorf("Reset(--all, all latest) = %v, want nil", err)
	}
}
