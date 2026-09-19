# DevTools Home

チーム開発ツールを一覧表示するポータルサイト。各ツールへのリンク・説明・ステータスをカード形式で提供する。

## URL

https://your-domain.example.com/devtools/devtools-home/

---

## DevTools 全体ガイド

このポータルサイトは以下のツール群をまとめて提供しています。

### Web UI

| ツール | URL | 説明 |
|-------|-----|------|
| Kube Lens | https://your-domain.example.com/devtools/kube-lens/ | K8s ダッシュボード |
| Release Manager | https://your-domain.example.com/devtools/release-manager/ | リリース管理 |
| GitLab Grep | https://your-domain.example.com/devtools/gitlab-grep/ | MR 検索 |
| SQL Studio | https://your-domain.example.com/devtools/sql-studio/ | DB クエリ実行 |
| Claude Session Board | https://your-domain.example.com/devtools/claude-session-board/ | Claude セッション可視化 |
| Manual Creater | https://your-domain.example.com/devtools/manual-creater/ | 手順書作成 |

### CLI

| ツール | 使い方 | 説明 |
|-------|-------|------|
| kube-deploy | `kube-deploy <ticket-id>` | Kubernetes デプロイ |

詳細は各ツールのREADMEを参照してください。

---

## 技術スタック

- React + Vite + Tailwind CSS
- TypeScript
- GitLab Pages

## ディレクトリ構成

```
devtools-home/
├── src/
│   ├── App.tsx              # メインコンポーネント（カテゴリ別表示）
│   ├── components/
│   │   ├── Header.tsx       # ヘッダー
│   │   ├── Footer.tsx       # フッター
│   │   └── ToolCard.tsx     # ツールカード
│   └── data/
│       └── tools.ts         # ツール定義（リンク・説明・ステータス）
├── static/                  # アイコン画像
├── .gitlab-ci.yml           # GitLab Pages自動デプロイ
└── package.json
```

## 開発

```bash
# インストール
npm install

# ローカルサーバー起動
npm run dev
```

ブラウザで http://localhost:5173 にアクセス。

## ツール追加方法

新しいツールを追加する場合は `src/data/tools.ts` を編集する。

```typescript
export const tools: Tool[] = [
  {
    id: "my-tool",
    name: "My Tool",
    description: "ツールの説明",
    url: "https://...",
    type: "web",           // "web" | "docs" | "cli" | "library"
    status: "active",      // "active" | "coming-soon"
    tags: ["tag1", "tag2"]
  }
];
```

変更後、GitLab CIが自動でビルド・デプロイする。

## カテゴリ別表示

- **Web アプリ**: ブラウザで直接使えるツール
- **ドキュメント**: 仕様書・手順書サイト
- **CLI / Library**: コマンドラインツール・ライブラリ

## カードのステータス

| ステータス | 表示 | 意味 |
|-----------|------|------|
| `active` | リンク可能 | 使用可能 |
| `coming-soon` | グレーアウト | 準備中 |
