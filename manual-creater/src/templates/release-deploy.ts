import type { Template } from "../types/template";

export const releaseDeploy: Template = {
  id: "release-deploy",
  name: "リリース/デプロイ手順書",
  description: "アプリケーションのリリース・デプロイ作業手順を作成",
  category: "release",
  sections: [
    {
      id: "basic",
      title: "基本情報",
      fields: [
        {
          id: "title",
          label: "作業タイトル",
          type: "text",
          placeholder: "例: サービスA v2.1.0 リリース",
          required: true,
        },
        {
          id: "date",
          label: "作業予定日",
          type: "datetime",
          required: true,
        },
        {
          id: "author",
          label: "作業者",
          type: "text",
          required: true,
        },
        {
          id: "reviewer",
          label: "レビュアー/承認者",
          type: "text",
        },
        {
          id: "ticket",
          label: "関連チケット",
          type: "text",
          placeholder: "例: TICKET-1234",
        },
      ],
    },
    {
      id: "target",
      title: "デプロイ対象",
      repeatable: true,
      fields: [
        {
          id: "service_name",
          label: "サービス名",
          type: "text",
          required: true,
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
          required: true,
        },
        {
          id: "version",
          label: "デプロイバージョン/タグ",
          type: "text",
          placeholder: "例: v2.1.0 or commit hash",
        },
        {
          id: "branch",
          label: "ブランチ",
          type: "text",
          placeholder: "例: main",
          defaultValue: "main",
        },
      ],
    },
    {
      id: "preconditions",
      title: "事前確認事項",
      fields: [
        {
          id: "precondition_items",
          label: "確認項目",
          type: "checklist",
          defaultValue:
            "MRがマージ済みであること\nCIパイプラインが成功していること\n依存サービスへの影響確認済み\nリリース判定会議で承認済み（必要な場合）\nDBマイグレーションの有無を確認済み",
        },
      ],
    },
    {
      id: "procedure",
      title: "作業手順",
      fields: [
        {
          id: "steps",
          label: "手順",
          type: "command-template",
          commandCategory: "git",
          placeholder: "作業手順を入力またはテンプレートを選択",
          help: "Git/Cloud Runコマンドのテンプレートを利用できます",
          defaultValue:
            "# 1. Argo CD にログイン\nArgo CD コンソールにアクセス\n\n# 2. 対象アプリケーションを選択\nApplications > [サービス名] を選択\n\n# 3. REFRESH でステータス更新\n「REFRESH」ボタンをクリック\n\n# 4. SYNC でデプロイ実行\n「SYNC」→「SYNCHRONIZE」をクリック\n\n# 5. デプロイ完了確認\nステータスが「Synced」「Healthy」になることを確認",
        },
      ],
    },
    {
      id: "verification",
      title: "デプロイ後確認",
      fields: [
        {
          id: "verification_items",
          label: "確認項目",
          type: "checklist",
          defaultValue:
            "サービスが正常に起動していること（Pod: Running）\nヘルスチェックが通ること\nログにエラーが出ていないこと\n主要機能の動作確認\n監視ダッシュボードで異常がないこと",
        },
      ],
    },
    {
      id: "rollback",
      title: "切り戻し手順",
      fields: [
        {
          id: "rollback_steps",
          label: "切り戻し手順",
          type: "command-template",
          commandCategory: "gcloud",
          placeholder: "切り戻し手順を入力またはテンプレートを選択",
          help: "Cloud Runロールバック等のコマンド",
          defaultValue:
            "# 1. 前バージョンのイメージタグでhelm MRを作成\ngit checkout -b rollback/[SERVICE]-[VERSION]\n# values.yaml のイメージタグを前バージョンに変更\n\n# 2. MRをマージ\n\n# 3. Argo CD から対象サービスを SYNC\n\n# 4. DBマイグレーションのロールバック（必要な場合）\n\n# 5. 動作確認を実施",
        },
        {
          id: "rollback_criteria",
          label: "切り戻し判断基準",
          type: "textarea",
          defaultValue:
            "以下のいずれかに該当した場合、切り戻しを検討：\n- デプロイ後にDegraded/CrashLoopBackOffが解消しない場合\n- 動作確認で重大な不具合が発見された場合\n- エラーレートが通常の5倍を超えた場合\n- ヘルスチェックが失敗し続ける場合",
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
| 作業予定日 | {{date}} |
| 作業者 | {{author}} |
| レビュアー/承認者 | {{reviewer}} |
| 関連チケット | {{ticket}} |

## デプロイ対象
{{#repeat:target}}
| 項目 | 内容 |
|------|------|
| サービス名 | {{service_name}} |
| 対象環境 | {{environment}} |
| バージョン | {{version}} |
| ブランチ | {{branch}} |
{{/repeat:target}}

## 事前確認事項
{{#checklist:precondition_items}}

## 作業手順

\`\`\`
{{steps}}
\`\`\`

### デプロイ後確認

\`\`\`bash
# Podステータス確認
kubectl get pods -n [NAMESPACE] | grep [SERVICE]

# ヘルスチェック
curl -s https://[SERVICE_URL]/health | jq .

# ログ確認（直近5分）
kubectl logs deployment/[SERVICE] -n [NAMESPACE] --since=5m | tail -20
\`\`\`

{{#checklist:verification_items}}

## 切り戻し手順

\`\`\`
{{rollback_steps}}
\`\`\`

### 切り戻し判断基準
{{rollback_criteria}}

## 備考
{{notes}}
`,
};
