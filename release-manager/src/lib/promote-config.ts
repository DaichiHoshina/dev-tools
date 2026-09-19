// PRD MR作成設定

export const PRD_TAG_PREFIX = "prd-";

export interface PromoteStep {
  id: number;
  name: string;
  icon: string;
}

export const PROMOTE_STEPS: readonly PromoteStep[] = [
  { id: 1, name: "TESタグ読み取り", icon: "fa-tag" },
  { id: 2, name: "PRD差分確認", icon: "fa-code-compare" },
  { id: 3, name: "Helmブランチ作成", icon: "fa-code-branch" },
  { id: 4, name: "Helm MR作成", icon: "fa-code-merge" },
] as const;

export interface PromotionState {
  service: string;
  status: "running" | "success" | "failed" | "canceled";
  currentStep: number;
  startedAt: Date;
  logs: string;
  error?: string;
  tesTag?: string;
  prdTag?: string;
  mrUrl?: string;
}
