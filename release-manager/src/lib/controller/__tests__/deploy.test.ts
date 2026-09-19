import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DeployController } from "../deploy";
import type { GitLabAPI } from "../../api/gitlab";

// GitLabAPI のモックを作成
const createMockAPI = (): GitLabAPI => {
  return {
    createMergeRequest: vi.fn(),
    approveMergeRequest: vi.fn(),
    mergeMergeRequest: vi.fn(),
    getMergeRequest: vi.fn(),
    getMergeRequests: vi.fn(),
    createTag: vi.fn(),
    triggerPipeline: vi.fn(),
    getPipelineStatus: vi.fn(),
    getPipelines: vi.fn(),
    createBranch: vi.fn(),
    getFile: vi.fn(),
    updateFile: vi.fn(),
    request: vi.fn(),
  } as any;
};

describe("DeployController", () => {
  let controller: DeployController;
  let mockAPI: GitLabAPI;

  beforeEach(() => {
    mockAPI = createMockAPI();
    controller = new DeployController(mockAPI);

    // サービス設定をモック
    (controller as any).serviceConfig = {
      services: {
        "test-service": {
          app_repo: "application/test-service",
          values_file: "test-service.yaml",
          argocd_app: "test-argocd-app",
          namespace: "test",
          tag_prefix: "v",
        },
      },
      environments: {
        tes: {
          gitlab: {
            base_url: "https://gitlab.example.com",
            project_group: "your-org",
          },
        },
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("loadServiceConfig", () => {
    it("サービス設定を読み込む", async () => {
      const mockConfig = {
        services: { web: {} },
        environments: { tes: {} },
      };

      vi.spyOn(mockAPI, "getFile").mockResolvedValue(
        "services:\n  web:\n    app_repo: app\nenvironments:\n  tes:\n    gitlab:\n      base_url: https://example.com\n      project_group: your-org",
      );

      const config = await controller.loadServiceConfig();
      expect(config.services).toBeDefined();
    });
  });

  describe("createTagViaMergeRequest", () => {
    it.skip("MR経由のデプロイフローを正常実行", async () => {
      // ポーリングロジックが複雑なため、統合テストでカバー
      const mockMR = {
        id: 1,
        iid: 100,
        web_url: "https://gitlab.example.com/mr/100",
        state: "merged",
        merge_status: "can_be_merged",
      };

      const mockHelmMR = {
        ...mockMR,
        iid: 101,
      };

      // Step 1: App MR作成
      vi.spyOn(mockAPI, "createMergeRequest")
        .mockResolvedValueOnce(mockMR as any)
        .mockResolvedValueOnce(mockHelmMR as any);

      // Step 2: App MR承認・マージ
      vi.spyOn(mockAPI, "approveMergeRequest").mockResolvedValue({});
      vi.spyOn(mockAPI, "mergeMergeRequest").mockResolvedValue(mockMR as any);

      // MRポーリング: 最初は opened、次に merged状態を返す
      vi.spyOn(mockAPI, "getMergeRequest")
        .mockResolvedValueOnce({
          ...mockMR,
          state: "opened",
          merge_status: "can_be_merged",
        } as any)
        .mockResolvedValue({
          ...mockMR,
          state: "merged",
          merge_status: "can_be_merged",
        } as any);

      // Step 3: タグ作成
      vi.spyOn(mockAPI, "createTag").mockResolvedValue({
        name: "v1.0.0",
      } as any);

      // Step 5: Helm ブランチ作成
      vi.spyOn(mockAPI, "createBranch").mockResolvedValue({} as any);

      // Step 5: Helm values更新
      vi.spyOn(mockAPI, "getFile").mockResolvedValue("image:\n  tag: v0.0.1");
      vi.spyOn(mockAPI, "updateFile").mockResolvedValue({});

      await (controller as any).createTagViaMergeRequest(
        "test-service",
        (controller as any).serviceConfig.services["test-service"],
        "v1.0.0",
      );

      // Step 1: App MR作成が呼ばれたことを確認
      expect(mockAPI.createMergeRequest).toHaveBeenCalledWith(
        "your-org/your-app/test-service",
        "main",
        "release",
        expect.stringContaining("Release v1.0.0"),
        expect.any(String),
      );

      // Step 2: App MR承認が呼ばれたことを確認
      expect(mockAPI.approveMergeRequest).toHaveBeenCalledWith(
        "your-org/your-app/test-service",
        100,
      );

      // Step 3: タグ作成が呼ばれたことを確認
      expect(mockAPI.createTag).toHaveBeenCalledWith(
        "your-org/your-app/test-service",
        "v1.0.0",
        "release",
        expect.any(String),
      );
    });
  });

  describe("releaseブランチパイプライン待機", () => {
    it("waitForPipelineがstepIdパラメータを受け取ることを確認", async () => {
      vi.useFakeTimers();

      const mockPipeline = {
        id: 100,
        status: "success",
      };

      vi.spyOn(mockAPI, "getPipelineStatus").mockResolvedValue(
        mockPipeline as any,
      );

      // waitForPipelineを非同期で呼び出し
      const promise = (controller as any).waitForPipeline(
        "test-service",
        "test-project",
        100,
        3,
      );

      // タイマーを進める
      await vi.runAllTimersAsync();
      await promise;

      expect(mockAPI.getPipelineStatus).toHaveBeenCalledWith(
        "test-project",
        100,
      );
    });

    it("waitForPipelineがパイプライン成功時に正常終了", async () => {
      vi.useFakeTimers();

      const mockPipeline = {
        id: 100,
        status: "success",
      };

      vi.spyOn(mockAPI, "getPipelineStatus").mockResolvedValue(
        mockPipeline as any,
      );

      const promise = (controller as any).waitForPipeline(
        "test-service",
        "test-project",
        100,
        4,
      );

      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBeUndefined();
    });

    it("waitForPipelineがパイプライン失敗時にエラーをスロー", async () => {
      vi.useFakeTimers();

      const mockPipeline = {
        id: 100,
        status: "failed",
      };

      vi.spyOn(mockAPI, "getPipelineStatus").mockResolvedValue(
        mockPipeline as any,
      );

      const promise = (controller as any).waitForPipeline(
        "test-service",
        "test-project",
        100,
        4,
      );

      // expectをpromiseと同時に実行
      const expectPromise =
        expect(promise).rejects.toThrow("パイプライン失敗: failed");

      await vi.runAllTimersAsync();
      await expectPromise;
    });

    it("waitForPipelineがステータス遷移を経て成功", async () => {
      vi.useFakeTimers();

      vi.spyOn(mockAPI, "getPipelineStatus")
        .mockResolvedValueOnce({ id: 100, status: "pending" } as any)
        .mockResolvedValueOnce({ id: 100, status: "running" } as any)
        .mockResolvedValueOnce({ id: 100, status: "success" } as any);

      const promise = (controller as any).waitForPipeline(
        "test-service",
        "test-project",
        100,
        3,
      );

      await vi.runAllTimersAsync();
      await promise;

      expect(mockAPI.getPipelineStatus).toHaveBeenCalledTimes(3);
    });

    it("waitForPipelineがタイムアウト時にエラーをスロー", async () => {
      vi.useFakeTimers();

      // 常にrunning状態を返す
      vi.spyOn(mockAPI, "getPipelineStatus").mockResolvedValue({
        id: 100,
        status: "running",
      } as any);

      const promise = (controller as any).waitForPipeline(
        "test-service",
        "test-project",
        100,
        3,
      );

      const expectPromise =
        expect(promise).rejects.toThrow("パイプラインタイムアウト（30分）");

      await vi.runAllTimersAsync();
      await expectPromise;
    });

    it("waitForPipelineがキャンセル時にエラーをスロー", async () => {
      vi.useFakeTimers();

      vi.spyOn(mockAPI, "getPipelineStatus").mockResolvedValue({
        id: 100,
        status: "canceled",
      } as any);

      const promise = (controller as any).waitForPipeline(
        "test-service",
        "test-project",
        100,
        3,
      );

      const expectPromise =
        expect(promise).rejects.toThrow("パイプライン失敗: canceled");

      await vi.runAllTimersAsync();
      await expectPromise;
    });
  });

  describe("updateHelmValues", () => {
    it("Helm values.yamlのimage.tagを更新", async () => {
      const originalContent = `
image:
  repository: example.com/app
  tag: v0.0.1
  pullPolicy: IfNotPresent
`;

      vi.spyOn(mockAPI, "getFile").mockResolvedValue(originalContent);
      vi.spyOn(mockAPI, "updateFile").mockResolvedValue({});

      await (controller as any).updateHelmValues(
        "infrastructure-project",
        "environments/tes/values/test.yaml",
        "deploy-branch",
        "v1.2.3",
        "test-service",
      );

      expect(mockAPI.updateFile).toHaveBeenCalledWith(
        "infrastructure-project",
        "environments/tes/values/test.yaml",
        "deploy-branch",
        expect.stringContaining("prd-v1.2.3"),
        expect.any(String),
      );
    });
  });

  describe("cancelDeployment", () => {
    it("デプロイをキャンセル", () => {
      const deployment = {
        service: "test-service",
        version: "v1.0.0",
        status: "running" as const,
        currentStep: 3,
        startedAt: new Date(),
        logs: "",
      };

      (controller as any).deployments.set("test-service", deployment);

      controller.cancelDeployment("test-service");

      const updatedDeployment = (controller as any).deployments.get(
        "test-service",
      );
      expect(updatedDeployment.status).toBe("canceled");
    });
  });

  describe("isPipelineMode", () => {
    it("パイプラインモードの判定", () => {
      expect(controller.isPipelineMode()).toBe(false);
    });
  });

  describe("recoverFromInfra", () => {
    it.skip("Step 5（Helm MR作成）からリカバリーを開始", async () => {
      // ポーリングロジックが複雑なため、統合テストでカバー
    });
  });

  describe("waitForMrMerge", () => {
    it("MRがマージされるまでポーリングする", async () => {
      const projectId = "test-project";
      const mrIid = 123;

      // 1回目: opened, 2回目: merged
      vi.spyOn(mockAPI, "getMergeRequest")
        .mockResolvedValueOnce({
          id: 1,
          iid: mrIid,
          state: "opened",
          title: "Test MR",
          description: "",
          source_branch: "feature",
          target_branch: "main",
          web_url: "https://example.com/mr/123",
          created_at: "2024-01-01",
          updated_at: "2024-01-01",
        } as any)
        .mockResolvedValueOnce({
          id: 1,
          iid: mrIid,
          state: "merged",
          title: "Test MR",
          description: "",
          source_branch: "feature",
          target_branch: "main",
          web_url: "https://example.com/mr/123",
          created_at: "2024-01-01",
          updated_at: "2024-01-01",
        } as any);

      const result = await (controller as any).waitForMrMerge(
        "test-service",
        projectId,
        mrIid,
        {
          maxWait: 5000,
          pollInterval: 100,
          successMessage: "テストマージ完了",
        },
      );

      expect(result).toEqual({
        success: true,
        elapsedSeconds: expect.any(Number),
      });
      expect(mockAPI.getMergeRequest).toHaveBeenCalledTimes(2);
    });

    it("MRがクローズされたらエラーを投げる", async () => {
      const projectId = "test-project";
      const mrIid = 123;

      vi.spyOn(mockAPI, "getMergeRequest").mockResolvedValue({
        id: 1,
        iid: mrIid,
        state: "closed",
        title: "Test MR",
        description: "",
        source_branch: "feature",
        target_branch: "main",
        web_url: "https://example.com/mr/123",
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
      } as any);

      await expect(
        (controller as any).waitForMrMerge("test-service", projectId, mrIid, {
          maxWait: 5000,
          pollInterval: 100,
          successMessage: "テスト",
        }),
      ).rejects.toThrow("MRがクローズされました");
    });

    it("タイムアウトしたらエラーを投げる", async () => {
      const projectId = "test-project";
      const mrIid = 123;

      vi.spyOn(mockAPI, "getMergeRequest").mockResolvedValue({
        id: 1,
        iid: mrIid,
        state: "opened",
        title: "Test MR",
        description: "",
        source_branch: "feature",
        target_branch: "main",
        web_url: "https://example.com/mr/123",
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
      } as any);

      await expect(
        (controller as any).waitForMrMerge("test-service", projectId, mrIid, {
          maxWait: 200,
          pollInterval: 100,
          successMessage: "テスト",
        }),
      ).rejects.toThrow("タイムアウト");
    });
  });

  describe("deployMultiple", () => {
    it("複数サービスを並列デプロイ", async () => {
      vi.spyOn(controller, "deploy").mockResolvedValue();

      const services = ["service1", "service2"];
      const tagName = "v1.0.0";

      await controller.deployMultiple(services, tagName);

      expect(controller.deploy).toHaveBeenCalledTimes(2);
      expect(controller.deploy).toHaveBeenCalledWith("service1", "v1.0.0");
      expect(controller.deploy).toHaveBeenCalledWith("service2", "v1.0.0");
    });
  });

  describe("コールバック処理", () => {
    it("onLogUpdate が呼ばれる", () => {
      const onLogUpdate = vi.fn();
      controller.onLogUpdate = onLogUpdate;

      (controller as any).log("test-service", "Test log message");

      expect(onLogUpdate).toHaveBeenCalledWith(
        "test-service",
        "Test log message",
      );
    });

    it("onStepUpdate が呼ばれる", () => {
      const onStepUpdate = vi.fn();
      controller.onStepUpdate = onStepUpdate;

      const deployment = {
        service: "test-service",
        version: "v1.0.0",
        status: "running" as const,
        currentStep: 1,
        startedAt: new Date(),
        logs: "",
      };
      (controller as any).deployments.set("test-service", deployment);

      (controller as any).updateStep("test-service", 2, "running");

      expect(onStepUpdate).toHaveBeenCalledWith(
        "test-service",
        2,
        "running",
        {},
      );
      expect(deployment.currentStep).toBe(2);
    });
  });
});
