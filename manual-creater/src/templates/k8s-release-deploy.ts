import type { Template } from "../types/template";

export const k8sReleaseDeploy: Template = {
  id: "k8s-release-deploy",
  name: "Kubernetes リリースデプロイ手順書",
  description:
    "Kubernetes + Argo CD + Helm 構成でのリリース・デプロイ作業手順と動作確認を作成",
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
          placeholder: "例: 2025.XX.XX 第XX次リリース デプロイ手順",
          required: true,
        },
        {
          id: "date",
          label: "作業予定日時",
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
          label: "確認者",
          type: "text",
          help: "作業及び確認はdev2名以上の体制で実施する",
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
      description: "helm MRに含まれるマイクロサービスとバージョン",
      repeatable: true,
      fields: [
        {
          id: "service_name",
          label: "サービス名",
          type: "text",
          placeholder: "例: api-server",
          required: true,
        },
        {
          id: "version",
          label: "バージョン",
          type: "text",
          placeholder: "例: v1.0.0",
          required: true,
        },
        {
          id: "migration",
          label: "migration有無",
          type: "select",
          options: [
            { label: "なし", value: "なし" },
            { label: "有り", value: "有り" },
            { label: "-", value: "-" },
          ],
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
            "リリース対象のMRがマージ済みであること\nCIパイプラインが成功していること\n最新バージョンをリリース前にGitから確認済み\nhelm MRが作成済みであること\nDBマイグレーションの有無を確認済み",
        },
        {
          id: "helm_mr_url",
          label: "helm MR URL",
          type: "text",
          placeholder:
            "例: https://gitlab.example.com/infrastructure/helm/-/merge_requests/XXX",
        },
      ],
    },
    {
      id: "notify-start",
      title: "関係者への作業開始連絡",
      fields: [
        {
          id: "notify_start_done",
          label: "完了時刻",
          type: "text",
          placeholder: "例: 18:00",
        },
        {
          id: "notify_start_note",
          label: "連絡先・連絡方法",
          type: "textarea",
          defaultValue:
            "Slackの #releases チャンネルでリリース作業開始の旨を連絡する。",
        },
      ],
    },
    {
      id: "maintenance-on",
      title: "メンテナンスページの表示",
      description: "大規模リリース時のみ",
      fields: [
        {
          id: "maintenance_on_done",
          label: "完了時刻",
          type: "text",
          placeholder: "例: 18:05",
        },
        {
          id: "maintenance_on_items",
          label: "確認項目",
          type: "checklist",
          defaultValue:
            "メンテナンスページ切り替え手順に従いメンテナンスモードを有効化\nURL変更を行ったか確認",
        },
      ],
    },
    {
      id: "healthman-stop",
      title: "ヘルスチェック監視の停止",
      description: "大規模リリース時のみ",
      fields: [
        {
          id: "healthman_stop_done",
          label: "完了時刻",
          type: "text",
          placeholder: "例: 18:10",
        },
        {
          id: "healthman_stop_items",
          label: "確認項目",
          type: "checklist",
          defaultValue:
            "監視ツールのヘルスチェックを停止\n設定変更が適用されていること",
        },
      ],
    },
    {
      id: "helm-merge",
      title: "helmをマージ",
      fields: [
        {
          id: "helm_merge_done",
          label: "完了時刻",
          type: "text",
          placeholder: "例: 18:15",
        },
        {
          id: "helm_merge_items",
          label: "確認項目",
          type: "checklist",
          defaultValue:
            "helm MRをマージ\nhelmのパイプラインが通っていることを確認",
        },
      ],
    },
    {
      id: "db-migration",
      title: "DBマイグレーション",
      description: "大規模リリース時・migration有りの場合",
      fields: [
        {
          id: "db_migration_done",
          label: "完了時刻",
          type: "text",
          placeholder: "例: 18:20",
        },
        {
          id: "db_migration_steps",
          label: "マイグレーション手順",
          type: "command-template",
          commandCategory: "sql",
          placeholder: "マイグレーション手順を入力",
          defaultValue:
            "# 対象マイクロサービスのPodにログイン\nkubectl exec -it <pod-name> -n <namespace> -- ash\n\n# マイグレーションバージョン確認\n<サービス名> migrate version\n\n# マイグレーション実行\n<サービス名> migrate up\n\n# 適用確認\n<サービス名> migrate version",
        },
        {
          id: "db_migration_items",
          label: "確認項目",
          type: "checklist",
          defaultValue:
            "マイグレーション前のバージョンを確認\nマイグレーションを実行\nマイグレーション後のバージョンを確認\nエラーが発生していないこと",
        },
      ],
    },
    {
      id: "argocd-deploy",
      title: "Argo CDからデプロイ",
      fields: [
        {
          id: "argocd_deploy_done",
          label: "完了時刻",
          type: "text",
          placeholder: "例: 18:30",
        },
        {
          id: "argocd_deploy_steps",
          label: "デプロイ手順",
          type: "textarea",
          defaultValue:
            "1. 本番環境用ArgoCDにログイン\n2. 「REFRESH APPS」をクリックしてPodのステータスを更新\n3. 更新対象のコンテナの「SYNC」→「SYNCHRONIZE」をクリック\n4. ステータスが「Synced」になることを確認\n\n※注意: istioなどはsyncしないこと\n※「Degraded」になった場合はhelmの設定を確認",
        },
        {
          id: "argocd_deploy_order",
          label: "デプロイ順序（大規模リリース時）",
          type: "textarea",
          placeholder: "デプロイ順序を指定",
          defaultValue:
            "1. 基盤サービス\n2. バックエンドサービス\n3. フロントエンドサービス",
        },
        {
          id: "argocd_deploy_items",
          label: "確認項目",
          type: "checklist",
          defaultValue:
            "対象コンテナのSyncが完了（Synced）\nPodが正常に起動していること\nistio等をsyncしていないこと",
        },
      ],
    },
    {
      id: "maintenance-off",
      title: "メンテナンスページの削除",
      description: "大規模リリース時のみ",
      fields: [
        {
          id: "maintenance_off_done",
          label: "完了時刻",
          type: "text",
          placeholder: "例: 18:40",
        },
        {
          id: "maintenance_off_items",
          label: "確認項目",
          type: "checklist",
          defaultValue:
            "メンテナンスページ切り替え手順に従いメンテナンスモードを解除\nアプリが正常に表示されることを確認",
        },
      ],
    },
    {
      id: "verification",
      title: "動作確認（疎通確認）",
      description: "テスト用アカウントで確認。dev2名以上の体制で実施する",
      repeatable: true,
      fields: [
        {
          id: "verification_point",
          label: "確認観点",
          type: "text",
          placeholder: "例: ログイン・主要機能が正常に動作する",
          required: true,
        },
        {
          id: "verification_account",
          label: "確認アカウント",
          type: "text",
          defaultValue: "test-account",
        },
        {
          id: "verification_steps",
          label: "手順",
          type: "textarea",
          placeholder: "例: テスト用アカウントでログインし、主要機能を操作する",
        },
        {
          id: "verification_result",
          label: "確認結果（確認時刻）",
          type: "text",
          placeholder: "例: 18:45 OK",
        },
        {
          id: "verification_operator",
          label: "作業者 / 確認者",
          type: "text",
          placeholder: "例: ①山田 ②佐藤",
        },
        {
          id: "verification_evidence",
          label: "証跡",
          type: "textarea",
          placeholder: "スクリーンショットのファイル名やリンク",
        },
      ],
    },
    {
      id: "release-note",
      title: "リリースノートの公開",
      description: "大規模リリース時のみ",
      fields: [
        {
          id: "release_note_done",
          label: "完了時刻",
          type: "text",
          placeholder: "例: 19:00",
        },
        {
          id: "release_note_items",
          label: "確認項目",
          type: "checklist",
          defaultValue:
            "リリースノート記事を公開\nリンク先が正しく表示されること",
        },
        {
          id: "release_note_url",
          label: "リリースノートURL",
          type: "text",
          placeholder: "リリースノートの記事URL",
        },
      ],
    },
    {
      id: "announcement",
      title: "アナウンスバナーの公開",
      description: "大規模リリース時のみ",
      fields: [
        {
          id: "announcement_done",
          label: "完了時刻",
          type: "text",
          placeholder: "例: 19:05",
        },
        {
          id: "announcement_items",
          label: "確認項目",
          type: "checklist",
          defaultValue:
            "アナウンスバナーを公開\nリンク先が正しく表示されること\n掲載内容が正しいこと",
        },
      ],
    },
    {
      id: "healthman-start",
      title: "ヘルスチェック監視の再開",
      description: "大規模リリース時のみ",
      fields: [
        {
          id: "healthman_start_done",
          label: "完了時刻",
          type: "text",
          placeholder: "例: 19:10",
        },
        {
          id: "healthman_start_items",
          label: "確認項目",
          type: "checklist",
          defaultValue:
            "監視ツールのヘルスチェックを再開\n監視が正常に動作していること",
        },
      ],
    },
    {
      id: "notify-end",
      title: "関係者への作業終了連絡",
      fields: [
        {
          id: "notify_end_done",
          label: "完了時刻",
          type: "text",
          placeholder: "例: 19:15",
        },
        {
          id: "notify_end_note",
          label: "連絡先・連絡方法",
          type: "textarea",
          defaultValue:
            "Slackの #releases チャンネルでリリース作業終了の旨を連絡する。",
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
          type: "textarea",
          defaultValue:
            "1. Argo CDで前バージョンのイメージタグに戻したhelm MRを作成・マージ\n2. Argo CDから対象サービスをSYNC\n3. DBマイグレーションのロールバック（必要な場合）\n4. 動作確認を実施",
        },
        {
          id: "rollback_criteria",
          label: "切り戻し判断基準",
          type: "textarea",
          defaultValue:
            "以下のいずれかに該当した場合、切り戻しを検討：\n- デプロイ後にDegradedステータスが解消しない場合\n- 動作確認で重大な不具合が発見された場合\n- エラーログが大量に出力されている場合",
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
          placeholder: "特記事項、今回の変更内容等",
        },
      ],
    },
  ],
  outputTemplate: `# {{title}}

## 基本情報
| 項目 | 内容 |
|------|------|
| 作業予定日時 | {{date}} |
| 作業者 | {{author}} |
| 確認者 | {{reviewer}} |
| 関連チケット | {{ticket}} |

## デプロイ対象
| サービス名 | バージョン | migration有無 |
|-----------|-----------|-------------|
{{#repeat:target}}
| {{service_name}} | {{version}} | {{migration}} |
{{/repeat:target}}

helm MR: {{helm_mr_url}}

## 事前確認事項
{{#checklist:precondition_items}}

---

## リリース手順

### 関係者への作業開始連絡
> 完了時刻: {{notify_start_done}}

{{notify_start_note}}

{{#if-subtype:large}}
### メンテナンスページの表示
> 完了時刻: {{maintenance_on_done}}

{{#checklist:maintenance_on_items}}

### ヘルスチェック監視の停止
> 完了時刻: {{healthman_stop_done}}

{{#checklist:healthman_stop_items}}

{{/if-subtype:large}}
### helmをマージ
> 完了時刻: {{helm_merge_done}}

{{#checklist:helm_merge_items}}

{{#if-subtype:large}}
### DBマイグレーション
> 完了時刻: {{db_migration_done}}

\`\`\`bash
{{db_migration_steps}}
\`\`\`

{{#checklist:db_migration_items}}

{{/if-subtype:large}}
### Argo CDからデプロイ
> 完了時刻: {{argocd_deploy_done}}

{{argocd_deploy_steps}}

{{#if-subtype:large}}
#### デプロイ順序
{{argocd_deploy_order}}

{{/if-subtype:large}}
{{#checklist:argocd_deploy_items}}

{{#if-subtype:large}}
### メンテナンスページの削除
> 完了時刻: {{maintenance_off_done}}

{{#checklist:maintenance_off_items}}

{{/if-subtype:large}}
---

## 動作確認（疎通確認）

※作業及び確認はdev2名以上の体制で実施する

| # | 確認観点 | 確認アカウント | 手順 | 確認結果 | 作業者/確認者 | 証跡 |
|---|---------|-------------|------|---------|-------------|------|
{{#repeat:verification}}
| - | {{verification_point}} | {{verification_account}} | {{verification_steps}} | {{verification_result}} | {{verification_operator}} | {{verification_evidence}} |
{{/repeat:verification}}

{{#if-subtype:large}}
---

### リリースノートの公開
> 完了時刻: {{release_note_done}}

{{#checklist:release_note_items}}

URL: {{release_note_url}}

### アナウンスバナーの公開
> 完了時刻: {{announcement_done}}

{{#checklist:announcement_items}}

### ヘルスチェック監視の再開
> 完了時刻: {{healthman_start_done}}

{{#checklist:healthman_start_items}}

{{/if-subtype:large}}
### 関係者への作業終了連絡
> 完了時刻: {{notify_end_done}}

{{notify_end_note}}

---

## 切り戻し手順
{{rollback_steps}}

### 切り戻し判断基準
{{rollback_criteria}}

## 備考
{{notes}}
`,
};
