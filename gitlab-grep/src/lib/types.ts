export interface GitLabGroup {
  id: number;
  name: string;
  full_path: string;
  web_url: string;
}

export interface MergeRequest {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  state: MRState;
  created_at: string;
  updated_at: string;
  source_branch: string;
  target_branch: string;
  web_url: string;
  has_conflicts: boolean;
  user_notes_count: number;
  blocking_discussions_resolved: boolean;
  author: {
    username: string;
    name: string;
    avatar_url: string;
  };
  references: {
    full: string;
  };
  draft: boolean;
  labels: string[];
  // パイプライン情報（個別APIから取得）
  pipeline?: PipelineInfo | null;
  // mainとの乖離コミット数（個別APIから取得）
  diverged_commits_count?: number;
  // 承認情報（個別APIから取得）
  approval?: ApprovalInfo | null;
  // リベース状態
  rebase_in_progress?: boolean;
}

export interface ApprovalInfo {
  approved: boolean;
  approved_by: Array<{
    user: { username: string; name: string; avatar_url: string };
  }>;
}

export type MRState = "opened" | "merged" | "closed" | "all";

export interface PipelineInfo {
  id: number;
  status: PipelineStatus;
  web_url: string;
  created_at: string;
  updated_at: string;
}

export type PipelineStatus =
  | "success"
  | "failed"
  | "running"
  | "pending"
  | "canceled"
  | "skipped"
  | "created"
  | "manual"
  | "waiting_for_resource"
  | "preparing";

export interface SearchParams {
  username: string;
  groupIds: number[];
  state: MRState;
}

export type TopLevelGroup = {
  name: string;
  id: number;
  subgroups: GitLabGroup[];
};

export interface GitLabUser {
  id: number;
  username: string;
  name: string;
  avatar_url: string;
}

export interface MRNote {
  id: number;
  body: string;
  author: {
    id: number;
    username: string;
    name: string;
    avatar_url: string;
  };
  created_at: string;
  system: boolean;
  resolvable: boolean;
  resolved: boolean;
}

export const STATUS_LABELS = [
  "none",
  "pending",
  "doing",
  "review",
  "fix",
  "done",
] as const;
export type StatusLabel = (typeof STATUS_LABELS)[number];

/** マージに近い順の優先度（小さいほど上位） */
export const STATUS_PRIORITY: Record<StatusLabel, number> = {
  done: 0,
  review: 1,
  fix: 2,
  doing: 3,
  pending: 4,
  none: 5,
};

export function detectStatusLabel(labels: string[]): StatusLabel {
  const lower = labels.map((l) => l.toLowerCase());
  for (const s of ["done", "fix", "review", "doing", "pending"] as const) {
    if (lower.includes(s)) return s;
  }
  return "none";
}
