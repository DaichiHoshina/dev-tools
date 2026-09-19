import { GITLAB_BASE, INFRA_PROJECT, getReadToken } from "~/lib/gitlab-base";

// ─── 後方互換性のため各サブモジュールを re-export ───────────────────────────

export { hasGitLabTokens } from "~/lib/gitlab-base";

export type {
  PipelineJob,
  PipelineStatus,
  TriggeredPipeline,
} from "~/lib/gitlab-pipeline";
export {
  triggerPipeline,
  isValidJobStatus,
  getPipelineStatus,
} from "~/lib/gitlab-pipeline";

export type { MRParsed, MRDetail, MRSearchResult } from "~/lib/gitlab-mr";
export {
  parseMRUrl,
  isMRUrl,
  getMRDetail,
  extractTicketFromTitle,
  searchMRsByPrefix,
} from "~/lib/gitlab-mr";

export {
  calculateDefaultMinorVersion,
  getLatestTag,
  calculateNextVersion,
  getLatestCommitShortHash,
} from "~/lib/gitlab-version";

// ─── インフラ設定関連 ─────────────────────────────────────────────────────────

export interface BranchDiff {
  count: number;
  mrs: Array<{ id: number; title: string }>;
}

interface GitLabCompareResponse {
  commits: Array<{ id: string; message: string; title: string }>;
  compare_same_ref: boolean;
}

// GitLab Repository Files API レスポンス（最低限）
interface GitLabFileResponse {
  content: string;
  encoding: string;
}

export function extractImageTag(yaml: string): string {
  const tagMatch =
    /^\s*tag:\s*["']?([^"'\n\r]+)["']?/m.exec(yaml) ??
    /^\s*imageTag:\s*["']?([^"'\n\r]+)["']?/m.exec(yaml);
  if (tagMatch?.[1]) {
    return tagMatch[1].trim();
  }
  return "-";
}

export async function getImageTag(
  env: "staging" | "production",
  valuesFile: string,
): Promise<string> {
  const token = getReadToken();
  if (!token) return "-";

  const filePath = `environments%2F${env}%2Fvalues%2F${encodeURIComponent(valuesFile)}`;
  const url = `${GITLAB_BASE}/projects/${INFRA_PROJECT}/repository/files/${filePath}?ref=master`;

  try {
    const res = await fetch(url, {
      headers: { "PRIVATE-TOKEN": token },
    });
    if (!res.ok) return "-";

    const data = (await res.json()) as GitLabFileResponse;
    if (data.encoding !== "base64") return "-";

    const decoded = atob(data.content);
    return extractImageTag(decoded);
  } catch {
    return "-";
  }
}

/** release ブランチ → main の差分を取得（何コミット先行しているか） */
export async function getReleaseDiff(appRepo: string): Promise<BranchDiff> {
  const token = getReadToken();
  if (!token) return { count: 0, mrs: [] };

  const projectPath = encodeURIComponent(appRepo);
  const url = `${GITLAB_BASE}/projects/${projectPath}/repository/compare?from=release&to=main`;

  try {
    const res = await fetch(url, { headers: { "PRIVATE-TOKEN": token } });
    if (!res.ok) return { count: 0, mrs: [] };

    const data = (await res.json()) as GitLabCompareResponse;
    if (data.compare_same_ref) return { count: 0, mrs: [] };

    const mrMap = new Map<number, string>();
    for (const commit of data.commits) {
      const match = commit.message.match(/See merge request [^!]*!(\d+)/);
      if (match) {
        const mrId = parseInt(match[1], 10);
        if (!mrMap.has(mrId)) {
          mrMap.set(mrId, commit.title);
        }
      }
    }

    return {
      count: data.commits.length,
      mrs: Array.from(mrMap.entries()).map(([id, title]) => ({ id, title })),
    };
  } catch {
    return { count: 0, mrs: [] };
  }
}
