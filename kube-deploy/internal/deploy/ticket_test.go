package deploy

import (
	"fmt"
	"testing"

	"github.com/user/dev-tools/kube-deploy/internal/gitlab"
)

// TestDeployTicket_NoMRsFound は MR が0件の場合エラーを返すことを検証する
func TestDeployTicket_NoMRsFound(t *testing.T) {
	t.Helper()

	d := mockDeps()
	d.GitLabSearchMRsByTicket = func(ticket string) ([]gitlab.MRInfo, error) {
		return []gitlab.MRInfo{}, nil
	}

	cfg := defaultConfig()

	err := DeployTicket(d, cfg, "TICKET-999")
	if err == nil {
		t.Error("DeployTicket(no MRs) = nil, want error")
	}
}

// TestDeployTicket_APIError は GitLab API エラーが伝播されることを検証する
func TestDeployTicket_APIError(t *testing.T) {
	t.Helper()

	d := mockDeps()
	d.GitLabSearchMRsByTicket = func(ticket string) ([]gitlab.MRInfo, error) {
		return nil, fmt.Errorf("GitLab API error")
	}

	cfg := defaultConfig()

	err := DeployTicket(d, cfg, "TICKET-100")
	if err == nil {
		t.Error("DeployTicket(API error) = nil, want error")
	}
}

// TestDeployTicket_DryRun は DryRun=true でデプロイが実行されないことを検証する
func TestDeployTicket_DryRun(t *testing.T) {
	t.Helper()

	setImageCallCount := 0
	d := mockDeps()
	d.GitLabSearchMRsByTicket = func(ticket string) ([]gitlab.MRInfo, error) {
		return []gitlab.MRInfo{
			{
				Service:        "web-frontend",
				SHA:            "abc123def456",
				IID:            100,
				Title:          "TICKET-100: some feature",
				WebURL:         "https://gitlab.example.com/myorg/application/web-frontend/-/merge_requests/100",
				PipelineStatus: "success",
			},
		}, nil
	}
	d.KubeSetDeploymentImage = func(svc, ns, fullImage string) error {
		setImageCallCount++
		return nil
	}

	cfg := defaultConfig()
	cfg.DryRun = true

	err := DeployTicket(d, cfg, "TICKET-100")
	if err != nil {
		t.Errorf("DeployTicket(dryrun) = %v, want nil", err)
	}
	if setImageCallCount != 0 {
		t.Errorf("KubeSetDeploymentImage called %d times in dry-run, want 0", setImageCallCount)
	}
}

// TestDeployTicket_AllPipelinesFailed は全MRのパイプラインが失敗している場合エラーを返すことを検証する
func TestDeployTicket_AllPipelinesFailed(t *testing.T) {
	t.Helper()

	d := mockDeps()
	d.GitLabSearchMRsByTicket = func(ticket string) ([]gitlab.MRInfo, error) {
		return []gitlab.MRInfo{
			{
				Service:        "web",
				SHA:            "abc123def456",
				IID:            100,
				Title:          "TICKET-100: some feature",
				WebURL:         "https://gitlab.example.com/myorg/application/web-frontend/-/merge_requests/100",
				PipelineStatus: "failed",
			},
		}, nil
	}

	cfg := defaultConfig()

	err := DeployTicket(d, cfg, "TICKET-100")
	if err == nil {
		t.Error("DeployTicket(all failed) = nil, want error")
	}
}

