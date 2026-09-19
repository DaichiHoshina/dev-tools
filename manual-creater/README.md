# Manual Creater

テンプレートベースで各種手順書・マニュアルを作成するWebアプリケーション。

## 技術スタック

- React + Vite + Tailwind CSS
- TypeScript
- React Router

## ディレクトリ構成

```
manual-creater/
├── src/
│   ├── App.tsx              # ルーティング
│   ├── components/
│   │   ├── Layout.tsx       # 共通レイアウト
│   │   ├── TemplateList.tsx # テンプレート一覧
│   │   ├── TemplateForm.tsx # フォーム入力
│   │   ├── ToolList.tsx     # ツール一覧
│   │   └── TempNodeCommands.tsx # Kubernetesコマンド一覧
│   ├── data/
│   │   ├── services.ts      # サービス定義（カスタマイズ用）
│   │   ├── tools.ts         # ツール定義（カスタマイズ用）
│   │   └── command-templates.ts # コマンドテンプレート
│   └── templates/           # 手順書テンプレート定義
├── static/                  # アイコン・画像
├── .gitlab-ci.yml
└── package.json
```

## 前提条件

- Node.js 18+
- npm 9+

## 開発

```bash
# インストール
npm install

# ローカルサーバー起動
npm run dev
```

ブラウザで http://localhost:5173 にアクセス。

## カスタマイズ

### サービス定義の変更

`src/data/services.ts` の `projects` オブジェクトを編集してプロジェクト名・サービス名・クラスター情報を設定する。

### テンプレート追加方法

`src/templates/` に新しいテンプレートファイルを追加し、`src/templates/index.ts` にインポートを追記する:

```typescript
export const myTemplate: Template = {
  id: "my-template",
  name: "My Template",
  description: "テンプレート説明",
  category: "operation",
  sections: [
    {
      id: "basic",
      title: "基本情報",
      fields: [
        { id: "title", label: "タイトル", type: "text", required: true },
      ],
    },
  ],
  outputTemplate: `# {{title}}`,
};
```

## 機能

- テンプレートベース入力
- リアルタイムプレビュー
- Markdown出力
- 下書き保存（ブラウザのlocalStorage）
- Kubernetesコマンド生成
