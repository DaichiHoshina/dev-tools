import { DEPLOY_SERVICES } from "~/lib/deploy-config";
import type { DeployService } from "~/lib/deploy-config";
import { GITLAB_BASE, GITLAB_HOST, getReadToken } from "~/lib/gitlab-base";

export interface MRParsed {
  projectPath: string; // リポジトリパス
  mrIid: number;
}

export interface MRDetail {
  title: string;
  sourceBranch: string;
  webUrl: string;
  projectPath: string;
}

export interface MRSearchResult extends MRDetail {
  service: DeployService;
}

interface GitLabMRResponse {
  title: string;
  source_branch: string;
  web_url: string;
}

/**
 * MR URL からプロジェクトパスと MR IID を抽出する
 * 例: "https://gitlab.example.com/my-org/my-repo/-/merge_requests/73"
 * → { projectPath: "my-org/my-repo", mrIid: 73 }
 */
export function parseMRUrl(url: string): MRParsed | null {
  const pattern = new RegExp(
    `${GITLAB_HOST.replace(/\./g, "\\.")}/(.+?)/-/merge_requests/(\\d+)`,
  );
  const match = url.match(pattern);
  if (!match) return null;
  return { projectPath: match[1], mrIid: parseInt(match[2], 10) };
}

/** MR URL かどうかを判定する */
export function isMRUrl(value: string): boolean {
  return value.includes(GITLAB_HOST) && value.includes("merge_requests");
}

/** MR の詳細情報を取得する */
export async function getMRDetail(
  projectPath: string,
  mrIid: number,
): Promise<MRDetail> {
  const token = getReadToken();
  if (!token) throw new Error("GitLab Read Token が設定されていません");

  const encodedPath = encodeURIComponent(projectPath);
  const url = `${GITLAB_BASE}/projects/${encodedPath}/merge_requests/${mrIid}`;

  const res = await fetch(url, { headers: { "PRIVATE-TOKEN": token } });
  if (!res.ok) {
    throw new Error(`MR取得失敗: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as GitLabMRResponse;
  return {
    title: data.title,
    sourceBranch: data.source_branch,
    webUrl: data.web_url,
    projectPath,
  };
}

/** MR タイトルからチケット番号を抽出する（例: "PROJ-123"） */
export function extractTicketFromTitle(title: string): string {
  const match = title.match(/[A-Z]+-\d+/);
  return match ? match[0] : "";
}

/**
 * DEPLOY_SERVICES 全 appRepo に対して並列で MR を検索する。
 * prefix（例: "[refactor]"）をタイトルに含む opened な MR を返す。
 */
export async function searchMRsByPrefix(
  prefix: string,
): Promise<MRSearchResult[]> {
  const token = getReadToken();
  if (!token) throw new Error("GitLab Read Token が設定されていません");

  const results = await Promise.all(
    DEPLOY_SERVICES.map(async (svc) => {
      const encodedPath = encodeURIComponent(svc.appRepo);
      const url = `${GITLAB_BASE}/projects/${encodedPath}/merge_requests?search=${encodeURIComponent(prefix)}&state=opened&per_page=20`;

      try {
        const res = await fetch(url, {
          headers: { "PRIVATE-TOKEN": token },
        });
        if (!res.ok) return [];

        const mrs = (await res.json()) as GitLabMRResponse[];
        return mrs.map(
          (mr): MRSearchResult => ({
            title: mr.title,
            sourceBranch: mr.source_branch,
            webUrl: mr.web_url,
            projectPath: svc.appRepo,
            service: svc,
          }),
        );
      } catch {
        return [];
      }
    }),
  );

  return results.flat();
}
