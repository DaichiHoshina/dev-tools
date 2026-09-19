/** K8s リソース量文字列を数値に変換 (e.g. "100m" → 0.1, "2Gi" → 2147483648) */
export function parseQuantity(q: string): number {
  if (!q) return 0;
  if (q.endsWith("m")) return parseFloat(q) / 1000;
  if (q.endsWith("Ti")) return parseFloat(q) * 1024 * 1024 * 1024 * 1024;
  if (q.endsWith("Gi")) return parseFloat(q) * 1024 * 1024 * 1024;
  if (q.endsWith("Mi")) return parseFloat(q) * 1024 * 1024;
  if (q.endsWith("Ki")) return parseFloat(q) * 1024;
  return parseFloat(q);
}
