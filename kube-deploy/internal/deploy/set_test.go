package deploy

import (
	"fmt"
	"testing"
)

// TestSet_InvalidService は不明なサービス名でエラーを返すことを検証する
func TestSet_InvalidService(t *testing.T) {
	t.Helper()

	d := mockDeps()
	cfg := defaultConfig()

	err := Set(d, cfg, "invalid-unknown-service", "abc123", "TICKET-999")
	if err == nil {
		t.Error("Set(invalid-service) = nil, want error")
	}
}

// TestSet_DryRun は DryRun=true でデプロイが実行されない（KubeSetDeploymentImage が呼ばれない）ことを検証する
func TestSet_DryRun(t *testing.T) {
	t.Helper()

	d := mockDeps()
	deployCallCount := 0
	d.KubeSetDeploymentImage = func(svc, ns, fullImage string) error {
		deployCallCount++
		return nil
	}

	cfg := defaultConfig()
	cfg.DryRun = true

	err := Set(d, cfg, "api-server", "abc123def", "TICKET-100")
	if err != nil {
		t.Errorf("Set(dryrun) = %v, want nil", err)
	}
	if deployCallCount != 0 {
		t.Errorf("KubeSetDeploymentImage called %d times in dry-run, want 0", deployCallCount)
	}
}

// TestSet_UIConfirmTrue は UIConfirm=true でデプロイが実行されることを検証する
func TestSet_UIConfirmTrue(t *testing.T) {
	t.Helper()

	d := mockDeps()
	deployCallCount := 0
	d.KubeSetDeploymentImage = func(svc, ns, fullImage string) error {
		deployCallCount++
		return nil
	}
	d.UIConfirm = func(msg string) bool { return true }

	cfg := defaultConfig()

	err := Set(d, cfg, "api-server", "abc123def", "TICKET-100")
	if err != nil {
		t.Errorf("Set(confirm=true) = %v, want nil", err)
	}
	if deployCallCount != 1 {
		t.Errorf("KubeSetDeploymentImage called %d times, want 1", deployCallCount)
	}
}

// TestSet_UIConfirmFalse は UIConfirm=false でキャンセルされ、デプロイが実行されないことを検証する
func TestSet_UIConfirmFalse(t *testing.T) {
	t.Helper()

	d := mockDeps()
	deployCallCount := 0
	d.KubeSetDeploymentImage = func(svc, ns, fullImage string) error {
		deployCallCount++
		return nil
	}
	d.UIConfirm = func(msg string) bool { return false }

	cfg := defaultConfig()

	err := Set(d, cfg, "api-server", "abc123def", "TICKET-100")
	if err != nil {
		t.Errorf("Set(confirm=false) = %v, want nil", err)
	}
	if deployCallCount != 0 {
		t.Errorf("KubeSetDeploymentImage called %d times after cancel, want 0", deployCallCount)
	}
}

// TestSet_KubeEnsureContextError は KubeEnsureContext がエラーを返す場合にエラーが伝播されることを検証する
func TestSet_KubeEnsureContextError(t *testing.T) {
	t.Helper()

	d := mockDeps()
	d.KubeEnsureContext = func() error { return fmt.Errorf("context error") }

	cfg := defaultConfig()

	err := Set(d, cfg, "api-server", "abc123def", "TICKET-100")
	if err == nil {
		t.Error("Set(context error) = nil, want error")
	}
}

// TestSet_ConflictCheck は既存のannotationがある場合でも継続することを検証する
func TestSet_ConflictCheck(t *testing.T) {
	t.Helper()

	d := mockDeps()
	// currentTagはlatestでない値を返す
	d.KubeGetCurrentImageTag = func(svc, ns string) (string, error) {
		return "existingtag", nil
	}
	deployCallCount := 0
	d.KubeSetDeploymentImage = func(svc, ns, fullImage string) error {
		deployCallCount++
		return nil
	}
	d.UIConfirm = func(msg string) bool { return true }

	cfg := defaultConfig()

	err := Set(d, cfg, "api-server", "newtag456", "TICKET-100")
	if err != nil {
		t.Errorf("Set(with conflict) = %v, want nil", err)
	}
	if deployCallCount != 1 {
		t.Errorf("KubeSetDeploymentImage called %d times, want 1", deployCallCount)
	}
}

// TestSet_ValidServices は各有効なサービス名で DryRun が成功することを検証する
func TestSet_ValidServices(t *testing.T) {
	validServices := []string{
		"api-server",
		"web-frontend",
		"worker",
		"scheduler",
	}

	for _, svc := range validServices {
		svc := svc
		t.Run(svc, func(t *testing.T) {
			d := mockDeps()
			cfg := defaultConfig()
			cfg.DryRun = true

			err := Set(d, cfg, svc, "abc123def", "TICKET-100")
			if err != nil {
				t.Errorf("Set(dryrun, service=%s) = %v, want nil", svc, err)
			}
		})
	}
}
