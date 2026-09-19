// サイドカーコンテナの除外判定（istio, otel等）
const HIDDEN_EXACT = new Set(["istio-proxy", "istio-init"]);
const HIDDEN_PREFIX = ["otel", "otc-", "opentelemetry"];

export function isHiddenContainer(name: string): boolean {
  if (HIDDEN_EXACT.has(name)) return true;
  return HIDDEN_PREFIX.some((p) => name.startsWith(p));
}
