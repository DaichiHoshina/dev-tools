// PRDロールバック設定

export interface RollbackStep {
  id: number;
  name: string;
  icon: string;
}

export const ROLLBACK_STEPS: readonly RollbackStep[] = [
  { id: 1, name: "バージョン履歴取得", icon: "fa-history" },
  { id: 2, name: "Helmブランチ作成", icon: "fa-code-branch" },
  { id: 3, name: "Helm MR作成", icon: "fa-code-merge" },
  { id: 4, name: "ArgoCD Sync", icon: "fa-sync" },
] as const;

export interface RollbackState {
  service: string;
  targetTag: string;
  currentTag: string;
  status: "running" | "success" | "failed" | "canceled";
  currentStep: number;
  startedAt: Date;
  logs: string;
  error?: string;
  mrUrl?: string;
}

export interface VersionHistoryEntry {
  tag: string;
  commitMessage: string;
  date: string;
  sha: string;
}
