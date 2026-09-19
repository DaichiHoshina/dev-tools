import type {
  GitLabGroup,
  GitLabUser,
  MergeRequest,
  MRNote,
  PipelineInfo,
  ApprovalInfo,
  MRState,
} from "./types";

// dev: Viteプロキシ経由、prod: GitLab API直接
const GITLAB_API_BASE = import.meta.env.DEV
  ? "/gitlab-api/api/v4"
  : `${import.meta.env.VITE_GITLAB_URL || "https://gitlab.example.com"}/api/v4`;

function getToken(): string {
  return import.meta.env.VITE_GITLAB_TOKEN ?? "";
}

async function gitlabFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${GITLAB_API_BASE}${path}`, {
    ...options,
    headers: {
      "PRIVATE-TOKEN": getToken(),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`GitLab API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function searchUsers(query: string): Promise<GitLabUser[]> {
  if (!query.trim()) return [];
  return gitlabFetch<GitLabUser[]>(
    `/users?search=${encodeURIComponent(query)}&per_page=10`,
  );
}

export async function fetchGroups(): Promise<GitLabGroup[]> {
  const groups = await gitlabFetch<GitLabGroup[]>(
    "/groups?min_access_level=10&per_page=100",
  );
  return groups.sort((a, b) => a.full_path.localeCompare(b.full_path));
}

export async function fetchGroupMRs(
  groupId: number,
  authorUsername: string,
  state: MRState,
): Promise<MergeRequest[]> {
  const stateParam = state === "all" ? "" : `&state=${state}`;
  return gitlabFetch<MergeRequest[]>(
    `/groups/${groupId}/merge_requests?author_username=${encodeURIComponent(authorUsername)}&per_page=100${stateParam}`,
  );
}

export async function fetchMRDetails(
  projectId: number,
  mrIid: number,
): Promise<{
  pipeline: PipelineInfo | null;
  diverged_commits_count: number;
  approval: ApprovalInfo | null;
  labels: string[];
}> {
  const [mr, approval] = await Promise.all([
    gitlabFetch<{
      head_pipeline: PipelineInfo | null;
      diverged_commits_count: number;
      labels: string[];
    }>(
      `/projects/${projectId}/merge_requests/${mrIid}?include_diverged_commits_count=true`,
    ),
    gitlabFetch<ApprovalInfo>(
      `/projects/${projectId}/merge_requests/${mrIid}/approvals`,
    ).catch(() => null),
  ]);
  return {
    pipeline: mr.head_pipeline,
    diverged_commits_count: mr.diverged_commits_count ?? 0,
    approval,
    labels: mr.labels ?? [],
  };
}

export async function rebaseMR(
  projectId: number,
  mrIid: number,
): Promise<void> {
  await gitlabFetch(`/projects/${projectId}/merge_requests/${mrIid}/rebase`, {
    method: "PUT",
  });
}

export async function switchMRStatusLabel(
  projectId: number,
  mrIid: number,
  removeLabel: string | null,
  addLabel: string | null,
): Promise<void> {
  const body: Record<string, string> = {};
  if (removeLabel) body.remove_labels = removeLabel;
  if (addLabel) body.add_labels = addLabel;
  if (Object.keys(body).length === 0) return;
  await gitlabFetch<unknown>(`/projects/${projectId}/merge_requests/${mrIid}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchMRNotes(
  projectId: number,
  mrIid: number,
): Promise<MRNote[]> {
  const notes = await gitlabFetch<MRNote[]>(
    `/projects/${projectId}/merge_requests/${mrIid}/notes?per_page=100&sort=asc`,
  );
  return notes.filter((n) => !n.system);
}

export async function checkRebaseStatus(
  projectId: number,
  mrIid: number,
): Promise<{ rebase_in_progress: boolean; has_conflicts: boolean }> {
  const mr = await gitlabFetch<{
    rebase_in_progress: boolean;
    has_conflicts: boolean;
  }>(
    `/projects/${projectId}/merge_requests/${mrIid}?include_rebase_in_progress=true`,
  );
  return {
    rebase_in_progress: mr.rebase_in_progress,
    has_conflicts: mr.has_conflicts,
  };
}
