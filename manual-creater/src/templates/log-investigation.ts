import type { Template } from "../types/template";

export const logInvestigation: Template = {
  id: "log-investigation",
  name: "ログ調査手順書",
  description: "Cloud Loggingでのエラー調査・分析手順",
  category: "operation",
  sections: [
    {
      id: "basic",
      title: "基本情報",
      fields: [
        {
          id: "title",
          label: "調査タイトル",
          type: "text",
          placeholder: "例: APIサーバー 500エラー調査",
          required: true,
        },
        {
          id: "date",
          label: "調査日時",
          type: "datetime",
          required: true,
        },
        {
          id: "author",
          label: "調査者",
          type: "text",
          required: true,
        },
        {
          id: "reviewer",
          label: "確認者",
          type: "text",
        },
        {
          id: "ticket",
          label: "関連チケット",
          type: "text",
          placeholder: "例: BSS-1234",
        },
        {
          id: "environment",
          label: "対象環境",
          type: "select",
          options: [
            { label: "dev", value: "dev" },
            { label: "tes", value: "tes" },
            { label: "prd", value: "prd" },
          ],
        },
      ],
    },
    {
      id: "symptom",
      title: "事象概要",
      fields: [
        {
          id: "symptom",
          label: "発生事象",
          type: "textarea",
          placeholder: "例: 特定のAPIエンドポイントで500エラーが間欠的に発生",
          required: true,
        },
        {
          id: "occurrence_time",
          label: "発生日時",
          type: "text",
          placeholder: "例: 2025-01-15 14:30 〜 15:00 (JST)",
        },
        {
          id: "affected_service",
          label: "影響サービス",
          type: "text",
          placeholder: "例: api-server, web-frontend",
        },
        {
          id: "severity",
          label: "重要度",
          type: "select",
          options: [
            { label: "Critical - サービス停止", value: "Critical" },
            { label: "High - 主要機能障害", value: "High" },
            { label: "Medium - 一部機能障害", value: "Medium" },
            { label: "Low - 軽微な問題", value: "Low" },
          ],
        },
        {
          id: "impact",
          label: "影響範囲",
          type: "textarea",
          placeholder: "例: 全ユーザーの主要機能に影響",
        },
      ],
    },
    {
      id: "investigation",
      title: "調査内容",
      description: "Cloud Loggingでのログ調査",
      fields: [
        {
          id: "log_query",
          label: "ログクエリ",
          type: "command-template",
          commandCategory: "gcloud",
          placeholder: "Cloud Logging クエリ",
          defaultValue:
            'resource.type="k8s_container"\nresource.labels.namespace_name="[NAMESPACE]"\nseverity>=ERROR\ntimestamp>="[開始日時]"\ntimestamp<="[終了日時]"',
        },
        {
          id: "error_pattern",
          label: "エラーパターン",
          type: "textarea",
          placeholder: "例: panic: runtime error: index out of range",
        },
        {
          id: "frequency",
          label: "発生頻度",
          type: "text",
          placeholder: "例: 5分間に約10回、間欠的に発生",
        },
      ],
    },
    {
      id: "analysis",
      title: "原因分析",
      fields: [
        {
          id: "root_cause",
          label: "推定原因",
          type: "textarea",
          placeholder: "例: DBコネクションプール枯渇による接続タイムアウト",
        },
        {
          id: "related_logs",
          label: "関連ログ",
          type: "textarea",
          placeholder: "原因を裏付けるログの抜粋",
        },
        {
          id: "correlation",
          label: "相関関係",
          type: "textarea",
          placeholder: "例: CPU使用率のスパイクと同時間帯に発生",
        },
      ],
    },
    {
      id: "response",
      title: "対応内容",
      fields: [
        {
          id: "immediate_action",
          label: "即時対応",
          type: "textarea",
          placeholder: "例: Podの再起動で一時的に復旧",
        },
        {
          id: "permanent_fix",
          label: "恒久対応",
          type: "textarea",
          placeholder: "例: コネクションプール設定の見直し（maxIdleConns調整）",
        },
      ],
    },
    {
      id: "followup",
      title: "フォローアップ",
      fields: [
        {
          id: "monitoring",
          label: "監視項目",
          type: "textarea",
          placeholder: "例: DBコネクション数のアラート閾値を追加",
        },
        {
          id: "prevention",
          label: "再発防止策",
          type: "textarea",
          placeholder: "例: コネクションプール監視ダッシュボード追加",
        },
        {
          id: "followup_items",
          label: "残タスク",
          type: "checklist",
          defaultValue:
            "恒久対応のチケット作成\nモニタリング設定の追加\n関係者への報告",
        },
      ],
    },
    {
      id: "notes",
      title: "備考",
      fields: [
        {
          id: "notes",
          label: "備考・注意事項",
          type: "textarea",
        },
      ],
    },
  ],
  outputTemplate: `# {{title}}

## 基本情報
| 項目 | 内容 |
|------|------|
| 調査日時 | {{date}} |
| 調査者 | {{author}} |
| 確認者 | {{reviewer}} |
| 対象環境 | {{environment}} |
| 関連チケット | {{ticket}} |

## 事象概要

### 発生事象
{{symptom}}

| 項目 | 内容 |
|------|------|
| 発生日時 | {{occurrence_time}} |
| 影響サービス | {{affected_service}} |
| 重要度 | {{severity}} |

### 影響範囲
{{impact}}

## 調査内容

### ログクエリ

Cloud Logging コンソール または gcloud コマンドで以下を実行：

\`\`\`
{{log_query}}
\`\`\`

\`\`\`bash
# gcloud CLI でのログ取得
gcloud logging read '{{log_query}}' \\
  --project=[PROJECT_ID] \\
  --format="table(timestamp,severity,jsonPayload.message)" \\
  --limit=100
\`\`\`

### エラーパターン
\`\`\`
{{error_pattern}}
\`\`\`

- 発生頻度: {{frequency}}

### ログ解析コマンド（参考）

\`\`\`bash
# Pod ログからエラー抽出
kubectl logs -n [NAMESPACE] deployment/[SERVICE] --since=1h | grep -i error

# JSON ログの解析
kubectl logs -n [NAMESPACE] deployment/[SERVICE] --since=1h | jq 'select(.level == "error")'
\`\`\`

## 原因分析

### 推定原因
{{root_cause}}

### 関連ログ
{{related_logs}}

### 相関関係
{{correlation}}

## 対応内容

### 即時対応
{{immediate_action}}

### 恒久対応
{{permanent_fix}}

## フォローアップ

### 監視項目
{{monitoring}}

### 再発防止策
{{prevention}}

### 残タスク
{{#checklist:followup_items}}

## 備考
{{notes}}
`,
};
