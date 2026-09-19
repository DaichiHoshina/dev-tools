export interface RouteMatch {
  pattern: string;
  params: Record<string, string>;
}

// ルートパターン定義（順序重要：具体的なものを先に）
const ROUTE_PATTERNS = [
  "/pods/:name",
  "/pods",
  "/deployments",
  "/jobs",
  "/events",
  "/argocd",
  "/cluster",
  "/migration",
  "/deploy",
  "/release",
  "/error-logs",
  "/logs",
  "/configmaps",
  "/network",
  "/storage",
  "/quotas",
  "/compare",
  "/env-check",
  "/k8s-map",
  "/settings",
  "/",
  "",
] as const;

export function matchRoute(path: string): RouteMatch {
  // path: "/pods/my-pod" → { pattern: "/pods/:name", params: { name: "my-pod" } }
  // クリーンアップ: #を除去
  const cleanPath = path.startsWith("#") ? path.slice(1) : path;
  const normalizedPath = cleanPath || "/";

  for (const pattern of ROUTE_PATTERNS) {
    const result = matchPattern(pattern, normalizedPath);
    if (result !== null) {
      return { pattern, params: result };
    }
  }
  return { pattern: "/", params: {} };
}

export function matchPattern(
  pattern: string,
  path: string,
): Record<string, string> | null {
  // パターンをセグメントに分割して照合
  // "/pods/:name" と "/pods/my-pod" を照合し { name: "my-pod" } を返す
  const patternSegments = pattern.split("/").filter(Boolean);
  const pathSegments = path.split("?")[0].split("/").filter(Boolean);

  if (patternSegments.length !== pathSegments.length) return null;

  const params: Record<string, string> = {};

  for (let i = 0; i < patternSegments.length; i++) {
    const pSeg = patternSegments[i];
    const pathSeg = pathSegments[i];
    if (pSeg.startsWith(":")) {
      params[pSeg.slice(1)] = decodeURIComponent(pathSeg);
    } else if (pSeg !== pathSeg) {
      return null;
    }
  }

  return params;
}

export function navigate(path: string): void {
  window.location.hash = path;
}

export function getHashPath(): string {
  return window.location.hash.replace(/^#/, "") || "/";
}

// URLクエリパラメータを解析（例: #/logs?pod=xxx&container=yyy）
export function getQueryParams(): Record<string, string> {
  const hash = window.location.hash;
  const queryStart = hash.indexOf("?");
  if (queryStart === -1) return {};
  const queryString = hash.slice(queryStart + 1);
  const params: Record<string, string> = {};
  for (const pair of queryString.split("&")) {
    const [key, value] = pair.split("=");
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(value ?? "");
  }
  return params;
}
