/**
 * デプロイ状態管理
 * 状態更新とログ管理を担当
 */

import type { StepUpdateData } from "./deploy-pipeline";

export interface DeploymentState {
  service: string;
  version: string;
  status: "running" | "success" | "failed" | "canceled";
  currentStep: number;
  startedAt: Date;
  logs: string;
  error?: string;
  pipelineUrl?: string;
}

export class DeployStateManager {
  constructor(
    public deployments: Map<string, DeploymentState>,
    public onStepUpdate?: (
      service: string,
      stepId: number,
      status: "pending" | "running" | "success" | "failed" | "waiting",
      data?: any,
    ) => void,
    public onLogUpdate?: (service: string, log: string) => void,
    public onPersist?: (service: string, deployment: DeploymentState) => void,
  ) {}

  /**
   * ステップ更新
   */
  updateStep(
    service: string,
    stepId: number,
    status: "pending" | "running" | "success" | "failed" | "waiting",
    data: StepUpdateData = {},
  ): void {
    const deployment = this.deployments.get(service);
    if (deployment) {
      deployment.currentStep = stepId;
    }
    this.onStepUpdate?.(service, stepId, status, data);
    // Phase 2: 永続化コールバック
    if (deployment) {
      this.onPersist?.(service, deployment);
    }
  }

  /**
   * ログ追加
   */
  log(service: string, message: string): void {
    const deployment = this.deployments.get(service);
    if (deployment) {
      deployment.logs += message + "\n";
    }
    this.onLogUpdate?.(service, message);
  }
}
