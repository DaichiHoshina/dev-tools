package ecr

import (
	"fmt"
	"testing"

	"github.com/user/dev-tools/kube-deploy/internal/config"
)

func TestMakeImageTag(t *testing.T) {
	tests := []struct {
		name     string
		sha      string
		expected string
	}{
		{
			name:     "通常のSHAを渡すとdev-プレフィックスが付く",
			sha:      "abc1234",
			expected: "dev-abc1234",
		},
		{
			name:     "フルSHAを渡してもdev-プレフィックスが付く",
			sha:      "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
			expected: "dev-a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
		},
		{
			name:     "空文字を渡した場合はdev-のみが返る",
			sha:      "",
			expected: "dev-",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := MakeImageTag(tt.sha)
			if got != tt.expected {
				t.Errorf("MakeImageTag(%q) = %q, want %q", tt.sha, got, tt.expected)
			}
		})
	}
}

func TestMakeFullImage(t *testing.T) {
	tests := []struct {
		name     string
		repo     string
		tag      string
		expected string
	}{
		{
			name:     "リポジトリ名とタグからフルURIが生成される",
			repo:     "myapp/api-server",
			tag:      "dev-abc1234",
			expected: fmt.Sprintf("%s/%s:%s", config.ECRRegistry(), "myapp/api-server", "dev-abc1234"),
		},
		{
			name:     "フロントエンドのリポジトリ名とタグからフルURIが生成される",
			repo:     "myapp/web-frontend",
			tag:      "dev-deadbeef",
			expected: fmt.Sprintf("%s/%s:%s", config.ECRRegistry(), "myapp/web-frontend", "dev-deadbeef"),
		},
		{
			name:     "空のリポジトリとタグでもフォーマットが正しい",
			repo:     "",
			tag:      "",
			expected: fmt.Sprintf("%s/:%s", config.ECRRegistry(), ""),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := MakeFullImage(tt.repo, tt.tag)
			if got != tt.expected {
				t.Errorf("MakeFullImage(%q, %q) = %q, want %q", tt.repo, tt.tag, got, tt.expected)
			}
		})
	}
}

func TestMakeFullImageFormat(t *testing.T) {
	t.Run("ECRRegistryを含むフォーマットであること", func(t *testing.T) {
		repo := "myapp/api-server"
		tag := "dev-cafebabe"
		got := MakeFullImage(repo, tag)

		wantPrefix := config.ECRRegistry() + "/"
		if len(got) < len(wantPrefix) || got[:len(wantPrefix)] != wantPrefix {
			t.Errorf("MakeFullImage(%q, %q) = %q, ECRRegistry %q で始まるべき", repo, tag, got, config.ECRRegistry())
		}

		wantContains := repo + ":" + tag
		if got[len(wantPrefix):] != wantContains {
			t.Errorf("MakeFullImage(%q, %q) = %q, %q を含むべき", repo, tag, got, wantContains)
		}
	})
}
