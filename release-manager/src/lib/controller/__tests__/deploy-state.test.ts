import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeployStateManager, type DeploymentState } from "../deploy-state";

describe("DeployStateManager", () => {
  let deployments: Map<string, DeploymentState>;
  let onStepUpdate: (
    service: string,
    stepId: number,
    status: "pending" | "running" | "success" | "failed" | "waiting",
    data?: any,
  ) => void;
  let onLogUpdate: (service: string, log: string) => void;
  let manager: DeployStateManager;

  beforeEach(() => {
    deployments = new Map();
    onStepUpdate = vi.fn();
    onLogUpdate = vi.fn();
    manager = new DeployStateManager(deployments, onStepUpdate, onLogUpdate);
  });

  describe("updateStep", () => {
    it("deploymentのcurrentStepを更新し、onStepUpdateを呼ぶ", () => {
      const deployment: DeploymentState = {
        service: "test-service",
        version: "v1.0.0",
        status: "running",
        currentStep: 1,
        startedAt: new Date(),
        logs: "",
      };
      deployments.set("test-service", deployment);

      manager.updateStep("test-service", 2, "running");

      expect(deployment.currentStep).toBe(2);
      expect(onStepUpdate).toHaveBeenCalledWith(
        "test-service",
        2,
        "running",
        {},
      );
    });

    it("dataパラメータを渡してonStepUpdateを呼ぶ", () => {
      const deployment: DeploymentState = {
        service: "test-service",
        version: "v1.0.0",
        status: "running",
        currentStep: 3,
        startedAt: new Date(),
        logs: "",
      };
      deployments.set("test-service", deployment);

      const data = { progress: 50, elapsedSeconds: 120 };
      manager.updateStep("test-service", 4, "running", data);

      expect(deployment.currentStep).toBe(4);
      expect(onStepUpdate).toHaveBeenCalledWith(
        "test-service",
        4,
        "running",
        data,
      );
    });

    it("deploymentが存在しない場合でもonStepUpdateは呼ばれる", () => {
      manager.updateStep("non-existent-service", 1, "pending");

      expect(onStepUpdate).toHaveBeenCalledWith(
        "non-existent-service",
        1,
        "pending",
        {},
      );
    });

    it("onStepUpdateが未定義の場合でもエラーにならない", () => {
      const managerWithoutCallback = new DeployStateManager(deployments);
      const deployment: DeploymentState = {
        service: "test-service",
        version: "v1.0.0",
        status: "running",
        currentStep: 1,
        startedAt: new Date(),
        logs: "",
      };
      deployments.set("test-service", deployment);

      expect(() =>
        managerWithoutCallback.updateStep("test-service", 2, "running"),
      ).not.toThrow();
      expect(deployment.currentStep).toBe(2);
    });
  });

  describe("log", () => {
    it("deploymentのlogsに追記し、onLogUpdateを呼ぶ", () => {
      const deployment: DeploymentState = {
        service: "test-service",
        version: "v1.0.0",
        status: "running",
        currentStep: 1,
        startedAt: new Date(),
        logs: "",
      };
      deployments.set("test-service", deployment);

      manager.log("test-service", "テストログメッセージ");

      expect(deployment.logs).toBe("テストログメッセージ\n");
      expect(onLogUpdate).toHaveBeenCalledWith(
        "test-service",
        "テストログメッセージ",
      );
    });

    it("複数回呼び出すとlogsが累積される", () => {
      const deployment: DeploymentState = {
        service: "test-service",
        version: "v1.0.0",
        status: "running",
        currentStep: 1,
        startedAt: new Date(),
        logs: "",
      };
      deployments.set("test-service", deployment);

      manager.log("test-service", "ログ1");
      manager.log("test-service", "ログ2");
      manager.log("test-service", "ログ3");

      expect(deployment.logs).toBe("ログ1\nログ2\nログ3\n");
      expect(onLogUpdate).toHaveBeenCalledTimes(3);
    });

    it("deploymentが存在しない場合でもonLogUpdateは呼ばれる", () => {
      manager.log("non-existent-service", "テストログ");

      expect(onLogUpdate).toHaveBeenCalledWith(
        "non-existent-service",
        "テストログ",
      );
    });

    it("onLogUpdateが未定義の場合でもエラーにならない", () => {
      const managerWithoutCallback = new DeployStateManager(deployments);
      const deployment: DeploymentState = {
        service: "test-service",
        version: "v1.0.0",
        status: "running",
        currentStep: 1,
        startedAt: new Date(),
        logs: "",
      };
      deployments.set("test-service", deployment);

      expect(() =>
        managerWithoutCallback.log("test-service", "ログ"),
      ).not.toThrow();
      expect(deployment.logs).toBe("ログ\n");
    });
  });

  describe("複合シナリオ", () => {
    it("updateStepとlogを組み合わせて使用", () => {
      const deployment: DeploymentState = {
        service: "test-service",
        version: "v1.0.0",
        status: "running",
        currentStep: 1,
        startedAt: new Date(),
        logs: "",
      };
      deployments.set("test-service", deployment);

      manager.updateStep("test-service", 2, "running");
      manager.log("test-service", "ステップ2開始");
      manager.updateStep("test-service", 2, "success");
      manager.log("test-service", "ステップ2完了");

      expect(deployment.currentStep).toBe(2);
      expect(deployment.logs).toBe("ステップ2開始\nステップ2完了\n");
      expect(onStepUpdate).toHaveBeenCalledTimes(2);
      expect(onLogUpdate).toHaveBeenCalledTimes(2);
    });
  });

  describe("Phase 2: onPersistコールバック", () => {
    it("updateStep時にonPersistコールバックが呼ばれる", () => {
      const onPersist: (service: string, deployment: DeploymentState) => void =
        vi.fn();
      const managerWithPersist = new DeployStateManager(
        deployments,
        onStepUpdate,
        onLogUpdate,
        onPersist,
      );

      const deployment: DeploymentState = {
        service: "test-service",
        version: "v2.0.0",
        status: "running",
        currentStep: 1,
        startedAt: new Date(),
        logs: "",
      };
      deployments.set("test-service", deployment);

      managerWithPersist.updateStep("test-service", 2, "success");

      expect(onPersist).toHaveBeenCalledWith("test-service", deployment);
      expect(onPersist).toHaveBeenCalledTimes(1);
    });

    it("deploymentが存在する場合のみonPersistが呼ばれる", () => {
      const onPersist: (service: string, deployment: DeploymentState) => void =
        vi.fn();
      const managerWithPersist = new DeployStateManager(
        deployments,
        onStepUpdate,
        onLogUpdate,
        onPersist,
      );

      managerWithPersist.updateStep("non-existent-service", 1, "running");

      expect(onPersist).not.toHaveBeenCalled();
    });

    it("onPersistが未定義でもエラーにならない", () => {
      const managerWithoutPersist = new DeployStateManager(
        deployments,
        onStepUpdate,
        onLogUpdate,
      );

      const deployment: DeploymentState = {
        service: "test-service",
        version: "v2.0.0",
        status: "running",
        currentStep: 1,
        startedAt: new Date(),
        logs: "",
      };
      deployments.set("test-service", deployment);

      expect(() =>
        managerWithoutPersist.updateStep("test-service", 2, "success"),
      ).not.toThrow();
    });
  });
});
