/**
 * PRD MR作成 状態管理
 */

import type { PromotionState } from "../promote-config";
import type { StepUpdateData } from "./deploy-pipeline";

export class PromoteStateManager {
  constructor(
    public promotions: Map<string, PromotionState>,
    public onStepUpdate?: (
      service: string,
      stepId: number,
      status: "pending" | "running" | "success" | "failed",
      data?: any,
    ) => void,
    public onLogUpdate?: (service: string, log: string) => void,
  ) {}

  updateStep(
    service: string,
    stepId: number,
    status: "pending" | "running" | "success" | "failed",
    data: StepUpdateData = {},
  ): void {
    const promotion = this.promotions.get(service);
    if (promotion) {
      promotion.currentStep = stepId;
    }
    this.onStepUpdate?.(service, stepId, status, data);
  }

  log(service: string, message: string): void {
    const promotion = this.promotions.get(service);
    if (promotion) {
      promotion.logs += message + "\n";
    }
    this.onLogUpdate?.(service, message);
  }
}
