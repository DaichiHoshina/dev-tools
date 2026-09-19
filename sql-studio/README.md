# SQL Studio

dev/tes環境のDBをブラウザからクエリ実行・閲覧できるWebツール。Redash APIを利用。

---

## 前提条件

- Node.js 18+
- Redashインスタンスへのアクセス権とAPIキー

## セットアップ

```bash
npm install
```

### 環境変数

プロジェクトルートに `.env` を作成して以下を設定:

```
REDASH_URL=<Redash URL>
REDASH_API_KEY=<Redash API Key>

# 環境別（オプション。省略時は上記をフォールバック）
REDASH_URL_DEV=https://redash-dev.example.com
REDASH_API_KEY_DEV=<dev API Key>
REDASH_URL_TES=https://redash-tes.example.com
REDASH_API_KEY_TES=<tes API Key>
```

## 起動

```bash
npm run dev   # フロント(5175) + バック(3013) 同時起動
```

ブラウザで `http://localhost:5175` を開く。

---

## 主要機能

| 機能 | 説明 |
|------|------|
| **Editorモード** | CodeMirrorベースのSQLエディタ。自動補完対応、Cmd+Enterで実行 |
| **Dashboardモード** | 保存済みクエリをグリッド表示。Table/Line/Bar/Stat可視化 |
| **Browserモード** | テーブル一覧・カラム情報の閲覧、SELECT文自動生成 |
| **環境切替** | ヘッダーでDEV/TES/PRDを切替 |
| **クエリ管理** | ローカル保存、実行履歴、テンプレート機能 |
| **Redash連携** | クエリ一括インポート、ダッシュボード自動生成 |
| **URL共有** | クエリをURLパラメータでシェア |

---

## 技術スタック

- **フロント**: React 18 + Vite + TypeScript + CodeMirror
- **バック**: Hono + TypeScript
- **構造**: monorepo（`web/frontend` + `web/backend`）
- **データ保存**: `web/backend/data/` にJSONで保存（ローカル専用）

---

## 注意

- **tes/prd環境は読み取り専用**。データ変更系のクエリ（INSERT/UPDATE/DELETE等）は実行しないこと
- `.env` にAPIキーを含むため、Gitにコミットしないよう注意
