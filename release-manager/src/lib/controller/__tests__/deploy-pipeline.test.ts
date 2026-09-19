import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DeployPipelineHandler } from "../deploy-pipeline";

// モックAPI作成
const createMockAPI = () => ({
  getPipelineStatus: vi.fn(),
  getPipelines: vi.fn(),
});

// モックStateManager作成
const createMockStateManager = () => ({
  deployments: new Map(),
  updateStep: vi.fn(),
  log: vi.fn(),
  onStepUpdate: vi.fn(),
  onLogUpdate: vi.fn(),
});

describe("DeployPipelineHandler", () => {
  let handler: DeployPipelineHandler;
  let mockAPI: ReturnType<typeof createMockAPI>;
  let mockStateManager: ReturnType<typeof createMockStateManager>;

  beforeEach(() => {
    mockAPI = createMockAPI();
    mockStateManager = createMockStateManager();
    handler = new DeployPipelineHandler(
      mockAPI as any,
      mockStateManager as any,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("waitForPipeline", () => {
    const service = "test-service";
    const projectId = "test-project";
    const pipelineId = 100;
    const stepId = 4;

    it("パイプラインが即座にsuccess状態の場合は正常終了", async () => {
      vi.useFakeTimers();

      mockAPI.getPipelineStatus.mockResolvedValue({
        id: pipelineId,
        status: "success",
      });

      const promise = handler.waitForPipeline(
        service,
        projectId,
        pipelineId,
        stepId,
      );

      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBeUndefined();

      expect(mockStateManager.log).toHaveBeenCalledWith(
        service,
        "[SUCCESS] パイプライン完了",
      );
    });

    it("パイプラインがpending→running→successと遷移して完了", async () => {
      vi.useFakeTimers();

      mockAPI.getPipelineStatus
        .mockResolvedValueOnce({ id: pipelineId, status: "pending" })
        .mockResolvedValueOnce({ id: pipelineId, status: "running" })
        .mockResolvedValueOnce({ id: pipelineId, status: "success" });

      const promise = handler.waitForPipeline(
        service,
        projectId,
        pipelineId,
        stepId,
      );

      await vi.runAllTimersAsync();
      await promise;

      expect(mockAPI.getPipelineStatus).toHaveBeenCalledTimes(3);
      expect(mockStateManager.log).toHaveBeenCalledWith(
        service,
        "[SUCCESS] パイプライン完了",
      );
    });

    it("パイプラインがfailed状態の場合はエラーをスロー", async () => {
      vi.useFakeTimers();

      mockAPI.getPipelineStatus.mockResolvedValue({
        id: pipelineId,
        status: "failed",
      });

      const promise = handler.waitForPipeline(
        service,
        projectId,
        pipelineId,
        stepId,
      );

      const expectPromise =
        expect(promise).rejects.toThrow("パイプライン失敗: failed");

      await vi.runAllTimersAsync();
      await expectPromise;
    });

    it("パイプラインがcanceled状態の場合はエラーをスロー", async () => {
      vi.useFakeTimers();

      mockAPI.getPipelineStatus.mockResolvedValue({
        id: pipelineId,
        status: "canceled",
      });

      const promise = handler.waitForPipeline(
        service,
        projectId,
        pipelineId,
        stepId,
      );

      const expectPromise =
        expect(promise).rejects.toThrow("パイプライン失敗: canceled");

      await vi.runAllTimersAsync();
      await expectPromise;
    });

    it("タイムアウト時にエラーをスロー", async () => {
      vi.useFakeTimers();

      // 常にrunning状態を返す
      mockAPI.getPipelineStatus.mockResolvedValue({
        id: pipelineId,
        status: "running",
      });

      const promise = handler.waitForPipeline(
        service,
        projectId,
        pipelineId,
        stepId,
      );

      const expectPromise =
        expect(promise).rejects.toThrow("パイプラインタイムアウト（30分）");

      await vi.runAllTimersAsync();
      await expectPromise;
    });

    it("ポーリング中にupdateStepとlogが呼ばれる", async () => {
      vi.useFakeTimers();

      mockAPI.getPipelineStatus
        .mockResolvedValueOnce({ id: pipelineId, status: "running" })
        .mockResolvedValueOnce({ id: pipelineId, status: "success" });

      const promise = handler.waitForPipeline(
        service,
        projectId,
        pipelineId,
        stepId,
      );

      await vi.runAllTimersAsync();
      await promise;

      // ログが出力されることを確認
      expect(mockStateManager.log).toHaveBeenCalledWith(
        service,
        expect.stringContaining("[INFO] パイプライン状態: running"),
      );
      expect(mockStateManager.log).toHaveBeenCalledWith(
        service,
        expect.stringContaining("[INFO] パイプライン状態: success"),
      );

      // updateStepが呼ばれることを確認
      expect(mockStateManager.updateStep).toHaveBeenCalledWith(
        service,
        stepId,
        "running",
        expect.objectContaining({
          progress: expect.any(Number),
          elapsedSeconds: expect.any(Number),
        }),
      );
    });

    it("デフォルトのstepId=4で動作", async () => {
      vi.useFakeTimers();

      mockAPI.getPipelineStatus.mockResolvedValue({
        id: pipelineId,
        status: "success",
      });

      // stepIdを省略
      const promise = handler.waitForPipeline(service, projectId, pipelineId);

      await vi.runAllTimersAsync();
      await promise;

      // stepId=4でupdateStepが呼ばれることを確認
      expect(mockStateManager.updateStep).toHaveBeenCalledWith(
        service,
        4,
        "running",
        expect.any(Object),
      );
    });

    it("カスタムstepIdで動作", async () => {
      vi.useFakeTimers();

      mockAPI.getPipelineStatus.mockResolvedValue({
        id: pipelineId,
        status: "success",
      });

      const customStepId = 7;
      const promise = handler.waitForPipeline(
        service,
        projectId,
        pipelineId,
        customStepId,
      );

      await vi.runAllTimersAsync();
      await promise;

      expect(mockStateManager.updateStep).toHaveBeenCalledWith(
        service,
        customStepId,
        "running",
        expect.any(Object),
      );
    });

    it("パイプライン状態がログに記録される", async () => {
      vi.useFakeTimers();

      mockAPI.getPipelineStatus
        .mockResolvedValueOnce({ id: pipelineId, status: "running" })
        .mockResolvedValueOnce({ id: pipelineId, status: "success" });

      const promise = handler.waitForPipeline(
        service,
        projectId,
        pipelineId,
        stepId,
      );

      await vi.runAllTimersAsync();
      await promise;

      expect(mockStateManager.log).toHaveBeenCalledWith(
        service,
        expect.stringContaining("パイプライン状態: running"),
      );
    });

    it("進捗率が計算されてupdateStepに渡される", async () => {
      vi.useFakeTimers();

      mockAPI.getPipelineStatus
        .mockResolvedValueOnce({ id: pipelineId, status: "running" })
        .mockResolvedValueOnce({ id: pipelineId, status: "success" });

      const promise = handler.waitForPipeline(
        service,
        projectId,
        pipelineId,
        stepId,
      );

      await vi.runAllTimersAsync();
      await promise;

      // updateStepの呼び出しで progress が 0-95 の範囲内であることを確認
      const calls = mockStateManager.updateStep.mock.calls;
      for (const call of calls) {
        const data = call[3];
        expect(data.progress).toBeGreaterThanOrEqual(0);
        expect(data.progress).toBeLessThanOrEqual(95);
      }
    });

    it("getPipelineStatusのAPIエラーを伝播", async () => {
      vi.useFakeTimers();

      const error = new Error("API エラー");
      mockAPI.getPipelineStatus.mockRejectedValue(error);

      const promise = handler.waitForPipeline(
        service,
        projectId,
        pipelineId,
        stepId,
      );

      const expectPromise = expect(promise).rejects.toThrow("API エラー");

      await vi.runAllTimersAsync();
      await expectPromise;
    });
  });

  describe("waitForTagPipeline", () => {
    const service = "test-service";
    const projectPath = "test-project";
    const tagName = "v1.0.0";
    const stepId = 4;

    it("パイプラインが初回で検出され、既にsuccess状態の場合", async () => {
      vi.useFakeTimers();

      mockAPI.getPipelines.mockResolvedValue([
        {
          id: 200,
          status: "success",
          web_url: "https://example.com/pipeline/200",
        },
      ]);

      const promise = handler.waitForTagPipeline(
        service,
        projectPath,
        tagName,
        stepId,
      );

      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual({
        pipelineId: 200,
        webUrl: "https://example.com/pipeline/200",
      });
      expect(mockStateManager.log).toHaveBeenCalledWith(
        service,
        expect.stringContaining("[INFO] パイプラインは既に成功しています"),
      );
    });

    it("パイプラインが初回で検出され、完了待機後に成功", async () => {
      vi.useFakeTimers();

      mockAPI.getPipelines.mockResolvedValue([
        {
          id: 201,
          status: "running",
          web_url: "https://example.com/pipeline/201",
        },
      ]);
      mockAPI.getPipelineStatus
        .mockResolvedValueOnce({ id: 201, status: "running" })
        .mockResolvedValueOnce({ id: 201, status: "success" });

      const promise = handler.waitForTagPipeline(
        service,
        projectPath,
        tagName,
        stepId,
      );

      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual({
        pipelineId: 201,
        webUrl: "https://example.com/pipeline/201",
      });
      expect(mockStateManager.log).toHaveBeenCalledWith(
        service,
        expect.stringContaining("[SUCCESS] パイプライン検出"),
      );
      expect(mockStateManager.log).toHaveBeenCalledWith(
        service,
        "[SUCCESS] パイプライン完了",
      );
    });

    it("パイプラインが数回リトライ後に検出される", async () => {
      vi.useFakeTimers();

      mockAPI.getPipelines
        .mockResolvedValueOnce([]) // 1回目: 未検出
        .mockResolvedValueOnce([]) // 2回目: 未検出
        .mockResolvedValueOnce([
          // 3回目: 検出
          {
            id: 202,
            status: "success",
            web_url: "https://example.com/pipeline/202",
          },
        ]);

      const promise = handler.waitForTagPipeline(
        service,
        projectPath,
        tagName,
        stepId,
      );

      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual({
        pipelineId: 202,
        webUrl: "https://example.com/pipeline/202",
      });
      expect(mockAPI.getPipelines).toHaveBeenCalledTimes(3);
      expect(mockStateManager.log).toHaveBeenCalledWith(
        service,
        expect.stringContaining("[INFO] パイプライン未検出、リトライ中"),
      );
    });

    it("パイプライン検出タイムアウトでエラー", async () => {
      vi.useFakeTimers();

      // 常に空配列を返す
      mockAPI.getPipelines.mockResolvedValue([]);

      const promise = handler.waitForTagPipeline(
        service,
        projectPath,
        tagName,
        stepId,
      );

      const expectPromise =
        expect(promise).rejects.toThrow("パイプライン検出タイムアウト");

      await vi.runAllTimersAsync();
      await expectPromise;
    });

    it("検出されたパイプラインがfailed状態の場合はエラー", async () => {
      vi.useFakeTimers();

      mockAPI.getPipelines.mockResolvedValue([
        {
          id: 203,
          status: "failed",
          web_url: "https://example.com/pipeline/203",
        },
      ]);

      const promise = handler.waitForTagPipeline(
        service,
        projectPath,
        tagName,
        stepId,
      );

      const expectPromise =
        expect(promise).rejects.toThrow("タグパイプライン失敗: failed");

      await vi.runAllTimersAsync();
      await expectPromise;
    });

    it("検出されたパイプラインがcanceled状態の場合はエラー", async () => {
      vi.useFakeTimers();

      mockAPI.getPipelines.mockResolvedValue([
        {
          id: 204,
          status: "canceled",
          web_url: "https://example.com/pipeline/204",
        },
      ]);

      const promise = handler.waitForTagPipeline(
        service,
        projectPath,
        tagName,
        stepId,
      );

      const expectPromise = expect(promise).rejects.toThrow(
        "タグパイプライン失敗: canceled",
      );

      await vi.runAllTimersAsync();
      await expectPromise;
    });

    it("getPipelinesにref=tagNameが渡される", async () => {
      vi.useFakeTimers();

      mockAPI.getPipelines.mockResolvedValue([
        {
          id: 205,
          status: "success",
          web_url: "https://example.com/pipeline/205",
        },
      ]);

      const promise = handler.waitForTagPipeline(
        service,
        projectPath,
        tagName,
        stepId,
      );

      await vi.runAllTimersAsync();
      await promise;

      expect(mockAPI.getPipelines).toHaveBeenCalledWith(projectPath, {
        ref: tagName,
        per_page: "1",
        order_by: "id",
        sort: "desc",
      });
    });

    it("リトライ中にupdateStepが呼ばれる", async () => {
      vi.useFakeTimers();

      mockAPI.getPipelines.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          id: 206,
          status: "success",
          web_url: "https://example.com/pipeline/206",
        },
      ]);

      const promise = handler.waitForTagPipeline(
        service,
        projectPath,
        tagName,
        stepId,
      );

      await vi.runAllTimersAsync();
      await promise;

      expect(mockStateManager.updateStep).toHaveBeenCalledWith(
        service,
        stepId,
        "running",
        expect.objectContaining({
          progress: expect.any(Number),
          elapsedSeconds: expect.any(Number),
        }),
      );
    });

    it("デフォルトのstepId=4で動作", async () => {
      vi.useFakeTimers();

      mockAPI.getPipelines.mockResolvedValue([
        {
          id: 207,
          status: "success",
          web_url: "https://example.com/pipeline/207",
        },
      ]);

      // stepIdを省略
      const promise = handler.waitForTagPipeline(service, projectPath, tagName);

      await vi.runAllTimersAsync();
      await promise;

      // 戻り値が正常であることを確認（デフォルトstepId=4が使用される）
      expect(mockAPI.getPipelines).toHaveBeenCalled();
    });

    it("getPipelinesのAPIエラーを伝播", async () => {
      vi.useFakeTimers();

      const error = new Error("API エラー");
      mockAPI.getPipelines.mockRejectedValue(error);

      const promise = handler.waitForTagPipeline(
        service,
        projectPath,
        tagName,
        stepId,
      );

      const expectPromise = expect(promise).rejects.toThrow("API エラー");

      await vi.runAllTimersAsync();
      await expectPromise;
    });
  });
});
