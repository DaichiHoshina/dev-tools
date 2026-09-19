import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PromoteHelmHandler } from "../promote-helm";

const createMockAPI = () => ({
  getFile: vi.fn(),
  updateFile: vi.fn(),
  createBranch: vi.fn(),
  deleteBranch: vi.fn(),
  createMergeRequest: vi.fn(),
  getMergeRequests: vi.fn(),
  getMergeRequest: vi.fn(),
  closeMergeRequest: vi.fn(),
});

const createMockStateManager = () => ({
  promotions: new Map(),
  updateStep: vi.fn(),
  log: vi.fn(),
});

describe("PromoteHelmHandler", () => {
  let handler: PromoteHelmHandler;
  let mockAPI: ReturnType<typeof createMockAPI>;
  let mockStateManager: ReturnType<typeof createMockStateManager>;
  const svcConfig = {
    app_repo: "application/frontend/app",
    values_file: "web.yaml",
    argocd_app: "your-app-staging-web",
    namespace: "web",
    tag_prefix: "v",
  };

  beforeEach(() => {
    mockAPI = createMockAPI();
    mockStateManager = createMockStateManager();
    handler = new PromoteHelmHandler(mockAPI as any, mockStateManager as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("promoteToHelm", () => {
    it("ブランチ作成・values更新・MR作成の全工程を実行", async () => {
      mockAPI.createBranch.mockResolvedValue({
        name: "promote-prd/web/v3.24.0",
      });
      mockAPI.getFile.mockResolvedValue(
        "image:\n  repository: example.com/web\n  tag: prd-v3.23.0\n",
      );
      mockAPI.updateFile.mockResolvedValue({});
      mockAPI.getMergeRequests.mockResolvedValue([]);
      mockAPI.createMergeRequest.mockResolvedValue({
        iid: 200,
        web_url: "https://gitlab.example.com/mr/200",
      });

      const onMrCreated = vi.fn();
      handler.onMrCreated = onMrCreated;

      await handler.promoteToHelm("web", svcConfig, "v3.24.0", "v3.23.0");

      expect(mockAPI.createBranch).toHaveBeenCalledWith(
        expect.any(String),
        "promote-prd/web/v3.24.0",
        "master",
      );
      expect(mockAPI.updateFile).toHaveBeenCalled();
      expect(mockAPI.createMergeRequest).toHaveBeenCalled();
      expect(onMrCreated).toHaveBeenCalledWith(
        "web",
        "https://gitlab.example.com/mr/200",
      );

      // Step 3 (ブランチ作成) と Step 4 (MR作成) が成功
      expect(mockStateManager.updateStep).toHaveBeenCalledWith(
        "web",
        3,
        "success",
      );
      expect(mockStateManager.updateStep).toHaveBeenCalledWith(
        "web",
        4,
        "success",
      );
    });

    it("ブランチが既存の場合は削除して再作成", async () => {
      mockAPI.createBranch
        .mockRejectedValueOnce(new Error("Branch already exists"))
        .mockResolvedValueOnce({});
      mockAPI.deleteBranch.mockResolvedValue(undefined);
      mockAPI.closeMergeRequest.mockResolvedValue({} as any);
      mockAPI.getFile.mockResolvedValue("image:\n  tag: prd-v3.23.0\n");
      mockAPI.updateFile.mockResolvedValue({});
      // 1回目: ブランチ削除時のMR検索（既存MRなし）、2回目: MR作成時の既存MR検索
      mockAPI.getMergeRequests.mockResolvedValue([]);
      mockAPI.createMergeRequest.mockResolvedValue({
        iid: 200,
        web_url: "https://gitlab.example.com/mr/200",
      });

      await handler.promoteToHelm("web", svcConfig, "v3.24.0", "v3.23.0");

      expect(mockAPI.deleteBranch).toHaveBeenCalled();
      expect(mockAPI.createBranch).toHaveBeenCalledTimes(2);
      expect(mockStateManager.log).toHaveBeenCalledWith(
        "web",
        expect.stringContaining("既存ブランチを削除して再作成"),
      );
      expect(mockAPI.createMergeRequest).toHaveBeenCalled();
    });

    it("ブランチ再作成時に複数のオープンMRを一括クローズ", async () => {
      mockAPI.createBranch
        .mockRejectedValueOnce(new Error("Branch already exists"))
        .mockResolvedValueOnce({});
      // 1回目: ブランチ削除時のMR検索（既存MRあり）、2回目: MR作成時の検索
      mockAPI.getMergeRequests
        .mockResolvedValueOnce([
          { iid: 100, state: "opened", web_url: "https://example.com/100" },
          { iid: 101, state: "opened", web_url: "https://example.com/101" },
        ])
        .mockResolvedValueOnce([]);
      mockAPI.closeMergeRequest.mockResolvedValue({} as any);
      mockAPI.deleteBranch.mockResolvedValue(undefined);
      mockAPI.getFile.mockResolvedValue("image:\n  tag: prd-v3.23.0\n");
      mockAPI.updateFile.mockResolvedValue({});
      mockAPI.createMergeRequest.mockResolvedValue({
        iid: 200,
        web_url: "https://gitlab.example.com/mr/200",
      });

      await handler.promoteToHelm("web", svcConfig, "v3.24.0", "v3.23.0");

      expect(mockAPI.closeMergeRequest).toHaveBeenCalledTimes(2);
    });

    it("ブランチ削除失敗時はエラーをスロー", async () => {
      mockAPI.createBranch.mockRejectedValueOnce(
        new Error("Branch already exists"),
      );
      mockAPI.getMergeRequests.mockResolvedValue([]);
      mockAPI.deleteBranch.mockRejectedValue(new Error("Protected branch"));

      await expect(
        handler.promoteToHelm("web", svcConfig, "v3.24.0", "v3.23.0"),
      ).rejects.toThrow("Protected branch");

      expect(mockStateManager.updateStep).toHaveBeenCalledWith(
        "web",
        3,
        "failed",
      );
    });

    it("既存MRがある場合は新規作成せず再利用", async () => {
      mockAPI.createBranch.mockResolvedValue({});
      mockAPI.getFile.mockResolvedValue("image:\n  tag: prd-v3.23.0\n");
      mockAPI.updateFile.mockResolvedValue({});
      mockAPI.getMergeRequests.mockResolvedValue([
        {
          iid: 150,
          web_url: "https://gitlab.example.com/mr/150",
        },
      ]);

      await handler.promoteToHelm("web", svcConfig, "v3.24.0", "v3.23.0");

      expect(mockAPI.createMergeRequest).not.toHaveBeenCalled();
      expect(mockStateManager.log).toHaveBeenCalledWith(
        "web",
        expect.stringContaining("既存MR使用: !150"),
      );
    });

    it("tag値が既に最新の場合はupdateFileをスキップしない（commitメッセージ変更のため）", async () => {
      mockAPI.createBranch.mockResolvedValue({});
      // 既に最新のタグが設定されている
      mockAPI.getFile.mockResolvedValue("image:\n  tag: prd-v3.24.0\n");
      mockAPI.updateFile.mockResolvedValue({});
      mockAPI.getMergeRequests.mockResolvedValue([]);
      mockAPI.createMergeRequest.mockResolvedValue({
        iid: 200,
        web_url: "https://gitlab.example.com/mr/200",
      });

      await handler.promoteToHelm("web", svcConfig, "v3.24.0", "v3.23.0");

      // tag値が同じでもMR作成は実行される
      expect(mockStateManager.log).toHaveBeenCalledWith(
        "web",
        expect.stringContaining("tag値が既に最新"),
      );
    });

    it("MR作成後は手動マージメッセージが出力される", async () => {
      mockAPI.createBranch.mockResolvedValue({});
      mockAPI.getFile.mockResolvedValue("image:\n  tag: prd-v3.23.0\n");
      mockAPI.updateFile.mockResolvedValue({});
      mockAPI.getMergeRequests.mockResolvedValue([]);
      mockAPI.createMergeRequest.mockResolvedValue({
        iid: 200,
        web_url: "https://gitlab.example.com/mr/200",
      });

      await handler.promoteToHelm("web", svcConfig, "v3.24.0", "v3.23.0");

      expect(mockStateManager.log).toHaveBeenCalledWith(
        "web",
        expect.stringContaining("手動マージが必要です"),
      );
    });
  });
});
