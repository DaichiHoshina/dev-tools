# dev-tools

開発チーム向けのツール群。Web UI、CLI、ドキュメントサイトを提供する。

## ツール一覧

### Web UI

| ツール | 説明 |
|--------|------|
| [devtools-home](./devtools-home/) | ツールポータルサイト（全ツール一覧） |
| [gitlab-grep](./gitlab-grep/) | GitLab MR検索・ステータス管理・リベース |
| [sql-studio](./sql-studio/) | Redash連携SQLエディタ・ダッシュボード |
| [kube-lens](./kube-lens/) | Kubernetes可視化ダッシュボード（Pod/Deployment/Event） |
| [release-manager](./release-manager/) | リリース自動化ツール（CI/CD連携） |
| [manual-creater](./manual-creater/) | テンプレートベースのマニュアル作成 |
| [claude-session-board](./claude-session-board/) | Claude Codeセッション管理・可視化 |

### CLI

| ツール | 説明 |
|--------|------|
| [kube-deploy](./kube-deploy/) | K8s環境デプロイCLI（Go + Bash） |

## 共通技術スタック

- **Web UI**: Hono JSX / React + Vite + Tailwind CSS + DaisyUI + TypeScript
- **CLI**: Go 1.22+ / Bash 4.3+
- **インフラ連携**: kubectl, ArgoCD, GitLab CI/CD

## セットアップ

各ツールのディレクトリに移動して:

```bash
# Web UIツール
npm install
npm run dev

# Go CLI
go build ./...
./install.sh
```

環境変数は各ツールの `.env.example` を参照してください。

## デプロイ

GitLab Pages（静的サイト）またはGitLab CI経由でデプロイ可能。各ツールの `.gitlab-ci.yml` を参照。

## 新しいツールの追加

1. ルートに新しいディレクトリを作成
2. README.md を作成
3. devtools-home の tools.ts に追加してポータルに表示
