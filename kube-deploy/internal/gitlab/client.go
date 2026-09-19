package gitlab

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"gopkg.in/yaml.v3"

	"github.com/user/dev-tools/kube-deploy/internal/config"
	"github.com/user/dev-tools/kube-deploy/internal/ui"
)

var (
	ticketRe = regexp.MustCompile(`[A-Z]+-\d+`)
	mrURLRe  = regexp.MustCompile(`^https?://[^/]+/(.+)/-/merge_requests/(\d+)`)

	cachedUsername string
	usernameOnce   sync.Once
)

// MRInfo はサービスにマッピングされた MR 情報
type MRInfo struct {
	Service        string
	SHA            string
	IID            int
	Title          string
	WebURL         string
	ProjectPath    string
	PipelineStatus string
	PipelineWebURL string
	Author         string
}

// glabConfig は glab の設定ファイル構造
type glabConfig struct {
	Hosts map[string]struct {
		Token string `yaml:"token"`
	} `yaml:"hosts"`
}

// ReadToken は glab の設定ファイルまたは環境変数からトークンを取得する
func ReadToken() (string, error) {
	// 環境変数を優先
	for _, key := range []string{"GITLAB_TOKEN", "GITLAB_PRIVATE_TOKEN", "GITLAB_PERSONAL_ACCESS_TOKEN"} {
		if token := os.Getenv(key); token != "" {
			return token, nil
		}
	}

	// glab 設定ファイルから読む（XDG / macOS両対応）
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("ホームディレクトリ取得失敗: %w", err)
	}
	candidates := []string{
		filepath.Join(home, ".config", "glab-cli", "config.yml"),
		filepath.Join(home, "Library", "Application Support", "glab-cli", "config.yml"),
	}
	var data []byte
	for _, p := range candidates {
		if d, err := os.ReadFile(p); err == nil {
			data = d
			break
		}
	}
	if data == nil {
		return "", fmt.Errorf("glab 設定ファイルが見つかりません: %s\n"+
			"  glab auth login --hostname %s で認証してください",
			strings.Join(candidates, " or "), config.GitLabHost())
	}

	var cfg glabConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return "", fmt.Errorf("glab 設定ファイルのパース失敗: %w", err)
	}
	host, ok := cfg.Hosts[config.GitLabHost()]
	if !ok || host.Token == "" {
		return "", fmt.Errorf("glab に %s のトークンがありません\n"+
			"  glab auth login --hostname %s で認証してください",
			config.GitLabHost(), config.GitLabHost())
	}
	return host.Token, nil
}

// apiGet は GitLab API に GET リクエストを送る
func apiGet(token, path string, params url.Values) ([]byte, error) {
	apiURL := fmt.Sprintf("https://%s/api/v4%s", config.GitLabHost(), path)
	if len(params) > 0 {
		apiURL += "?" + params.Encode()
	}
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("PRIVATE-TOKEN", token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("GitLab API リクエスト失敗: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		switch resp.StatusCode {
		case 401:
			return nil, fmt.Errorf("GitLab API 認証エラー (HTTP 401): トークンが無効または期限切れです\n  → glab auth login --hostname %s で再認証してください", config.GitLabHost())
		case 403:
			return nil, fmt.Errorf("GitLab API 権限エラー (HTTP 403): このリソースへのアクセス権がありません\n  → トークンに api スコープがあるか確認してください")
		case 404:
			return nil, fmt.Errorf("GitLab API エラー (HTTP 404): リソースが見つかりません\n  → URLが正しいか、プロジェクトへのアクセス権があるか確認してください")
		default:
			return nil, fmt.Errorf("GitLab API エラー (HTTP %d): %s", resp.StatusCode, string(body))
		}
	}
	return body, nil
}

// CurrentUsername は認証済みユーザーの GitLab ユーザー名を返す（結果をキャッシュ）
func CurrentUsername() string {
	usernameOnce.Do(func() {
		token, err := ReadToken()
		if err != nil {
			return
		}
		body, err := apiGet(token, "/user", nil)
		if err != nil {
			return
		}
		var user struct {
			Username string `json:"username"`
		}
		if err := json.Unmarshal(body, &user); err != nil {
			return
		}
		cachedUsername = user.Username
	})
	return cachedUsername
}