// TestDeployTicket_UIConfirmTrue は UIConfirm=true でデプロイが実行されることを検証する
func TestDeployTicket_UIConfirmTrue(t *testing.T) {
	t.Helper()

	setImageCallCount := 0
	d := mockDeps()
	d.GitLabSearchMRsByTicket = func(ticket string) ([]gitlab.MRInfo, error) {
		return []gitlab.MRInfo{
			{
				Service:        "web-frontend",
				SHA:            "abc123def456",
				IID:            100,
				Title:          "TICKET-100: some feature",
				WebURL:         "https://gitlab.example.com/myorg/application/web-frontend/-/merge_requests/100",
				PipelineStatus: "success",
			},
		}, nil
	}
	d.KubeSetDeploymentImage = func(svc, ns, fullImage string) error {
		setImageCallCount++
		return nil
	}
	d.UIConfirm = func(msg string) bool { return true }

	cfg := defaultConfig()

	err := DeployTicket(d, cfg, "TICKET-100")
	if err != nil {
		t.Errorf("DeployTicket(confirm=true) = %v, want nil", err)
	}
	if setImageCallCount != 1 {
		t.Errorf("KubeSetDeploymentImage called %d times, want 1", setImageCallCount)
	}
}

// TestDeployTicket_UIConfirmFalse は UIConfirm=false でキャンセルされることを検証する
func TestDeployTicket_UIConfirmFalse(t *testing.T) {
	t.Helper()

	setImageCallCount := 0
	d := mockDeps()
	d.GitLabSearchMRsByTicket = func(ticket string) ([]gitlab.MRInfo, error) {
		return []gitlab.MRInfo{
			{
				Service:        "web-frontend",
				SHA:            "abc123def456",
				IID:            100,
				Title:          "TICKET-100: some feature",
				WebURL:         "https://gitlab.example.com/myorg/application/web-frontend/-/merge_requests/100",
				PipelineStatus: "success",
			},
		}, nil
	}
	d.KubeSetDeploymentImage = func(svc, ns, fullImage string) error {
		setImageCallCount++
		return nil
	}
	d.UIConfirm = func(msg string) bool { return false }

	cfg := defaultConfig()

	err := DeployTicket(d, cfg, "TICKET-100")
	if err != nil {
		t.Errorf("DeployTicket(confirm=false) = %v, want nil", err)
	}
	if setImageCallCount != 0 {
		t.Errorf("KubeSetDeploymentImage called %d times after cancel, want 0", setImageCallCount)
	}
}

// TestDeployTicket_KubeEnsureContextError は KubeEnsureContext エラーが伝播されることを検証する
func TestDeployTicket_KubeEnsureContextError(t *testing.T) {
	t.Helper()

	d := mockDeps()
	d.KubeEnsureContext = func() error { return fmt.Errorf("context error") }

	cfg := defaultConfig()

	err := DeployTicket(d, cfg, "TICKET-100")
	if err == nil {
		t.Error("DeployTicket(context error) = nil, want error")
	}
}

// TestDeployTicket_MultipleServices は複数サービスのデプロイ計画が正しく実行されることを検証する
func TestDeployTicket_MultipleServices(t *testing.T) {
	t.Helper()

	deployedServices := make(map[string]bool)
	d := mockDeps()
	d.GitLabSearchMRsByTicket = func(ticket string) ([]gitlab.MRInfo, error) {
		return []gitlab.MRInfo{
			{
				Service:        "web-frontend",
				SHA:            "abc123def456",
				IID:            100,
				Title:          "TICKET-100: some feature",
				WebURL:         "https://gitlab.example.com/myorg/application/web-frontend/-/merge_requests/100",
				PipelineStatus: "success",
			},
			{
				Service:        "worker",
				SHA:            "def789ghi012",
				IID:            200,
				Title:          "TICKET-100: worker feature",
				WebURL:         "https://gitlab.example.com/myorg/application/worker/-/merge_requests/200",
				PipelineStatus: "success",
			},
		}, nil
	}
	d.KubeSetDeploymentImage = func(svc, ns, fullImage string) error {
		deployedServices[svc] = true
		return nil
	}
	d.UIConfirm = func(msg string) bool { return true }

	cfg := defaultConfig()

	err := DeployTicket(d, cfg, "TICKET-100")
	if err != nil {
		t.Errorf("DeployTicket(multiple services) = %v, want nil", err)
	}
	if !deployedServices["web-frontend"] {
		t.Error("web-frontend service was not deployed")
	}
	if !deployedServices["worker"] {
		t.Error("worker service was not deployed")
	}
}
