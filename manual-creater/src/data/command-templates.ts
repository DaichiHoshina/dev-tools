export interface CommandTemplate {
  id: string;
  label: string;
  description: string;
  command: string;
  category: "sql" | "terraform" | "git" | "gcloud";
}

export const commandTemplates: CommandTemplate[] = [
  // SQL Templates
  {
    id: "sql-select-basic",
    label: "SELECT（基本）",
    description: "基本的なSELECTクエリ",
    category: "sql",
    command: `SELECT *
FROM {{テーブル名}}
WHERE {{条件}}
LIMIT 10;`,
  },
  {
    id: "sql-select-with-join",
    label: "SELECT（JOIN）",
    description: "JOIN を使用した SELECT クエリ",
    category: "sql",
    command: `SELECT a.*, b.{{カラム名}}
FROM {{テーブル名A}} a
INNER JOIN {{テーブル名B}} b ON a.id = b.{{外部キー}}
WHERE {{条件}};`,
  },
  {
    id: "sql-update",
    label: "UPDATE",
    description: "データ更新クエリ",
    category: "sql",
    command: `UPDATE {{テーブル名}}
SET {{カラム名}} = {{新しい値}}
WHERE {{条件}};`,
  },
  {
    id: "sql-delete",
    label: "DELETE",
    description: "データ削除クエリ",
    category: "sql",
    command: `DELETE FROM {{テーブル名}}
WHERE {{条件}};`,
  },
  {
    id: "sql-backup",
    label: "バックアップ作成",
    description: "テーブルのバックアップを作成",
    category: "sql",
    command: `CREATE TABLE {{テーブル名}}_backup_{{YYYYMMDD}} AS
SELECT * FROM {{テーブル名}}
WHERE {{条件（省略可）}};`,
  },
  {
    id: "sql-count-verify",
    label: "件数確認",
    description: "影響行数の確認用クエリ",
    category: "sql",
    command: `SELECT COUNT(*) as count
FROM {{テーブル名}}
WHERE {{条件}};`,
  },

  // Terraform Templates
  {
    id: "terraform-plan",
    label: "terraform plan",
    description: "変更内容の確認",
    category: "terraform",
    command: `# 変更内容の確認
terraform plan -out=tfplan

# 特定のリソースのみ確認
terraform plan -target={{リソース種別}}.{{リソース名}}`,
  },
  {
    id: "terraform-apply",
    label: "terraform apply",
    description: "変更の適用",
    category: "terraform",
    command: `# planファイルから適用
terraform apply tfplan

# 対話的に適用
terraform apply`,
  },
  {
    id: "terraform-destroy",
    label: "terraform destroy",
    description: "リソースの削除",
    category: "terraform",
    command: `# 特定のリソースのみ削除
terraform destroy -target={{リソース種別}}.{{リソース名}}

# 全リソース削除（要注意）
# terraform destroy`,
  },
  {
    id: "terraform-import",
    label: "terraform import",
    description: "既存リソースのインポート",
    category: "terraform",
    command: `terraform import {{リソース種別}}.{{リソース名}} {{リソースID}}

# 例: Cloud Run サービスのインポート
# terraform import google_cloud_run_service.api projects/{{PROJECT_ID}}/locations/asia-northeast1/services/{{SERVICE_NAME}}`,
  },
  {
    id: "terraform-state-list",
    label: "terraform state list",
    description: "管理中のリソース一覧",
    category: "terraform",
    command: `# 全リソース一覧
terraform state list

# 特定のリソースのみ表示
terraform state list | grep {{検索文字列}}`,
  },
  {
    id: "terraform-workspace",
    label: "terraform workspace",
    description: "ワークスペースの切り替え",
    category: "terraform",
    command: `# ワークスペース一覧
terraform workspace list

# ワークスペース切り替え
terraform workspace select {{ワークスペース名}}`,
  },

  // Git Templates
  {
    id: "git-create-tag",
    label: "タグ作成",
    description: "リリースタグの作成",
    category: "git",
    command: `# タグ作成
git tag -a {{バージョン番号}} -m "Release {{バージョン番号}}"

# タグをリモートにプッシュ
git push origin {{バージョン番号}}`,
  },
  {
    id: "git-create-branch",
    label: "ブランチ作成",
    description: "作業ブランチの作成",
    category: "git",
    command: `# ブランチ作成と切り替え
git checkout -b {{ブランチ名}}

# リモートにプッシュ
git push -u origin {{ブランチ名}}`,
  },
  {
    id: "git-create-mr",
    label: "MR作成",
    description: "GitLab でマージリクエストを作成",
    category: "git",
    command: `# glabコマンドでMR作成
glab mr create \\
  --title "{{MRタイトル}}" \\
  --description "{{説明}}" \\
  --target-branch main \\
  --assignee @me`,
  },
  {
    id: "git-cherry-pick",
    label: "cherry-pick",
    description: "特定のコミットを取り込む",
    category: "git",
    command: `# 特定のコミットを取り込む
git cherry-pick {{コミットハッシュ}}

# 複数のコミットを取り込む
git cherry-pick {{開始コミット}}..{{終了コミット}}`,
  },
  {
    id: "git-revert",
    label: "revert",
    description: "コミットを打ち消す",
    category: "git",
    command: `# 特定のコミットを打ち消す
git revert {{コミットハッシュ}}

# マージコミットを打ち消す
git revert -m 1 {{マージコミットハッシュ}}`,
  },
  {
    id: "git-log-oneline",
    label: "git log（簡潔）",
    description: "コミット履歴を簡潔に表示",
    category: "git",
    command: `# 最新10件のコミット
git log --oneline -n 10

# 特定ブランチのコミット
git log --oneline {{ブランチ名}}`,
  },

  // Kubernetes Templates
  {
    id: "kubectl-run-temp-node",
    label: "kubectl run temp-node",
    description: "temp-node Podを起動してDBに接続",
    category: "gcloud",
    command: `kubectl run temp-node \\
  --image={{イメージ名}} \\
  --namespace={{namespace}} \\
  --env="DB_HOST={{Cloud SQLプロキシ}}" \\
  --env="DB_NAME={{データベース名}}" \\
  --restart=Never \\
  --rm -it -- bash`,
  },
  {
    id: "kubectl-exec",
    label: "kubectl exec",
    description: "実行中のPodに接続",
    category: "gcloud",
    command: `kubectl exec -it {{Pod名}} \\
  --namespace={{namespace}} \\
  -- bash`,
  },
  {
    id: "kubectl-delete-pod",
    label: "kubectl delete pod",
    description: "Podを削除",
    category: "gcloud",
    command: `kubectl delete pod {{Pod名}} --namespace={{namespace}}`,
  },
  {
    id: "kubectl-logs",
    label: "kubectl logs",
    description: "Podのログを確認",
    category: "gcloud",
    command: `kubectl logs {{Pod名}} --namespace={{namespace}} --tail=100`,
  },

  // Cloud Run Templates
  {
    id: "gcloud-deploy",
    label: "Cloud Run デプロイ",
    description: "Cloud Run サービスのデプロイ",
    category: "gcloud",
    command: `gcloud run deploy {{サービス名}} \\
  --image={{イメージURL}} \\
  --region=asia-northeast1 \\
  --platform=managed \\
  --project={{PROJECT_ID}}`,
  },
  {
    id: "gcloud-rollback",
    label: "Cloud Run ロールバック",
    description: "前のリビジョンに戻す",
    category: "gcloud",
    command: `# リビジョン一覧
gcloud run revisions list --service={{サービス名}} --region=asia-northeast1

# 特定のリビジョンにロールバック
gcloud run services update-traffic {{サービス名}} \\
  --to-revisions={{リビジョン名}}=100 \\
  --region=asia-northeast1`,
  },
  {
    id: "gcloud-logs",
    label: "Cloud Run ログ確認",
    description: "サービスのログを確認",
    category: "gcloud",
    command: `# 最新のログをストリーミング
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name={{サービス名}}" \\
  --limit 50 \\
  --format json`,
  },
  {
    id: "gcloud-logging-error",
    label: "Cloud Logging エラー検索",
    description: "エラーログを検索",
    category: "gcloud",
    command: `gcloud logging read "severity>=ERROR AND timestamp>=\"{{開始日時}}\"" \\
  --limit 100 \\
  --format json`,
  },
  {
    id: "gsutil-cp-upload",
    label: "gsutil ファイルアップロード",
    description: "ローカルファイルをGCSにアップロード",
    category: "gcloud",
    command: `gsutil cp {{ローカルパス}} gs://{{バケット名}}/{{GCSパス}}`,
  },
  {
    id: "gsutil-cp-download",
    label: "gsutil ファイルダウンロード",
    description: "GCSからローカルにダウンロード",
    category: "gcloud",
    command: `gsutil cp gs://{{バケット名}}/{{GCSパス}} {{ローカルパス}}`,
  },
  {
    id: "gsutil-ls",
    label: "gsutil ファイル一覧",
    description: "GCSバケットのファイル一覧",
    category: "gcloud",
    command: `gsutil ls gs://{{バケット名}}/{{パス（省略可）}}`,
  },
];

export const commandTemplateCategories = [
  { id: "sql", label: "SQL" },
  { id: "terraform", label: "Terraform" },
  { id: "git", label: "Git" },
  { id: "gcloud", label: "GCP/Kubernetes" },
] as const;

export function getTemplatesByCategory(
  category: CommandTemplate["category"],
): CommandTemplate[] {
  return commandTemplates.filter((t) => t.category === category);
}

export function getTemplateById(id: string): CommandTemplate | undefined {
  return commandTemplates.find((t) => t.id === id);
}
