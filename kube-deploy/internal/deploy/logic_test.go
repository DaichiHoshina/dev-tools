package deploy

import (
	"strings"
	"testing"
)

// checkPipelineDeployable のテスト
func TestCheckPipelineDeployable(t *testing.T) {
	t.Helper()

	tests := []struct {
		name       string
		status     string
		wantDeploy bool
	}{
		{"success はデプロイ可能", "success", true},
		{"running はデプロイ不可", "running", false},
		{"pending はデプロイ不可", "pending", false},
		{"created はデプロイ不可", "created", false},
		{"preparing はデプロイ不可", "preparing", false},
		{"waiting_for_resource はデプロイ不可", "waiting_for_resource", false},
		{"failed はデプロイ不可", "failed", false},
		{"canceled はデプロイ不可", "canceled", false},
		{"空文字列はデフォルトでデプロイ試行", "", true},
		{"unknown はデフォルトでデプロイ試行", "unknown", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := checkPipelineDeployable("test-svc", tt.status, "")
			if got != tt.wantDeploy {
				t.Errorf("checkPipelineDeployable(svc, %q, %q) = %v, want %v",
					tt.status, "", got, tt.wantDeploy)
			}
		})
	}
}

func TestCheckPipelineDeployable_WithPipelineURL(t *testing.T) {
	tests := []struct {
		name       string
		status     string
		wantDeploy bool
	}{
		{"success with URL", "success", true},
		{"failed with URL", "failed", false},
		{"running with URL", "running", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := checkPipelineDeployable("test-svc", tt.status, "https://example.com/pipelines/1")
			if got != tt.wantDeploy {
				t.Errorf("checkPipelineDeployable(svc, %q, url) = %v, want %v",
					tt.status, got, tt.wantDeploy)
			}
		})
	}
}

// truncate のテスト
func TestTruncate(t *testing.T) {
	t.Helper()

	tests := []struct {
		name string
		s    string
		n    int
		want string
	}{
		{"n以下の長さはそのまま返す", "hello", 5, "hello"},
		{"n未満の長さはそのまま返す", "hi", 10, "hi"},
		{"空文字列はそのまま返す", "", 5, ""},
		{"n超えの長さはn文字に切り詰める", "hello world", 5, "hello"},
		{"n=1 のとき先頭1文字のみ返す", "abcdef", 1, "a"},
		{"コミットSHAを20文字に切り詰める", "abc123def456abc123def456", 20, "abc123def456abc123de"},
		{"n=0 のとき空文字列を返す", "nonempty", 0, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := truncate(tt.s, tt.n)
			if got != tt.want {
				t.Errorf("truncate(%q, %d) = %q, want %q", tt.s, tt.n, got, tt.want)
			}
		})
	}
}

// joinServices のテスト
func TestJoinServices(t *testing.T) {
	t.Helper()

	got := joinServices()

	if got == "" {
		t.Error("joinServices() = empty string, want non-empty")
	}

	knownServices := []string{"api-server", "web-frontend", "worker"}
	for _, svc := range knownServices {
		if !strings.Contains(got, svc) {
			t.Errorf("joinServices() = %q, want to contain %q", got, svc)
		}
	}

	parts := strings.Fields(got)
	if len(parts) < 2 {
		t.Errorf("joinServices() = %q, expected multiple services separated by spaces, got %d part(s)", got, len(parts))
	}

	if got != strings.TrimSpace(got) {
		t.Errorf("joinServices() = %q, should not have leading/trailing spaces", got)
	}
}
