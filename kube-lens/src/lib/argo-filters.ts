// インフラ系アプリ（操作不要）を非表示にする
// VITE_ARGO_HIDDEN_APPS 環境変数でカンマ区切りで追加指定可能
const EXTRA_HIDDEN = (import.meta.env.VITE_ARGO_HIDDEN_APPS ?? "")
  .split(",")
  .map((s: string) => s.trim())
  .filter(Boolean);

const HIDDEN_APPS = new Set<string>(EXTRA_HIDDEN);

const HIDDEN_KEYWORDS = ["prometheus", "fluentbit", "istio"];

export function isHiddenApp(name: string): boolean {
  if (HIDDEN_APPS.has(name)) return true;
  return HIDDEN_KEYWORDS.some((kw) => name.toLowerCase().includes(kw));
}
