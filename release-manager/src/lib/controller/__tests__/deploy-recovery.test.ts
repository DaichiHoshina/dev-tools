import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeployRecovery } from "../deploy-recovery";
import type { ReleaseManagerAPI, ServiceDefinition } from "../../api/gitlab";
import type { DeploymentState, DeployStateManager } from "../deploy-state";
import type { DeployPipelineHandler } from "../deploy-pipeline";
import type { DeployHelmHandler } from "../deploy-helm";

describe("DeployRecovery - recoverFromStep", () => {
  let recovery: DeployRecovery;
  let mockStateManager: DeployStateManager;

  beforeEach(() => {
    const mockApi = {} as ReleaseManagerAPI;
    const mockDeployments = new Map<string, DeploymentState>();
    mockStateManager = {
      log: vi.fn(),
      updateStep: vi.fn(),
    } as unknown as DeployStateManager;
    const mockPipelineHandler = {} as DeployPipelineHandler;
    const mockHelmHandler = {} as DeployHelmHandler;

    recovery = new DeployRecovery(
      mockApi,
      mockDeployments,
      mockStateManager,
      mockPipelineHandler,
      mockHelmHandler,
    );

    vi.spyOn(recovery, "recoverFromStep").mockResolvedValue(undefined);
  });

  it("recoverFromStepが正しい引数で呼ばれる", async () => {
    const svcConfig: ServiceDefinition = {
      app_repo: "test-repo",
      values_file: "test.yaml",
      argocd_app: "test-app",
      namespace: "test-ns",
      tag_prefix: "v",
    };

    await recovery.recoverFromStep("test-service", svcConfig, "v1.0.0", 3);

    expect(recovery.recoverFromStep).toHaveBeenCalledWith(
      "test-service",
      svcConfig,
      "v1.0.0",
      3,
    );
  });
});
