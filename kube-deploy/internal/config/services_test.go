package config

import (
	"sort"
	"testing"
)

func TestIsValidService(t *testing.T) {
	t.Helper()

	validServices := ListServices()

	tests := []struct {
		name     string
		input    string
		expected bool
	}{
		{
			name:     "空文字は無効",
			input:    "",
			expected: false,
		},
		{
			name:     "大文字のサービス名は無効",
			input:    "FRONTEND",
			expected: false,
		},
		{
			name:     "存在しないサービス名は無効",
			input:    "unknown",
			expected: false,
		},
		{
			name:     "存在しないサービス名（ハイフンあり）は無効",
			input:    "no-such-service",
			expected: false,
		},
	}

	// 実際のサービス名はすべて true になること
	for _, svc := range validServices {
		tests = append(tests, struct {
			name     string
			input    string
			expected bool
		}{
			name:     "有効なサービス名: " + svc,
			input:    svc,
			expected: true,
		})
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsValidService(tt.input)
			if got != tt.expected {
				t.Errorf("IsValidService(%q) = %v, want %v", tt.input, got, tt.expected)
			}
		})
	}
}

func TestListServices(t *testing.T) {
	t.Run("空でないこと", func(t *testing.T) {
		svcs := ListServices()
		if len(svcs) == 0 {
			t.Error("ListServices() は空のスライスを返すべきでない")
		}
	})

	t.Run("ソート済みであること", func(t *testing.T) {
		svcs := ListServices()
		if !sort.StringsAreSorted(svcs) {
			t.Errorf("ListServices() の返却値がソートされていない: %v", svcs)
		}
	})

	t.Run("重複がないこと", func(t *testing.T) {
		svcs := ListServices()
		seen := make(map[string]struct{}, len(svcs))
		for _, svc := range svcs {
			if _, exists := seen[svc]; exists {
				t.Errorf("ListServices() に重複した要素が含まれている: %q", svc)
			}
			seen[svc] = struct{}{}
		}
	})

	t.Run("要素数がServiceNamespaceと一致すること", func(t *testing.T) {
		svcs := ListServices()
		if len(svcs) != len(ServiceNamespace) {
			t.Errorf("ListServices() の要素数 = %d, ServiceNamespace の要素数 = %d", len(svcs), len(ServiceNamespace))
		}
	})

	t.Run("全要素がIsValidServiceでtrueを返すこと", func(t *testing.T) {
		for _, svc := range ListServices() {
			if !IsValidService(svc) {
				t.Errorf("ListServices() の要素 %q が IsValidService で false を返した", svc)
			}
		}
	})
}
