import { GITLAB_BASE, getReadToken } from "~/lib/gitlab-base";

// ─── タグ自動計算 ─────────────────────────────────────────────────────────────

/** スプリントのマイナーバージョンを週次で計算（基準日・ベースバージョンは環境変数で設定可能） */
export function calculateDefaultMinorVersion(): number {
  const baseDateStr =
    import.meta.env.VITE_VERSION_BASE_DATE ?? "2026-01-01T00:00:00+00:00";
  const baseMinor = parseInt(
    import.meta.env.VITE_VERSION_BASE_MINOR ?? "0",
    10,
  );
  const BASE_DATE = new Date(baseDateStr);
  const diffMs = Date.now() - BASE_DATE.getTime();
  const weeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return baseMinor + Math.max(0, weeks);
}

export async function getLatestTag(appRepo: string): Promise<string | null> {
  const token = getReadToken();
  if (!token) return null;

  const projectPath = encodeURIComponent(appRepo);
  // order_by=version は v タグがないリポジトリで 400 を返すため updated を使用
  const url = `${GITLAB_BASE}/projects/${projectPath}/repository/tags?order_by=updated&sort=desc&per_page=10`;

  try {
    const res = await fetch(url, { headers: { "PRIVATE-TOKEN": token } });
    if (!res.ok) return null;

    const tags = (await res.json()) as Array<{ name: string }>;
    const matched = tags.filter((t) => t.name.startsWith("v"));
    return matched.length > 0 ? matched[0].name : null;
  } catch {
    return null;
  }
}

/** 次のタグ名を計算: v3.{minor}.{build+1} または v3.{minor}.0（週が変わった場合） */
export async function calculateNextVersion(appRepo: string): Promise<string> {
  const minor = calculateDefaultMinorVersion();
  const tag = await getLatestTag(appRepo);

  if (!tag) return `3.${minor}.0`;

  const match = tag.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return `3.${minor}.0`;

  const currentMinor = parseInt(match[2], 10);
  const currentBuild = parseInt(match[3], 10);

  if (currentMinor === minor) {
    return `3.${minor}.${currentBuild + 1}`;
  }
  return `3.${minor}.0`;
}

// ─── 最新コミット取得 ─────────────────────────────────────────────────────────

interface GitLabCommitResponse {
  short_id: string;
}

/**
 * アプリリポジトリの指定ブランチの最新コミットshort hash を取得する
 * dev → main ブランチ、staging → release ブランチ
 */
export async function getLatestCommitShortHash(
  appRepo: string,
  branch: string,
): Promise<string | null> {
  const token = getReadToken();
  if (!token) return null;

  const projectPath = encodeURIComponent(appRepo);
  const url = `${GITLAB_BASE}/projects/${projectPath}/repository/commits?ref_name=${encodeURIComponent(branch)}&per_page=1`;

  try {
    const res = await fetch(url, { headers: { "PRIVATE-TOKEN": token } });
    if (!res.ok) return null;
    const commits = (await res.json()) as GitLabCommitResponse[];
    return commits[0]?.short_id ?? null;
  } catch {
    return null;
  }
}
