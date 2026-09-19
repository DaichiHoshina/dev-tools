package slack

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/user/dev-tools/kube-deploy/internal/config"
	"github.com/user/dev-tools/kube-deploy/internal/ui"
)

var mrIIDRe = regexp.MustCompile(`/merge_requests/(\d+)`)

// DeployResultEntry はデプロイされた1サービスの結果
type DeployResultEntry struct {
	Service     string
	Tag         string
	PreviousTag string
	MRUrl       string
}

// DeployResult はデプロイ全体の結果
type DeployResult struct {
	Ticket  string
	Entries []DeployResultEntry
	User    string
}

// Slack attachment の色定義
const (
	colorDeploy  = "#36a64f" // 緑
	colorReset   = "#2196F3" // 青
	colorRefresh = "#9E9E9E" // グレー
)

type slackPayload struct {
	Attachments []slackAttachment `json:"attachments"`
}

type slackAttachment struct {
	Color    string   `json:"color"`
	Text     string   `json:"text"`
	MrkdwnIn []string `json:"mrkdwn_in"`
}

func postSlack(msg, color string) {
	webhookURL := config.SlackWebhookURL()
	if webhookURL == "" {
		return
	}

	payload, err := json.Marshal(slackPayload{
		Attachments: []slackAttachment{
			{Color: color, Text: msg, MrkdwnIn: []string{"text"}},
		},
	})
	if err != nil {
		ui.Warn("Slack ペイロード生成失敗: " + err.Error())
		return
	}

	resp, err := http.Post(webhookURL, "application/json", bytes.NewReader(payload))
	if err != nil {
		ui.Warn("Slack 通知失敗: " + err.Error())
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		ui.Warn(fmt.Sprintf("Slack 通知失敗 (HTTP %d)", resp.StatusCode))
	}
}

// Notify はデプロイ結果を Slack に投稿する
func Notify(result DeployResult) {
	if len(result.Entries) == 0 {
		return
	}
	postSlack(formatMessage(result), colorDeploy)
}

// ResetEntry はリセットされた1サービスの情報
type ResetEntry struct {
	Service     string
	PreviousTag string
	RestoredTag string
}

// ResetResult はリセット全体の結果
type ResetResult struct {
	Target  string // チケット、サービス名、または "--mine"
	Entries []ResetEntry
	User    string
}

// NotifyReset はリセット結果を Slack に投稿する
func NotifyReset(result ResetResult) {
	if len(result.Entries) == 0 {
		return
	}
	postSlack(formatResetMessage(result), colorReset)
}

func formatResetMessage(result ResetResult) string {
	var b strings.Builder

	if len(result.Entries) == 1 {
		e := result.Entries[0]
		shortRestored := truncateTag(e.RestoredTag)
		b.WriteString(fmt.Sprintf(":rewind: *%s のイメージを %s に戻しました*\n", e.Service, shortRestored))
	} else {
		b.WriteString(fmt.Sprintf(":rewind: *%s のイメージを戻しました*\n", result.Target))
		for _, e := range result.Entries {
			shortRestored := truncateTag(e.RestoredTag)
			b.WriteString(fmt.Sprintf("▸ %s → `%s`\n", e.Service, shortRestored))
		}
	}

	if result.User != "" {
		b.WriteString(fmt.Sprintf("_by: %s_", result.User))
	}

	return b.String()
}

// NotifyRefresh はrefreshコマンド完了をSlackに通知する
func NotifyRefresh(user string) {
	var b strings.Builder
	b.WriteString(":arrows_counterclockwise: *全Podを最新バージョンに更新しました*")
	if user != "" {
		b.WriteString(fmt.Sprintf("\n_by: %s_", user))
	}
	postSlack(b.String(), colorRefresh)
}

func formatMessage(result DeployResult) string {
	var b strings.Builder

	if len(result.Entries) == 1 {
		e := result.Entries[0]
		b.WriteString(fmt.Sprintf(":rocket: *%s のイメージを書き換えました*\n", e.Service))
	} else {
		b.WriteString(fmt.Sprintf(":rocket: *%s のイメージを書き換えました*\n", result.Ticket))
	}

	for _, e := range result.Entries {
		shortTag := truncateTag(e.Tag)
		shortPrev := truncateTag(e.PreviousTag)

		line := fmt.Sprintf("▸ `%s` → `%s`", shortPrev, shortTag)
		if len(result.Entries) > 1 {
			line = fmt.Sprintf("▸ %s: `%s` → `%s`", e.Service, shortPrev, shortTag)
		}
		if e.MRUrl != "" && e.MRUrl != "manual" {
			if m := mrIIDRe.FindStringSubmatch(e.MRUrl); len(m) >= 2 {
				line += fmt.Sprintf(" (<%s|!%s>)", e.MRUrl, m[1])
			}
		}
		b.WriteString(line + "\n")
	}

	if result.User != "" {
		b.WriteString(fmt.Sprintf("_by: %s_", result.User))
	}

	return b.String()
}

func truncateTag(s string) string {
	if len(s) > 20 {
		return s[:20] + "..."
	}
	return s
}
