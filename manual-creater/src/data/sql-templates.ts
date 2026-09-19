export interface SqlTemplate {
  label: string;
  description: string;
  sql: string;
}

export const SQL_TEMPLATES: SqlTemplate[] = [
  {
    label: "データ確認",
    description: "現在の状態を確認",
    sql: `SELECT *
FROM {テーブル名}
WHERE id = {対象ID};`,
  },
  {
    label: "バックアップ作成",
    description: "更新前にバックアップテーブルを作成",
    sql: `CREATE TABLE {テーブル名}_bk_{YYYYMMDD} AS
SELECT * FROM {テーブル名}
WHERE id = {対象ID};`,
  },
  {
    label: "データ更新（トランザクション）",
    description: "BEGIN〜COMMITで安全に更新",
    sql: `BEGIN;

-- 更新前確認
SELECT id, {カラム名}
FROM {テーブル名}
WHERE id = {対象ID};

-- 更新
UPDATE {テーブル名}
SET {カラム名} = '{新しい値}'
WHERE id = {対象ID};

-- 更新後確認
SELECT id, {カラム名}
FROM {テーブル名}
WHERE id = {対象ID};

COMMIT;`,
  },
  {
    label: "論理削除",
    description: "deleted_at を設定して論理削除",
    sql: `BEGIN;

-- 削除前確認
SELECT id, deleted_at
FROM {テーブル名}
WHERE id = {対象ID};

-- 論理削除
UPDATE {テーブル名}
SET deleted_at = NOW()
WHERE id = {対象ID}
  AND deleted_at IS NULL;

-- 削除後確認
SELECT id, deleted_at
FROM {テーブル名}
WHERE id = {対象ID};

COMMIT;`,
  },
  {
    label: "レコード更新（トランザクション・複数カラム確認）",
    description: "複数カラムの確認を含む更新パターン",
    sql: `BEGIN;

-- 更新前確認
SELECT id, {カラム名1}, {カラム名2}, deleted_at
FROM {テーブル名}
WHERE id = {対象ID};

-- 更新（必要なカラムのみ変更）
UPDATE {テーブル名}
SET {カラム名} = '{新しい値}'
WHERE id = {対象ID};

-- 更新後確認
SELECT id, {カラム名1}, {カラム名2}, deleted_at
FROM {テーブル名}
WHERE id = {対象ID};

COMMIT;`,
  },
  {
    label: "切り戻し（バックアップから復元）",
    description: "バックアップテーブルから元の値に復元",
    sql: `BEGIN;

-- バックアップ確認
SELECT * FROM {テーブル名}_bk_{YYYYMMDD}
WHERE id = {対象ID};

-- 復元
UPDATE {テーブル名} t
JOIN {テーブル名}_bk_{YYYYMMDD} bk ON t.id = bk.id
SET t.{カラム名} = bk.{カラム名}
WHERE t.id = {対象ID};

-- 復元後確認
SELECT id, {カラム名}
FROM {テーブル名}
WHERE id = {対象ID};

COMMIT;`,
  },
];
