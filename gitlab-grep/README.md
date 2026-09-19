# GitLab Grep

GitLab MR検索ツール。ユーザー別MR一覧・パイプライン状態・リベース・Slack共有。

- URL: https://your-domain.example.com/devtools/gitlab-grep/
- 技術スタック: Hono JSX + Vite + DaisyUI + Tailwind CSS + TypeScript

---

## 前提条件

- Node.js 18+
- GitLab Personal Access Token（`api` scope）

---

## セットアップ

```bash
npm install
```

`.env` を作成して以下を設定:

```
VITE_GITLAB_TOKEN=<GitLab Personal Access Token>
```

---

## 起動

```bash
npm run dev   # http://localhost:3005 で起動
```

---

## 主要機能

- **検索**: ユーザー名でMR検索、グループ複数選択、ステータスフィルタ（Opened / Merged / Closed / All）
- **MRカード表示**: パイプラインバッジ、承認情報、コンフリクト有無、コメント数
- **リベース**: ワンクリックリベース、リアルタイムステータス追跡
- **ステータスラベル管理**: `none / pending / doing / review / fix / done` をGitLabラベルと連動
- **Slack共有**: MR URLをHTMLリンク形式でコピー（Slack貼り付け用）
- **コメント表示**: モーダルでMRコメント詳細確認

---

## ディレクトリ構成

```
src/
├── App.tsx              # メイン
└── components/
    ├── SearchForm.tsx   # 検索フォーム
    ├── MRList.tsx       # MR一覧
    ├── MRCard.tsx       # MRカード
    ├── PipelineBadge.tsx # パイプラインバッジ
    └── CommentsModal.tsx # コメントモーダル
```
