# Kube Lens

K8s初心者向けダッシュボード。Pod / Deployment / Event をわかりやすく表示する汎用ツール。

- **技術スタック**: Hono JSX + Vite + DaisyUI + Tailwind CSS + TypeScript

---

## 前提条件

| 項目 | 内容 |
|------|------|
| Node.js | 18 以上 |
| kubectl | インストール済み |
| K8sコンテキスト | 環境変数で設定 |

---

## セットアップ

```bash
npm install
```

`.env` を作成して以下を設定（任意）:

```
# GitLab 連携を使用する場合
VITE_GITLAB_HOST=gitlab.example.com
VITE_GITLAB_READ_TOKEN=<GitLab Read Token>
VITE_GITLAB_INFRA_PROJECT=<URL-encoded project path>
VITE_GITLAB_RELEASE_PROJECT=<URL-encoded project path>

# K8s コンテキスト名（デフォルト値を上書き）
K8S_CONTEXT_DEV=my-cluster-dev
K8S_CONTEXT_STAGING=my-cluster-staging
K8S_CONTEXT_PRODUCTION=my-cluster-production

# バージョン計算の基準日・基準バージョン（任意）
VITE_VERSION_BASE_DATE=2026-01-01T00:00:00+00:00
VITE_VERSION_BASE_MINOR=0

# GitLab Pages デプロイ用ベースパス
VITE_BASE_PATH=/kube-lens/
```

---

## 起動

```bash
npm run dev
```

- 3環境の kubectl proxy を並列起動（ポート: 8001/dev, 8002/staging, 8003/production）
- ブラウザで http://localhost:3002 にアクセス

### その他のコマンド

| コマンド | 内容 |
|----------|------|
| `npm run dev:vite` | Vite dev server のみ（proxy 別途起動時） |
| `npm run build` | 本番ビルド |
| `npm run type-check` | 型チェック |
| `npm run test` | テスト実行 |

---

## 主要機能

| 機能 | 概要 |
|------|------|
| ダッシュボード | Pod / Deployment / Event / Quota の概観 |
| Pod | 一覧・詳細・ログ表示 |
| Deployment | 一覧・ステータス監視 |
| Jobs | CronJob / Job 一覧・失敗検知 |
| Events | 警告・通常イベント |
| Logs | Pod ログストリーミング |
| ArgoCD | ArgoCD 統合 |
| Deploy | イメージオーバーライド |
| Release | GitLab パイプライン・リリース管理 |
| ConfigMaps / Secrets | 閲覧 |
| Network | Ingress / Service / NetworkPolicy |
| Storage | PVC / PV |
| Quotas | ResourceQuota・使用率 |
| Compare | 環境間リソース比較 |
| Env Check | 環境設定検証 |

---

## カスタマイズ

### サービス定義の変更

`src/lib/service-registry.ts` の `SERVICE_REGISTRY` を自分のサービスに合わせて編集してください。

```ts
export const SERVICE_REGISTRY: ServiceDef[] = [
  {
    key: "api-server",
    name: "api-server",
    label: "API Server",
    namespace: "backend",
    argoDevApp: "myapp-dev-api-server",
    argoTesApp: "myapp-staging-api-server",
    appRepo: "my-org/my-repo",
  },
  // ...
];
```

### コンテキスト名の変更

`K8S_CONTEXT_DEV`, `K8S_CONTEXT_STAGING`, `K8S_CONTEXT_PRODUCTION` 環境変数で設定します。

---

## ディレクトリ構成

```
kube-lens/
├── src/
│   ├── components/   共通コンポーネント
│   ├── pages/        各機能ページ
│   ├── hooks/        カスタムフック
│   └── lib/          ユーティリティ・クライアント
├── scripts/          kubectl proxy 起動スクリプト
├── static/           静的ファイル
└── vite.config.ts
```
