# TESフロー簡素化 + UI命名リネーム

## 概要

TES側もPRDと同様に「Helm MR作成まで」に簡素化し、UIラベルを「デプロイ」→「リリース」にリネーム。

## ステップ変更

**現状（7ステップ）→ 変更後（5ステップ）:**

| # | 現在 | 変更後 |
|---|------|--------|
| 1 | アプリMR作成 | そのまま |
| 2 | アプリMRマージ待ち | そのまま |
| 3 | releaseビルド & タグ作成 | そのまま |
| 4 | CI/CDパイプライン | そのまま |
| 5 | Helm MR作成 | そのまま（ここで終了） |
| 6 | ~~Helm MRマージ待ち~~ | **削除** |
| 7 | ~~ArgoCD Sync~~ | **削除** |

リリース完了後にArgoCD同期ボタンを手動表示（PRDと同様）。

## UI命名変換テーブル

| 現在 | 変更後 | ファイル |
|------|--------|----------|
| `Deployments - Release TES` | `TESリリース - Release TES` | tes.html |
| `Release TES Deploy UI` | `Release TES リリースUI` | tes.html |
| `Deploy` (ボタン) | `リリース` | service-table-manager |
| `Recover` (ボタン) | `リカバリー` | service-table-manager |
| `Sync` (ボタン) | **削除**（完了後に手動表示） | service-table-manager |
| `Cancel` (ボタン) | `キャンセル` | service-table-manager |
| `Deploy All (N)` | `一括リリース (N)` | client.tsx |
| `Deploy All` (ダイアログタイトル) | `一括リリース` | client.tsx |
| `デプロイ確認` | `リリース確認` | client.tsx |
| `...でデプロイしますか?` | `...でリリースしますか?` | client.tsx |
| `既にデプロイ中` | `既にリリース中` | client.tsx |
| `デプロイ対象のサービスがありません` | `リリース対象のサービスがありません` | client.tsx |
| `デプロイ完了` (通知) | `リリース完了` | client.tsx |
| `デプロイ失敗` (通知) | `リリース失敗` | client.tsx |
| `...のデプロイをキャンセルしますか?` | `...のリリースをキャンセルしますか?` | client.tsx |
| `{svc} - デプロイ完了` (カード) | `{svc} - リリース完了` | client.tsx |
| `{svc} - デプロイ失敗` (カード) | `{svc} - リリース失敗` | client.tsx |
| `デプロイ中` (tooltip/badge) | `リリース中` | service-table-manager |
| `デプロイ履歴` | `リリース履歴` | client.tsx |
| `TESデプロイ` (ホーム) | `TESリリース` | home-client.tsx |
| `TES環境へのデプロイ実施` | `TES環境へのリリース実施` | home-client.tsx |

## コントローラー側ログメッセージ

| 現在 | 変更後 | ファイル |
|------|--------|----------|
| `[INFO] デプロイ開始` | `[INFO] リリース開始` | deploy.ts |
| `[SUCCESS] デプロイ完了` | `[SUCCESS] リリース完了` | deploy.ts |
| `[ERROR] デプロイ失敗` | `[ERROR] リリース失敗` | deploy.ts |
| `[WARN] デプロイキャンセル` | `[WARN] リリースキャンセル` | deploy.ts |
| `[SUCCESS] デプロイフロー完了` | `[SUCCESS] リリースフロー完了` | deploy-mr.ts |

## 削除対象コード

### deploy-mr.ts
- Step 6（L419-501）: Helm MR自動マージ処理
- Step 7（L503-603）: Helmパイプライン待機 + ArgoCD Sync

### deploy.ts
- `recoverFromHelmMerge` メソッド
- `recoverFromArgoCDSync` メソッド

### deploy-recovery.ts
- `recoverFromHelmMerge` メソッド
- `mergeHelmMR` メソッド
- `createHelmMRAndMerge` 内のStep 6（マージ部分）
- `recoverFromStep` 内のStep 6（L198-207）

### client.tsx
- `handleSync` メソッド
- リカバリーダイアログ Step 6, 7 ボタン
- リカバリーswitch文 case 6, 7
- `onSync` コールバック

### service-table-manager.ts
- Syncボタン HTML + イベントリスナー + `onSync` インターフェース
- `setRowDeploying`/`setRowStatus` 内のsyncBtn参照

### config.ts
- `DEPLOY_STEPS` からStep 6, 7 削除（7→5）

## 追加：ArgoCD同期ボタン

PRDと同様に、リリース完了後にカードヘッダーにArgoCD同期ボタンを表示:
- `deploy-card-manager.ts`: `showArgoCDSyncButton` メソッド追加
- `client.tsx`: `handleArgoCDSync` メソッド追加（完了コールバック内でボタン表示）
- `deploy.ts`: `syncArgoCD` メソッド追加

## テスト更新

- `deploy.test.ts`: `recoverFromHelmMerge` テスト削除、ログメッセージ更新

## 変更ファイル一覧（10ファイル）

| # | ファイル | 変更種別 |
|---|----------|----------|
| 1 | `tes.html` | title, meta リネーム |
| 2 | `src/client.tsx` | ラベルリネーム + Step 6,7削除 + ArgoCD同期追加 |
| 3 | `src/home-client.tsx` | カード名・説明リネーム |
| 4 | `src/lib/config.ts` | DEPLOY_STEPS 7→5 |
| 5 | `src/lib/controller/deploy.ts` | ログリネーム + メソッド削除 + syncArgoCD追加 |
| 6 | `src/lib/controller/deploy-mr.ts` | Step 6,7 コード削除 + ログリネーム |
| 7 | `src/lib/controller/deploy-recovery.ts` | Step 6関連削除 |
| 8 | `src/lib/ui/service-table-manager.ts` | ボタンリネーム + Sync削除 |
| 9 | `src/lib/ui/deploy-card-manager.ts` | ArgoCD同期ボタン追加 |
| 10 | `src/lib/controller/__tests__/deploy.test.ts` | テスト更新 |

## 検証

- `npm run type-check`
- `npm test`
- `npm run build`
