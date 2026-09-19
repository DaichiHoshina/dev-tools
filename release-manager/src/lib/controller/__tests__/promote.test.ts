import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PromoteController } from "../promote";

// モックAPI作成
const createMockAPI = () => ({
  getFile: vi.fn(),
  updateFile: vi.fn(),
  createBranch: vi.fn(),
  deleteBranch: vi.fn(),
  closeMergeRequest: vi.fn(),
  createMergeRequest: vi.fn(),
  getMergeRequests: vi.fn(),
  getMergeRequest: vi.fn(),
  approveMergeRequest: vi.fn(),
  mergeMergeRequest: vi.fn(),
  getPipelines: vi.fn(),
  getPipelineStatus: vi.fn(),
  getPipelineJobs: vi.fn(),
  hasToken: vi.fn().mockReturnValue(true),
  getServiceConfig: vi.fn(),
});

describe("PromoteController", () => {
  let controller: PromoteController;
  let mockAPI: ReturnType<typeof createMockAPI>;

  beforeEach(() => {
    mockAPI = createMockAPI();
    controller = new PromoteController(mockAPI as any);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("getVersions", () => {
    it("TES/PRDバージョンを正しく取得", async () => {
      const svcConfig = {
        app_repo: "application/frontend/app",
        values_file: "web.yaml",
        argocd_app: "your-app-staging-web",
        namespace: "web",
        tag_prefix: "v",
      };

      mockAPI.getFile
        .mockResolvedValueOnce(
          "image:\n  repository: example.com/web\n  tag: prd-v3.24.0\n",
        )
        .mockResolvedValueOnce(
          "image:\n  repository: example.com/web\n  tag: prd-v3.23.0\n",
        );

      const result = await controller.getVersions("web", svcConfig);

      expect(result.tesTag).toBe("v3.24.0");
      expect(result.prdTag).toBe("v3.23.0");
    });

    it("ファイル取得失敗時はフォールバック値を返す", async () => {
      const svcConfig = {
        app_repo: "application/frontend/app",
        values_file: "web.yaml",
        argocd_app: "your-app-staging-web",
        namespace: "web",
        tag_prefix: "v",
      };

      mockAPI.getFile.mockRejectedValue(new Error("Not found"));

      const result = await controller.getVersions("web", svcConfig);

      expect(result.tesTag).toBe("-");
      expect(result.prdTag).toBe("-");
    });
  });

  describe("promote", () => {
    const setupMockConfig = () => {
      const config = {
        services: {
          web: {
            app_repo: "application/frontend/app",
            values_file: "web.yaml",
            argocd_app: "your-app-staging-web",
            namespace: "web",
            tag_prefix: "v",
          },
        },
        environments: {},
      };
      return config;
    };

    it("TESとPRDが同一バージョンの場合はエラー", async () => {
      const config = setupMockConfig();

      vi.spyOn(controller, "loadServiceConfig").mockResolvedValue(config);

      // Step 1: TES tag取得
      mockAPI.getFile
        .mockResolvedValueOnce("image:\n  tag: prd-v3.24.0\n")
        // Step 2: PRD tag取得
        .mockResolvedValueOnce("image:\n  tag: prd-v3.24.0\n");

      const onError = vi.fn();
      controller.onPromotionComplete = onError;

      await expect(controller.promote("web")).rejects.toThrow("MR作成不要");

      expect(onError).toHaveBeenCalledWith("web", "failed");
    });

    it("正常系: 全4ステップが完了（MR作成まで）", async () => {
      const config = setupMockConfig();
      vi.spyOn(controller, "loadServiceConfig").mockResolvedValue(config);

      // Step 1: TES tag
      mockAPI.getFile
        .mockResolvedValueOnce("image:\n  tag: prd-v3.24.0\n")
        // Step 2: PRD tag
        .mockResolvedValueOnce("image:\n  tag: prd-v3.23.0\n")
        // Step 3: PRD values読み取り（ブランチ上）
        .mockResolvedValueOnce("image:\n  tag: prd-v3.23.0\n");

      // Step 4: 既存MR検索 - なし
      mockAPI.getMergeRequests.mockResolvedValueOnce([]);

      // Step 3: ブランチ作成
      mockAPI.createBranch.mockResolvedValue({
        name: "promote-prd/web/v3.24.0",
      });

      // Step 3: values更新
      mockAPI.updateFile.mockResolvedValue({});

      // Step 4: MR作成
      mockAPI.createMergeRequest.mockResolvedValue({
        iid: 200,
        web_url: "https://gitlab.example.com/mr/200",
      });

      const onComplete = vi.fn();
      const onMrCreated = vi.fn();
      controller.onPromotionComplete = onComplete;
      controller.onMrCreated = onMrCreated;

      await controller.promote("web");

      expect(onComplete).toHaveBeenCalledWith("web", "success");
      expect(onMrCreated).toHaveBeenCalledWith(
        "web",
        "https://gitlab.example.com/mr/200",
      );

      const promotion = controller.promotions.get("web");
      expect(promotion?.status).toBe("success");
      expect(promotion?.tesTag).toBe("v3.24.0");
      expect(promotion?.prdTag).toBe("v3.23.0");
    });

    it("MR作成後は手動マージが必要（approve/mergeは呼ばれない）", async () => {
      const config = setupMockConfig();
      vi.spyOn(controller, "loadServiceConfig").mockResolvedValue(config);

      mockAPI.getFile
        .mockResolvedValueOnce("image:\n  tag: prd-v3.24.0\n")
        .mockResolvedValueOnce("image:\n  tag: prd-v3.23.0\n")
        .mockResolvedValueOnce("image:\n  tag: prd-v3.23.0\n");

      mockAPI.getMergeRequests.mockResolvedValueOnce([]);

      mockAPI.createBranch.mockResolvedValue({});
      mockAPI.updateFile.mockResolvedValue({});
      mockAPI.createMergeRequest.mockResolvedValue({
        iid: 200,
        web_url: "https://gitlab.example.com/mr/200",
      });

      const onComplete = vi.fn();
      controller.onPromotionComplete = onComplete;

      await controller.promote("web");

      expect(onComplete).toHaveBeenCalledWith("web", "success");
      // approve/mergeは呼ばれない
      expect(mockAPI.approveMergeRequest).not.toHaveBeenCalled();
      expect(mockAPI.mergeMergeRequest).not.toHaveBeenCalled();
    });
  });

  describe("syncArgoCD", () => {
    it("ArgoCD Syncを手動実行できる", async () => {
      const mockReleaseManagerApi = (controller as any).releaseManagerApi;
      vi.spyOn(mockReleaseManagerApi, "syncArgoCD").mockResolvedValue({
        id: 999,
        web_url: "https://gitlab.example.com/pipelines/999",
        status: "created",
      });
      vi.spyOn(mockReleaseManagerApi, "getPipelineStatus").mockResolvedValue({
        status: "success",
      });

      await controller.syncArgoCD("web");

      expect(mockReleaseManagerApi.syncArgoCD).toHaveBeenCalledWith(
        "web",
        "prd",
      );
    });

    it("ArgoCD Sync失敗時はエラーをスロー", async () => {
      const mockReleaseManagerApi = (controller as any).releaseManagerApi;
      vi.spyOn(mockReleaseManagerApi, "syncArgoCD").mockRejectedValue(
        new Error("Pipeline trigger failed"),
      );

      await expect(controller.syncArgoCD("web")).rejects.toThrow(
        "Pipeline trigger failed",
      );
    });
  });

  describe("cancelPromotion", () => {
    it("MR作成をキャンセル", () => {
      controller.promotions.set("web", {
        service: "web",
        status: "running",
        currentStep: 2,
        startedAt: new Date(),
        logs: "",
      });

      const onComplete = vi.fn();
      controller.onPromotionComplete = onComplete;

      controller.cancelPromotion("web");

      const promotion = controller.promotions.get("web");
      expect(promotion?.status).toBe("canceled");
      expect(onComplete).toHaveBeenCalledWith("web", "failed");
    });
  });
});
