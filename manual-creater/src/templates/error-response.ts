import type { Template } from "../types/template";

export const errorResponse: Template = {
  id: "error-response",
  name: "エラー対応手順書",
  description: "特定のエラーが発生した際の対応手順",
  category: "operation",
  sections: [
    {
      id: "basic",
      title: "基本情報",
      fields: [
        {
          id: "title",
          label: "対応タイトル",
          type: "text",
          placeholder: "例: OrderManagement Pod CrashLoopBackOff 対応",
          required: true,
        },
        {
          id: "date",
          label: "発生日時",
          type: "datetime",
          required: true,
        },
        {
          id: "author",
          label: "対応者",
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
      ],
    },
    {
      id: "error_info",
      title: "エラー情報",
      fields: [
        {
          id: "error_code",
          label: "エラーコード",
          type: "text",
          placeholder: "例: 500, CrashLoopBackOff, OOMKilled",
        },
        {
          id: "error_message",
          label: "エラーメッセージ",
          type: "textarea",
          placeholder: "エラーメッセージ全文",
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
          required: true,
        },
        {
          id: "affected_service",
          label: "影響サービス",
          type: "text",
          placeholder: "例: order-management",
        },
        {
          id: "error_condition",
          label: "発生条件",
          type: "textarea",
          placeholder: "例: 高負荷時に発生、特定のリクエストで発生",
        },
        {
          id: "symptom",
          label: "症状",
          type: "textarea",
          placeholder: "例: APIレスポンスが500を返す、Podが再起動を繰り返す",
        },
      ],
    },
    {
      id: "diagnosis",
      title: "診断手順",
      description: "エラーの原因を特定するための診断コマンド",
      fields: [
        {
          id: "check_command",
          label: "診断コマンド",
          type: "command-template",
          commandCategory: "gcloud",
          defaultValue:
            "# Podステータス確認\nkubectl get pods -n [NAMESPACE] | grep [SERVICE]\n\n# Pod詳細確認\nkubectl describe pod [POD_NAME] -n [NAMESPACE]\n\n# ログ確認\nkubectl logs [POD_NAME] -n [NAMESPACE] --tail=100\n\n# 前回クラッシュ時のログ\nkubectl logs [POD_NAME] -n [NAMESPACE] --previous",
        },
        {
          id: "diagnosis_items",
          label: "診断チェック項目",
          type: "checklist",
          defaultValue:
            "エラーログを確認\nPodのステータスを確認（Running/CrashLoopBackOff/OOMKilled）\nリソース使用状況を確認（CPU/Memory）\n関連サービスの状態を確認\nDB接続状況を確認\n直近のデプロイ・設定変更を確認",
        },
      ],
    },
    {
      id: "response",
      title: "対応手順",
      description: "エラーを解消するための手順（複数ステップ可）",
      repeatable: true,
      fields: [
        {
          id: "step_name",
          label: "ステップ名",
          type: "text",
          placeholder: "例: Podの再起動",
          required: true,
        },
        {
          id: "step_command",
          label: "実行コマンド",
          type: "command-template",
          commandCategory: "gcloud",
          placeholder: "例: kubectl rollout restart deployment/[SERVICE] -n [NAMESPACE]",
        },
        {
          id: "step_description",
          label: "手順説明",
          type: "textarea",
          placeholder: "何を行うか、注意点など",
        },
        {
          id: "expected_result",
          label: "期待される結果",
          type: "text",
          placeholder: "例: Pod が Running ステータスになること",
        },
      ],
    },
    {
      id: "verification",
      title: "復旧確認",
      fields: [
        {
          id: "verification_command",
          label: "確認コマンド",
          type: "command-template",
          commandCategory: "gcloud",
          defaultValue:
            "# Podステータス確認\nkubectl get pods -n [NAMESPACE] | grep [SERVICE]\n\n# ヘルスチェック\ncurl -s https://[SERVICE_URL]/health | jq .\n\n# エラーログが出力されていないこと\nkubectl logs deployment/[SERVICE] -n [NAMESPACE] --since=5m | grep -i error",
        },
        {
          id: "verification_items",
          label: "確認項目",
          type: "checklist",
          defaultValue:
            "エラーが解消されていること\nPodが正常稼働（Running）していること\nヘルスチェックが通ること\nエラーログが出力されていないこと\n関連機能が正常に動作すること",
        },
      ],
    },
    {
      id: "escalation",
      title: "エスカレーション",
      fields: [
        {
          id: "escalation_criteria",
          label: "エスカレーション基準",
          type: "textarea",
          defaultValue:
            "以下のいずれかに該当する場合、エスカレーション：\n- 対応手順で復旧しない場合\n- 影響がCritical/Highで30分以上継続する場合\n- 原因が特定できない場合\n- データ損失の可能性がある場合",
        },
        {
          id: "escalation_to",
          label: "エスカレーション先",
          type: "textarea",
          placeholder: "例: インフラチームリーダー → PM → 三井物産様",
        },
        {
          id: "known_issues",
          label: "既知の問題",
          type: "textarea",
          placeholder: "過去に同様の事象があれば記載",
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
| 発生日時 | {{date}} |
| 対応者 | {{author}} |
| 確認者 | {{reviewer}} |
| エラーコード | {{error_code}} |
| 重要度 | {{severity}} |
| 影響サービス | {{affected_service}} |
| 関連チケット | {{ticket}} |

## エラー詳細

### エラーメッセージ
\`\`\`
{{error_message}}
\`\`\`

### 発生条件
{{error_condition}}

### 症状
{{symptom}}

## 診断手順

### 診断コマンド

\`\`\`bash
{{check_command}}
\`\`\`

### 診断チェック項目
{{#checklist:diagnosis_items}}

## 対応手順

{{#repeat:response}}
### {{step_name}}

\`\`\`bash
{{step_command}}
\`\`\`

{{step_description}}

**期待される結果**: {{expected_result}}
{{/repeat:response}}

## 復旧確認

### 確認コマンド

\`\`\`bash
{{verification_command}}
\`\`\`

### 確認項目
{{#checklist:verification_items}}

## エスカレーション

### エスカレーション基準
{{escalation_criteria}}

### エスカレーション先
{{escalation_to}}

## 既知の問題
{{known_issues}}

## 備考
{{notes}}
`,
};;
