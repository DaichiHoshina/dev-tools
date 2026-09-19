package deploy

import (
	"fmt"
	"testing"

	"github.com/user/dev-tools/kube-deploy/internal/gitlab"
)

// 有効なMR URL（config.GitLabToServiceに存在するプロジェクトパス）
const validMRURL = "https://gitlab.example.com/myorg/application/web-frontend/-/merge_requests/100"

// TestDeployMRURL_InvalidURL は不正なMR URLでエラーを返すことを検証する
func TestDeployMRURL_InvalidURL(t *testing.T) {
	t.Helper()

	tests := []struct {
		name  string
		mrURL string
	}{
		{
			name:  "空文字列はパースエラー",
			mrURL: "",
		},
		{
			name:  "不正なURL形式はパースエラー",
			mrURL: "not-a-url",
		},
		{
			name:  "MR番号のないURLはパースエラー",
			mrURL: "https://gitlab.example.com/myorg/project",
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			d := mockDeps()
			cfg := defaultConfig()

			err := DeployMRURL(d, cfg, tt.mrURL)
			if err == nil {
				t.Errorf("DeployMRURL(%q) = nil, want error", tt.mrURL)
			}
		})
	}
}

// TestDeployMRURL_UnknownProject は不明なプロジェクトURLでエラーを返すことを検証する
func TestDeployMRURL_UnknownProject(t *testing.T) {
	t.Helper()

	unknownURL := "https://gitlab.example.com/unknown/project/-/merge_requests/1"

	d := mockDeps()
	cfg := defaultConfig()

	err := DeployMRURL(d, cfg, unknownURL)
	if err == nil {
		t.Errorf("DeployMRURL(unknown project) = nil, want error")
	}
}

// TestDeployMRURL_DryRun は DryRun=true でデプロイが実行されないことを検証する
func TestDeployMRURL_DryRun(t *testing.T) {
	t.Helper()

	setImageCallCount := 0
	d := mockDeps()
	d.GitLabGetMR = func(mrURL string) (gitlab.MRInfo, error) {
		return gitlab.MRInfo{
			SHA:            "abc123def456",
			IID:            100,
			Title:          "TICKET-100: some feature",
			PipelineStatus: "success",
		}, nil
	}
	d.KubeSetDeploymentImage = func(svc, ns, fullImage string) error {
		setImageCallCount++
		return nil
	}

	cfg := defaultConfig()
	cfg.DryRun = true

	err := DeployMRURL(d, cfg, validMRURL)
	if err != nil {
		t.Errorf("DeployMRURL(dryrun) = %v, want nil", err)
	}
	if setImageCallCount != 0 {
		t.Errorf("KubeSetDeploymentImage called %d times in dry-run, want 0", setImageCallCount)
	}
}

// TestDeployMRURL_PipelineFailed はパイプライン失敗の場合エラーを返すことを検証する
func TestDeployMRURL_PipelineFailed(t *testing.T) {
	t.Helper()

	d := mockDeps()
	d.GitLabGetMR = func(mrURL string) (gitlab.MRInfo, error) {
		return gitlab.MRInfo{
			SHA:            "abc123def456",
			IID:            100,
			Title:          "TICKET-100: some feature",
			PipelineStatus: "failed",
		}, nil
	}

	cfg := defaultConfig()

	err := DeployMRURL(d, cfg, validMRURL)
	if err == nil {
		t.Error("DeployMRURL(pipeline failed) = nil, want error")
	}
}

// TestDeployMRURL_PipelineRunning はパイプライン実行中の場合エラーを返すことを検証する
func TestDeployMRURL_PipelineRunning(t *testing.T) {
	t.Helper()

	tests := []struct {
		name   string
		status string
	}{
		{"running", "running"},
		{"pending", "pending"},
		{"created", "created"},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			d := mockDeps()
			d.GitLabGetMR = func(mrURL string) (gitlab.MRInfo, error) {
				return gitlab.MRInfo{
					SHA:            "abc123def456",
					IID:            100,
					Title:          "TICKET-100: some feature",
					PipelineStatus: tt.status,
				}, nil
			}

			cfg := defaultConfig()

			err := DeployMRURL(d, cfg, validMRURL)
			if err == nil {
				t.Errorf("DeployMRURL(pipeline %s) = nil, want error", tt.status)
			}
		})
	}
}

// TestDeployMRURL_UIConfirmTrue は UIConfirm=true でデプロイが実行されることを検証する
func TestDeployMRURL_UIConfirmTrue(t *testing.T) {
	t.Helper()

	setImageCallCount := 0
	d := mockDeps()
	d.GitLabGetMR = func(mrURL string) (gitlab.MRInfo, error) {
		return gitlab.MRInfo{
			SHA:            "abc123def456",
			IID:            100,
			Title:          "TICKET-100: some feature",
			PipelineStatus: "success",
		}, nil
	}
	d.KubeSetDeploymentImage = func(svc, ns, fullImage string) error {
		setImageCallCount++
		return nil
	}
	d.UIConfirm = func(msg string) bool { return true }

	cfg := defaultConfig()

	err := DeployMRURL(d, cfg, validMRURL)
	if err != nil {
		t.Errorf("DeployMRURL(confirm=true) = %v, want nil", err)
	}
	if setImageCallCount != 1 {
		t.Errorf("KubeSetDeploymentImage called %d times, want 1", setImageCallCount)
	}
}

// TestDeployMRURL_UIConfirmFalse は UIConfirm=false でキャンセルされることを検証する
func TestDeployMRURL_UIConfirmFalse(t *testing.T) {
	t.Helper()

	setImageCallCount := 0
	d := mockDeps()
	d.GitLabGetMR = func(mrURL string) (gitlab.MRInfo, error) {
		return gitlab.MRInfo{
			SHA:            "abc123def456",
			IID:            100,
			Title:          "TICKET-100: some feature",
			PipelineStatus: "success",
		}, nil
	}
	d.KubeSetDeploymentImage = func(svc, ns, fullImage string) error {
		setImageCallCount++
		return nil
	}
	d.UIConfirm = func(msg string) bool { return false }

	cfg := defaultConfig()

	err := DeployMRURL(d, cfg, validMRURL)
	if err != nil {
		t.Errorf("DeployMRURL(confirm=false) = %v, want nil", err)
	}
	if setImageCallCount != 0 {
		t.Errorf("KubeSetDeploymentImage called %d times after cancel, want 0", setImageCallCount)
	}
}

// TestDeployMRURL_GitLabGetMRError は GitLabGetMR エラーが伝播されることを検証する
func TestDeployMRURL_GitLabGetMRError(t *testing.T) {
	t.Helper()

	d := mockDeps()
	d.GitLabGetMR = func(mrURL string) (gitlab.MRInfo, error) {
		return gitlab.MRInfo{}, fmt.Errorf("API error")
	}

	cfg := defaultConfig()

	err := DeployMRURL(d, cfg, validMRURL)
	if err == nil {
		t.Error("DeployMRURL(gitlab API error) = nil, want error")
	}
}

// TestDeployMRURL_KubeEnsureContextError は KubeEnsureContext エラーが伝播されることを検証する
func TestDeployMRURL_KubeEnsureContextError(t *testing.T) {
	t.Helper()

	d := mockDeps()
	d.KubeEnsureContext = func() error { return fmt.Errorf("context error") }

	cfg := defaultConfig()

	err := DeployMRURL(d, cfg, validMRURL)
	if err == nil {
		t.Error("DeployMRURL(context error) = nil, want error")
	}
}
