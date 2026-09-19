# Release Manager

GitLab CI/CD を使ったサービスのリリース自動化ツール。

ステージング環境へのデプロイと、ステージング→本番への昇格を自動化する。
GitLab CI/CD パイプラインを手動実行し、`SERVICE_NAME` と `VERSION` を指定するだけでデプロイが完了する。

---

## 概要

- **Deploy**: アプリMR作成・マージ → タグ作成 → CI/CD → Helm MR作成・マージ → ArgoCD Sync
- **Promote**: ステージング環境のイメージタグを本番環境に昇格するMRを作成（手動マージ）
- **UI**: GitLab Pages でホストされるWebUI。ブラウザからデプロイ・昇格・ロールバックを操作できる

---

## セットアップ

### 1. サービス定義の設定

`config/release-config.yaml` を編集してサービスを定義する。

```yaml
services:
  api-server:
    app_repo: your-org/your-app/api-server  # GitLab プロジェクトパス
    values_file: api-server.yaml             # Helm values ファイル名
    argocd_app: your-app-staging-api-server  # ArgoCD ステージングアプリ名
    prd_argocd_app: your-app-production-api-server  # ArgoCD 本番アプリ名
    namespace: default                        # Kubernetes namespace
    tag_prefix: v                             # タグプレフィックス
```

### 2. GitLabトークンの作成

2つの Project Access Token が必要。

#### DEPLOY_GITLAB_TOKEN (アプリリポジトリ用)

アプリリポジトリ（またはグループ）で作成する。

| 項目 | 値 |
|------|-----|
| Role | Maintainer |
| Scopes | `api` |
| 用途 | App MR作成・承認・マージ、タグ作成、パイプライン読み取り |

#### INFRA_GITLAB_TOKEN (インフラリポジトリ用)

Helm values を管理するインフラリポジトリで作成する。

| 項目 | 値 |
|------|-----|
| Role | Maintainer |
| Scopes | `api` |
| 用途 | Helmブランチ作成、values.yaml読み書き、Helm MR作成・承認・マージ |

### 3. CI/CD変数の登録

このリポジトリの **Settings → CI/CD → Variables** で以下を登録する。

| 変数名 | Type | Protected | Masked | 説明 |
|--------|------|-----------|--------|------|
| `DEPLOY_GITLAB_TOKEN` | Variable | Yes | Yes | アプリリポジトリ用トークン |
| `INFRA_GITLAB_TOKEN` | Variable | Yes | Yes | インフラリポジトリ用トークン |
| `PIPELINE_TRIGGER_TOKEN` | Variable | Yes | Yes | パイプライントリガートークン（UI用） |
| `READ_TOKEN` | Variable | Yes | Yes | 読み取り専用トークン（UI用） |

### 4. 環境変数の設定

`scripts/lib/config.sh` の以下の変数を実際の値に合わせる（またはCI/CD変数として設定）。

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| `INFRA_PROJECT_PATH` | インフラリポジトリのプロジェクトパス | `your-org/infrastructure/helm/application` |
| `GITLAB_BASE_URL` | GitLab インスタンスURL | `https://gitlab.example.com` |

`src/lib/config.ts` の `CONFIG.GITLAB` もGitLabインスタンスURL・プロジェクトIDに合わせて更新する。

### 5. 動作確認 (DRY_RUN)

```
CI/CD → Pipelines → Run pipeline
  Branch: master
  Variables:
    SERVICE_NAME = api-server
    DRY_RUN = true
```

---

## 使い方

### デプロイ (Staging)

```
CI/CD → Pipelines → Run pipeline
  Branch: master
  Variables:
    SERVICE_NAME = api-server   # または web-frontend, worker など
    VERSION = (空欄)            # 空欄で自動計算
    TARGET = tes
```

### 本番昇格

```
CI/CD → Pipelines → Run pipeline
  Branch: master
  Variables:
    SERVICE_NAME = api-server
    TARGET = prd
```

昇格MRが作成される。レビュー・承認後に手動でマージする。

### 複数サービスのデプロイ

```
SERVICE_NAME = api-server,web-frontend,worker
```

または差分があるサービスを自動検出:

```
SERVICE_NAME = all
```

---

## デプロイフロー

