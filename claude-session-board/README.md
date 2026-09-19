# Claude Session Board

起動中の Claude Code セッションをリアルタイムで可視化するダッシュボード。

## 機能

- 実行中の Claude Code プロセスをリアルタイム表示
- セッションごとの最新会話プレビュー
- Jira チケットキーの自動抽出・タイトル表示
- セッション履歴の閲覧・全文検索
- iTerm2 連携（セッションへのフォーカス、再開）
- インタラクティブターミナル（WebSocket）

## 前提条件

- Node.js 20+
- macOS（iTerm2 連携機能を使う場合は iTerm2 が必要）
- `~/.claude/projects/` に Claude Code のセッションデータが存在すること

## セットアップ

```bash
# 依存パッケージをインストール
npm install

# 環境変数ファイルを作成
cp .env.example .env
# .env を編集して各変数を設定

# 開発サーバーを起動（バックエンド + フロントエンド）
npm run dev
```

バックエンドは `http://localhost:3010`、フロントエンドは `http://localhost:5174` で起動します。

## 環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| `CLAUDE_DIR` | Claude Code のプロジェクトデータディレクトリ | `~/.claude/projects` |
| `PORT` | バックエンド API のポート番号 | `3010` |
| `ATLASSIAN_SITE_NAME` | Atlassian サイト名（例: `your-org`） | `your-org` |
| `ATLASSIAN_USER_EMAIL` | Atlassian アカウントのメールアドレス | （空欄時は Jira 連携無効） |
| `ATLASSIAN_API_TOKEN` | Atlassian API トークン | （空欄時は Jira 連携無効） |

## ディレクトリ構成

```
claude-session-board/
├── web/
│   ├── backend/          Hono ベースの API サーバー
│   │   └── src/
│   │       ├── index.ts  メイン API エンドポイント
│   │       └── terminal.ts  WebSocket ターミナル
│   └── frontend/         Vite + React フロントエンド
├── .env.example          環境変数テンプレート
└── package.json          ワークスペース定義
```

## API エンドポイント

| エンドポイント | 説明 |
|--------------|------|
| `GET /api/active` | 起動中のセッション一覧（会話プレビュー付き） |
| `GET /api/projects` | プロジェクト一覧 |
| `GET /api/sessions` | セッション履歴一覧 |
| `GET /api/sessions/:id` | セッション詳細 |
| `GET /api/search?q=<keyword>` | セッション全文検索 |
| `GET /api/stats` | 統計情報 |
| `POST /api/active/focus` | iTerm2 セッションにフォーカス |
| `POST /api/active/open-terminal` | iTerm2 でセッションを再開 |
| `POST /api/launch` | iTerm2 で新規セッションを起動 |