// SearchMRsByTicket はチケット番号に関連するオープン MR を検索し、サービスにマッピングして返す
func SearchMRsByTicket(ticket string) ([]MRInfo, error) {
	token, err := ReadToken()
	if err != nil {
		return nil, err
	}

	params := url.Values{
		"state":             {"opened"},
		"search":            {ticket},
		"per_page":          {fmt.Sprintf("%d", config.GitLabPerPage)},
		"include_subgroups": {"true"},
	}
	body, err := apiGet(token, "/groups/"+config.GitLabGroup()+"/merge_requests", params)
	if err != nil {
		return nil, fmt.Errorf("MR 検索失敗: %w", err)
	}

	var rawMRs []struct {
		SHA          string `json:"sha"`
		IID          int    `json:"iid"`
		Title        string `json:"title"`
		WebURL       string `json:"web_url"`
		SourceBranch string `json:"source_branch"`
		HeadPipeline *struct {
			Status string `json:"status"`
			WebURL string `json:"web_url"`
		} `json:"head_pipeline"`
		Pipeline *struct {
			Status string `json:"status"`
			WebURL string `json:"web_url"`
		} `json:"pipeline"`
		Author *struct {
			Username string `json:"username"`
		} `json:"author"`
	}
	if err := json.Unmarshal(body, &rawMRs); err != nil {
		return nil, fmt.Errorf("MR レスポンスのパース失敗: %w", err)
	}

	ticketRe := regexp.MustCompile(`(?i)` + regexp.QuoteMeta(ticket))
	var results []MRInfo

	for _, mr := range rawMRs {
		// ブランチ名またはタイトルにチケット番号を含むものだけ抽出
		if !ticketRe.MatchString(mr.SourceBranch) && !ticketRe.MatchString(mr.Title) {
			continue
		}

		projectPath := extractProjectPath(mr.WebURL)
		svc, ok := config.GitLabToService[projectPath]
		if !ok {
			ui.Warn("不明なプロジェクト（スキップ）: " + projectPath)
			continue
		}

		pipelineStatus := "unknown"
		pipelineWebURL := ""
		if mr.HeadPipeline != nil && mr.HeadPipeline.Status != "" {
			pipelineStatus = mr.HeadPipeline.Status
			pipelineWebURL = mr.HeadPipeline.WebURL
		} else if mr.Pipeline != nil && mr.Pipeline.Status != "" {
			pipelineStatus = mr.Pipeline.Status
			pipelineWebURL = mr.Pipeline.WebURL
		}

		author := ""
		if mr.Author != nil {
			author = mr.Author.Username
		}

		results = append(results, MRInfo{
			Service:        svc,
			SHA:            mr.SHA,
			IID:            mr.IID,
			Title:          mr.Title,
			WebURL:         mr.WebURL,
			ProjectPath:    projectPath,
			PipelineStatus: pipelineStatus,
			PipelineWebURL: pipelineWebURL,
			Author:         author,
		})
	}
	return results, nil
}

