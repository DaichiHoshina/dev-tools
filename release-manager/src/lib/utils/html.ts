/**
 * HTML エスケープユーティリティ
 * innerHTML に外部文字列を埋め込む際に使用する
 */
export function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
