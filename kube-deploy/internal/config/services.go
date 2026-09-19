package config

import (
	"os"
	"sort"
)

// 定数
const (
	RolloutTimeout  = "120s"
	ArgoCDNS        = "argocd"
	ArgoCDLocalPort = 18080
)

// ECRRegistry は環境変数 KUBE_DEPLOY_ECR_REGISTRY から取得する
// 未設定の場合はプレースホルダーを返す
func ECRRegistry() string {
	if v := os.Getenv("KUBE_DEPLOY_ECR_REGISTRY"); v != "" {
		return v
	}
	return "your-account-id.dkr.ecr.your-region.amazonaws.com"
}

// GitLabHost は環境変数 KUBE_DEPLOY_GITLAB_HOST から取得する
func GitLabHost() string {
	if v := os.Getenv("KUBE_DEPLOY_GITLAB_HOST"); v != "" {
		return v
	}
	return "gitlab.example.com"
}

// GitLabGroup は環境変数 KUBE_DEPLOY_GITLAB_GROUP から取得する
const GitLabPerPage = 100

func GitLabGroup() string {
	if v := os.Getenv("KUBE_DEPLOY_GITLAB_GROUP"); v != "" {
		return v
	}
	return "myorg%2Fapplication"
}

// AppPrefix は環境変数 KUBE_DEPLOY_APP_PREFIX から取得する
func AppPrefix() string {
	if v := os.Getenv("KUBE_DEPLOY_APP_PREFIX"); v != "" {
		return v
	}
	return "myapp-dev"
}

// SlackWebhookURL は環境変数 KUBE_DEPLOY_SLACK_WEBHOOK_URL から取得する
func SlackWebhookURL() string {
	return os.Getenv("KUBE_DEPLOY_SLACK_WEBHOOK_URL")
}

// KubeContexts は有効な kubectl context 名の一覧
// 環境変数 KUBE_DEPLOY_KUBE_CONTEXT でカンマ区切りリストとして指定可能
var KubeContexts = func() []string {
	if v := os.Getenv("KUBE_DEPLOY_KUBE_CONTEXT"); v != "" {
		// カンマ区切りで複数指定可能
		var contexts []string
		for _, c := range splitComma(v) {
			if c != "" {
				contexts = append(contexts, c)
			}
		}
		if len(contexts) > 0 {
			return contexts
		}
	}
	return []string{"my-cluster-dev"}
}()

func splitComma(s string) []string {
	var result []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == ',' {
			result = append(result, s[start:i])
			start = i + 1
		}
	}
	result = append(result, s[start:])
	return result
}

// ServiceNamespace: サービス名 → Kubernetes namespace
// 実際のサービスは設定ファイルまたは環境変数で上書き可能
// デフォルトはサンプルサービス定義
var ServiceNamespace = map[string]string{
	"api-server":   "backend",
	"web-frontend": "frontend",
	"worker":       "backend",
	"scheduler":    "backend",
}

// ServiceECRRepo: サービス名 → ECRリポジトリ名
var ServiceECRRepo = map[string]string{
	"api-server":   "myapp/api-server",
	"web-frontend": "myapp/web-frontend",
	"worker":       "myapp/worker",
	"scheduler":    "myapp/scheduler",
}

// ServiceGitLabProject: サービス名 → GitLabプロジェクトパス
var ServiceGitLabProject = map[string]string{
	"api-server":   "myorg/application/api-server",
	"web-frontend": "myorg/application/web-frontend",
	"worker":       "myorg/application/worker",
	"scheduler":    "myorg/application/scheduler",
}

// GitLabToService: GitLabプロジェクトパス → サービス名（逆引き）
var GitLabToService = make(map[string]string)

func init() {
	for svc, proj := range ServiceGitLabProject {
		GitLabToService[proj] = svc
	}
}

// IsValidService はサービス名が既知かどうかを返す
func IsValidService(svc string) bool {
	_, ok := ServiceNamespace[svc]
	return ok
}

// ListServices は全サービス名をソートして返す
func ListServices() []string {
	svcs := make([]string, 0, len(ServiceNamespace))
	for svc := range ServiceNamespace {
		svcs = append(svcs, svc)
	}
	sort.Strings(svcs)
	return svcs
}
