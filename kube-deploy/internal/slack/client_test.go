package slack

import (
	"strings"
	"testing"
)

func TestFormatMessage(t *testing.T) {
	t.Helper()

	tests := []struct {
		name   string
		result DeployResult
		checks []func(t *testing.T, msg string)
	}{
		{
			name: "1件: サービス名がタイトルに含まれる",
			result: DeployResult{
				Ticket: "TICKET-001",
				Entries: []DeployResultEntry{
					{Service: "api", Tag: "v1.0.0", PreviousTag: "v0.9.0", MRUrl: ""},
				},
			},
			checks: []func(t *testing.T, msg string){
				func(t *testing.T, msg string) {
					t.Helper()
					if !strings.Contains(msg, ":rocket:") {
						t.Errorf(":rocket: prefix が含まれていない: %q", msg)
					}
				},
				func(t *testing.T, msg string) {
					t.Helper()
					if !strings.Contains(msg, "api のイメージを書き換えました") {
						t.Errorf("サービス名タイトルが含まれていない: %q", msg)
					}
				},
			},
		},
		{
			name: "サービスのPreviousTag → Tag形式エントリ行が含まれる",
			result: DeployResult{
				Ticket: "TICKET-002",
				Entries: []DeployResultEntry{
					{Service: "backend", Tag: "v2.0.0", PreviousTag: "v1.9.0", MRUrl: ""},
				},
			},
			checks: []func(t *testing.T, msg string){
				func(t *testing.T, msg string) {
					t.Helper()
					if !strings.Contains(msg, "backend") {
						t.Errorf("サービス名 backend が含まれていない: %q", msg)
					}
				},
				func(t *testing.T, msg string) {
					t.Helper()
					if !strings.Contains(msg, "`v1.9.0`") {
						t.Errorf("PreviousTag v1.9.0 が含まれていない: %q", msg)
					}
				},
				func(t *testing.T, msg string) {
					t.Helper()
					if !strings.Contains(msg, "`v2.0.0`") {
						t.Errorf("Tag v2.0.0 が含まれていない: %q", msg)
					}
				},
				func(t *testing.T, msg string) {
					t.Helper()
					if !strings.Contains(msg, "→") {
						t.Errorf("→ 区切り文字が含まれていない: %q", msg)
					}
				},
			},
		},
		{
			name: "MR URLがある場合はSlackリンク形式が含まれる",
			result: DeployResult{
				Ticket: "TICKET-003",
				Entries: []DeployResultEntry{
					{
						Service:     "frontend",
						Tag:         "v3.0.0",
						PreviousTag: "v2.9.0",
						MRUrl:       "https://gitlab.example.com/org/repo/-/merge_requests/42",
					},
				},
			},
			checks: []func(t *testing.T, msg string){
				func(t *testing.T, msg string) {
					t.Helper()
					expected := "<https://gitlab.example.com/org/repo/-/merge_requests/42|!42>"
					if !strings.Contains(msg, expected) {
						t.Errorf("Slackリンク形式 %q が含まれていない: %q", expected, msg)
					}
				},
			},
		},
		{
			name: "MR URLが'manual'の場合はリンクが含まれない",
			result: DeployResult{
				Ticket: "TICKET-004",
				Entries: []DeployResultEntry{
					{
						Service:     "worker",
						Tag:         "v4.0.0",
						PreviousTag: "v3.9.0",
						MRUrl:       "manual",
					},
				},
			},
			checks: []func(t *testing.T, msg string){
				func(t *testing.T, msg string) {
					t.Helper()
					if strings.Contains(msg, "<") && strings.Contains(msg, "|!") {
						t.Errorf("MRUrl が 'manual' のときはSlackリンクが含まれるべきでない: %q", msg)
					}
				},
				func(t *testing.T, msg string) {
					t.Helper()
					if strings.Contains(msg, "manual") {
						t.Errorf("MRUrl の文字列 'manual' がメッセージに含まれるべきでない: %q", msg)
					}
				},
			},
		},
		{
			name: "Userが空の場合は_by:_行がない",
			result: DeployResult{
				Ticket: "TICKET-005",
				Entries: []DeployResultEntry{
					{Service: "api", Tag: "v1.0.0", PreviousTag: "v0.9.0"},
				},
				User: "",
			},
			checks: []func(t *testing.T, msg string){
				func(t *testing.T, msg string) {
					t.Helper()
					if strings.Contains(msg, "_by:") {
						t.Errorf("User が空のとき _by: 行は含まれるべきでない: %q", msg)
					}
				},
			},
		},
		{
			name: "Userがある場合は_by: username_行がある",
			result: DeployResult{
				Ticket: "TICKET-006",
				Entries: []DeployResultEntry{
					{Service: "api", Tag: "v1.0.0", PreviousTag: "v0.9.0"},
				},
				User: "testuser",
			},
			checks: []func(t *testing.T, msg string){
				func(t *testing.T, msg string) {
					t.Helper()
					expected := "_by: testuser_"
					if !strings.Contains(msg, expected) {
						t.Errorf("_by: testuser_ が含まれていない: %q", msg)
					}
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			msg := formatMessage(tt.result)
			for _, check := range tt.checks {
				check(t, msg)
			}
		})
	}
}

func TestTruncateTag(t *testing.T) {
	t.Helper()

	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "20文字以下はそのまま返す（境界値: 20文字）",
			input: "12345678901234567890",
			want:  "12345678901234567890",
		},
		{
			name:  "20文字以下はそのまま返す（1文字）",
			input: "a",
			want:  "a",
		},
		{
			name:  "20文字以下はそのまま返す（空文字）",
			input: "",
			want:  "",
		},
		{
			name:  "21文字以上は先頭20文字+'...'を返す（境界値: 21文字）",
			input: "123456789012345678901",
			want:  "12345678901234567890...",
		},
		{
			name:  "21文字以上は先頭20文字+'...'を返す（長い文字列）",
			input: "abcdefghijklmnopqrstuvwxyz",
			want:  "abcdefghijklmnopqrst...",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := truncateTag(tt.input)
			if got != tt.want {
				t.Errorf("truncateTag(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}