```
deploy ジョブ (deploy.sh)

  Step 1: App MR作成 (main → release)
  Step 2: App MR承認・マージ
  Step 3: release パイプライン完了待ち
  Step 4: タグ作成 (release ref)
  Step 5: タグパイプライン完了待ち
  Step 6: Helmブランチ作成 + values更新
  Step 7: Helm MR作成 + 承認・マージ
  Step 8: Helm パイプライン完了待ち
```

全ステップがべき等に設計されている。失敗した場合は **Retry** で続きから再開できる。

### App MRのスキップ

```
SKIP_APP_MR = true
```

Helm values の更新のみ行う（タグが既に存在する場合に使用）。

---

## 昇格フロー

```
promote ジョブ (promote-env.sh)

  Step 1: ステージング values.yaml からタグ取得
  Step 2: 本番環境との差分確認 (同一なら終了)
  Step 3: Helmブランチ作成
  Step 4: 本番 values.yaml 更新
  Step 5: Helm MR作成 (自動マージしない)
         → レビュー・承認後に手動マージ
```

---

## バージョン自動計算

`VERSION` を空欄にすると、スプリントベースで自動計算される。

```
VERSION = {SPRINT_MAJOR}.{minor}.{patch}
```

環境変数でカスタマイズ可能:

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| `SPRINT_MAJOR` | メジャーバージョン | `1` |
| `SPRINT_BASE_DATE` | 基準日時 (UTC) | `2026-01-01 00:00:00` |
| `SPRINT_BASE_MINOR` | 基準日のマイナーバージョン | `1` |

---

## ArgoCD Sync

デプロイ完了後に自動的に ArgoCD Sync を実行する。以下のCI変数が設定されている場合に有効:

| 変数名 | 説明 |
|--------|------|
| `K8S_SERVER` | Kubernetes API エンドポイント |
| `K8S_TOKEN` | Kubernetes ServiceAccount トークン |
| `ARGOCD_AUTH_TOKEN` | ArgoCD 認証トークン |

または手動でSyncのみ実行:

```
SERVICE_NAME = api-server
ARGOCD_SYNC = true
```

---

## プロジェクト構成

```
release-manager/
├── .gitlab-ci.yml                # CI/CDパイプライン定義
├── config/
│   └── release-config.yaml       # サービス定義
├── scripts/
│   ├── deploy.sh                 # デプロイ エントリポイント
│   ├── deploy-multi.sh           # 複数サービス並列デプロイ
│   ├── promote-env.sh            # 昇格 エントリポイント
│   ├── promote-multi.sh          # 複数サービス並列昇格
│   ├── argocd-sync.sh            # ArgoCD Sync
│   ├── argocd-get-tag.sh         # ArgoCD ライブタグ取得
│   └── lib/
│       ├── gitlab-api.sh         # GitLab REST API ラッパー
│       ├── config.sh             # 設定読み込み・バリデーション・バージョン計算
│       ├── app-mr.sh             # App MR作成・承認・マージ
│       ├── tag.sh                # タグ作成・パイプライン待機
│       ├── helm.sh               # Helm MR作成・マージ・関連MR収集・パイプライン待機
│       ├── promote.sh            # 昇格ロジック
│       └── migration.sh          # マイグレーション検出・Slack通知
└── src/                          # Deploy UI (GitLab Pages)
    ├── lib/
    │   ├── config.ts             # 設定定数
    │   ├── api/gitlab.ts         # GitLab API クライアント
    │   ├── controller/           # デプロイ・昇格コントローラー
    │   └── ui/                   # UIコンポーネント
    ├── client.tsx                # デプロイUI
    ├── prd-client.tsx            # 昇格UI
    ├── branch-client.tsx         # ブランチ作成UI
    └── home-client.tsx           # フローUI
```

---

## Slack通知

マイグレーションファイルの変更を検出した場合に Slack 通知を送信する。

| 変数名 | 説明 |
|--------|------|
| `SLACK_WEBHOOK_URL` | Slack Webhook URL (共通) |
| `SLACK_WEBHOOK_URL_TES` | ステージング用 Webhook URL |
| `SLACK_WEBHOOK_URL_PRD` | 本番用 Webhook URL |
