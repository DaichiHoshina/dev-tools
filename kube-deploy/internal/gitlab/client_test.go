package gitlab

import (
	"testing"
)

// assertNoError はエラーが nil であることを検証するヘルパー
func assertNoError(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// assertError はエラーが nil でないことを検証するヘルパー
func assertError(t *testing.T, err error) {
	t.Helper()
	if err == nil {
		t.Fatal("expected error, but got nil")
	}
}

func TestParseMRURL(t *testing.T) {
	tests := []struct {
		name            string
		mrURL           string
		wantProjectPath string
		wantIID         int
		wantErr         bool
	}{
		{
			name:            "正常系: マイクロサービスのMR URL",
			mrURL:           "https://gitlab.example.com/myorg/application/api-server/-/merge_requests/123",
			wantProjectPath: "myorg/application/api-server",
			wantIID:         123,
			wantErr:         false,
		},
		{
			name:            "正常系: フロントエンドのMR URL",
			mrURL:           "https://gitlab.example.com/myorg/application/web-frontend/-/merge_requests/456",
			wantProjectPath: "myorg/application/web-frontend",
			wantIID:         456,
			wantErr:         false,
		},
		{
			name:            "正常系: IID が1桁",
			mrURL:           "https://gitlab.example.com/myorg/application/worker/-/merge_requests/1",
			wantProjectPath: "myorg/application/worker",
			wantIID:         1,
			wantErr:         false,
		},
		{
			name:            "正常系: IID が大きな数値",
			mrURL:           "https://gitlab.example.com/myorg/application/scheduler/-/merge_requests/9999",
			wantProjectPath: "myorg/application/scheduler",
			wantIID:         9999,
			wantErr:         false,
		},
		{
			name:            "正常系: ネストが深いプロジェクトパス",
			mrURL:           "https://gitlab.example.com/group/sub/deep/project/-/merge_requests/10",
			wantProjectPath: "group/sub/deep/project",
			wantIID:         10,
			wantErr:         false,
		},
		{
			name:    "異常系: 空文字列",
			mrURL:   "",
			wantErr: true,
		},
		{
			name:    "異常系: 不正なURL（merge_requests を含まない）",
			mrURL:   "https://gitlab.example.com/myorg/application/api-server",
			wantErr: true,
		},
		{
			name:    "異常系: /-/ がないURL",
			mrURL:   "https://gitlab.example.com/myorg/application/api-server/merge_requests/123",
			wantErr: true,
		},
		{
			name:    "異常系: MR番号なし",
			mrURL:   "https://gitlab.example.com/myorg/application/api-server/-/merge_requests/",
			wantErr: true,
		},
		{
			name:    "異常系: 全く関係ないURL",
			mrURL:   "https://example.com/foo/bar",
			wantErr: true,
		},
		{
			name:    "異常系: プレーンテキスト",
			mrURL:   "not-a-url",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotProjectPath, gotIID, err := parseMRURL(tt.mrURL)

			if tt.wantErr {
				assertError(t, err)
				return
			}

			assertNoError(t, err)

			if gotProjectPath != tt.wantProjectPath {
				t.Errorf("projectPath: got %q, want %q", gotProjectPath, tt.wantProjectPath)
			}
			if gotIID != tt.wantIID {
				t.Errorf("iid: got %d, want %d", gotIID, tt.wantIID)
			}
		})
	}
}

func TestParseMRURL_Public(t *testing.T) {
	// ParseMRURL は parseMRURL への委譲であることを確認する
	tests := []struct {
		name            string
		mrURL           string
		wantProjectPath string
		wantIID         int
		wantErr         bool
	}{
		{
			name:            "正常系: 公開APIで同じ結果を返す",
			mrURL:           "https://gitlab.example.com/myorg/application/api-server/-/merge_requests/123",
			wantProjectPath: "myorg/application/api-server",
			wantIID:         123,
			wantErr:         false,
		},
		{
			name:    "異常系: 不正URL",
			mrURL:   "invalid",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotProjectPath, gotIID, err := ParseMRURL(tt.mrURL)

			if tt.wantErr {
				assertError(t, err)
				return
			}

			assertNoError(t, err)

			if gotProjectPath != tt.wantProjectPath {
				t.Errorf("projectPath: got %q, want %q", gotProjectPath, tt.wantProjectPath)
			}
			if gotIID != tt.wantIID {
				t.Errorf("iid: got %d, want %d", gotIID, tt.wantIID)
			}
		})
	}
}

func TestParseMRURL_ConsistencyWithPublic(t *testing.T) {
	// ParseMRURL と parseMRURL が常に同じ結果を返すことを確認する
	mrURL := "https://gitlab.example.com/myorg/application/api-server/-/merge_requests/42"

	privateProjectPath, privateIID, privateErr := parseMRURL(mrURL)
	publicProjectPath, publicIID, publicErr := ParseMRURL(mrURL)

	if privateErr != nil || publicErr != nil {
		t.Fatalf("unexpected errors: private=%v, public=%v", privateErr, publicErr)
	}
	if privateProjectPath != publicProjectPath {
		t.Errorf("projectPath mismatch: private=%q, public=%q", privateProjectPath, publicProjectPath)
	}
	if privateIID != publicIID {
		t.Errorf("iid mismatch: private=%d, public=%d", privateIID, publicIID)
	}
}

func TestExtractProjectPath(t *testing.T) {
	tests := []struct {
		name    string
		webURL  string
		wantOut string
	}{
		{
			name:    "正常系: マイクロサービスのMR URL",
			webURL:  "https://gitlab.example.com/myorg/application/api-server/-/merge_requests/123",
			wantOut: "myorg/application/api-server",
		},
		{
			name:    "正常系: フロントエンドのMR URL",
			webURL:  "https://gitlab.example.com/myorg/application/web-frontend/-/merge_requests/456",
			wantOut: "myorg/application/web-frontend",
		},
		{
			name:    "正常系: 別のGitLabパス（/-/ を含む）",
			webURL:  "https://gitlab.example.com/myorg/application/worker/-/issues/10",
			wantOut: "myorg/application/worker",
		},
		{
			name:    "正常系: ネストが浅いプロジェクト",
			webURL:  "https://gitlab.example.com/group/project/-/merge_requests/1",
			wantOut: "group/project",
		},
		{
			name:    "正常系: /-/ を含まないURL（プレフィックス除去のみ）",
			webURL:  "https://gitlab.example.com/myorg/application/api-server",
			wantOut: "myorg/application/api-server",
		},
		{
			// ホストが GitLabHost と異なる場合は TrimPrefix が効かずURLがそのまま trimmed に入るが、
			// /-/ が存在するため /-/ より前の部分が返される
			name:    "正常系: ホストが異なるURL（/-/より前の部分が返される）",
			webURL:  "https://other-gitlab.example.com/myorg/application/api-server/-/merge_requests/1",
			wantOut: "https://other-gitlab.example.com/myorg/application/api-server",
		},
		{
			name:    "正常系: 空文字列",
			webURL:  "",
			wantOut: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractProjectPath(tt.webURL)
			if got != tt.wantOut {
				t.Errorf("got %q, want %q", got, tt.wantOut)
			}
		})
	}
}