// GetMR は MR URL からプロジェクトパスと IID を解析し、MR 情報を取得する
func GetMR(mrURL string) (MRInfo, error) {
	projectPath, iid, err := parseMRURL(mrURL)
	if err != nil {
		return MRInfo{}, err
	}

	token, err := ReadToken()
	if err != nil {
		return MRInfo{}, err
	}

	encodedPath := url.PathEscape(projectPath)
	// GitLab は %2F を含むパスを /api/v4/projects/{encoded}/merge_requests/{iid} で受け付ける
	body, err := apiGet(token, fmt.Sprintf("/projects/%s/merge_requests/%d", encodedPath, iid), nil)
	if err != nil {
		return MRInfo{}, fmt.Errorf("MR 情報の取得失敗: %w", err)
	}

	var mr struct {
		SHA          string `json:"sha"`
		IID          int    `json:"iid"`
		Title        string `json:"title"`
		HeadPipeline *struct {
			Status string `json:"status"`
			WebURL string `json:"web_url"`
		} `json:"head_pipeline"`
		Pipeline *struct {
			Status string `json:"status"`
			WebURL string `json:"web_url"`
		} `json:"pipeline"`
		Author *struct {
			Username string `json:"username"`
		} `json:"author"`
		SourceBranch string `json:"source_branch"`
	}
	if err := json.Unmarshal(body, &mr); err != nil {
		return MRInfo{}, fmt.Errorf("MR レスポンスのパース失敗: %w", err)
	}

	pipelineStatus := "unknown"
	pipelineWebURL := ""
	if mr.HeadPipeline != nil && mr.HeadPipeline.Status != "" {
		pipelineStatus = mr.HeadPipeline.Status
		pipelineWebURL = mr.HeadPipeline.WebURL
	} else if mr.Pipeline != nil && mr.Pipeline.Status != "" {
		pipelineStatus = mr.Pipeline.Status
		pipelineWebURL = mr.Pipeline.WebURL
	}

	author := ""
	if mr.Author != nil {
		author = mr.Author.Username
	}

	// ブランチ名またはタイトルからチケット番号を抽出
	ticket := ticketRe.FindString(mr.SourceBranch)
	if ticket == "" {
		ticket = ticketRe.FindString(mr.Title)
	}
	if ticket == "" {
		ticket = fmt.Sprintf("MR-%d", iid)
	}

	svc := config.GitLabToService[projectPath]

	return MRInfo{
		Service:        svc,
		SHA:            mr.SHA,
		IID:            iid,
		Title:          mr.Title,
		WebURL:         mrURL,
		ProjectPath:    projectPath,
		PipelineStatus: pipelineStatus,
		PipelineWebURL: pipelineWebURL,
		Author:         author,
	}, nil
}

// CommitInfo はコミットの基本情報
type CommitInfo struct {
	AuthorName string
	AuthoredAt string // ISO8601
}

// GetCommitInfo はプロジェクトのコミットSHAから著者・日時を取得する
func GetCommitInfo(projectPath, sha string) (CommitInfo, error) {
	token, err := ReadToken()
	if err != nil {
		return CommitInfo{}, err
	}

	encodedPath := url.PathEscape(projectPath)
	body, err := apiGet(token, fmt.Sprintf("/projects/%s/repository/commits/%s", encodedPath, sha), nil)
	if err != nil {
		return CommitInfo{}, err
	}

	var commit struct {
		AuthorName string `json:"author_name"`
		AuthoredAt string `json:"authored_date"`
	}
	if err := json.Unmarshal(body, &commit); err != nil {
		return CommitInfo{}, err
	}
	return CommitInfo{
		AuthorName: commit.AuthorName,
		AuthoredAt: commit.AuthoredAt,
	}, nil
}

// parseMRURL は MR URL からプロジェクトパスと MR IID を抽出する
func parseMRURL(mrURL string) (projectPath string, iid int, err error) {
	matches := mrURLRe.FindStringSubmatch(mrURL)
	if len(matches) < 3 {
		return "", 0, fmt.Errorf("MR URL のパースに失敗しました: %s", mrURL)
	}
	projectPath = matches[1]
	iid, err = strconv.Atoi(matches[2])
	if err != nil {
		return "", 0, fmt.Errorf("MR IID のパース失敗: %w", err)
	}
	return projectPath, iid, nil
}

// ParseMRURL は公開版の MR URL パーサー（deploy パッケージから利用）
func ParseMRURL(mrURL string) (projectPath string, iid int, err error) {
	return parseMRURL(mrURL)
}

// extractProjectPath は MR の WebURL からプロジェクトパスを抽出する
func extractProjectPath(webURL string) string {
	// https://{gitlab_host}/{project_path}/-/merge_requests/NNN
	prefix := "https://" + config.GitLabHost() + "/"
	trimmed := strings.TrimPrefix(webURL, prefix)
	if idx := strings.Index(trimmed, "/-/"); idx >= 0 {
		return trimmed[:idx]
	}
	return trimmed
}
