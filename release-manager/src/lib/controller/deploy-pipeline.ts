/**
 * パイプライン処理ハンドラー
 */

import { ReleaseManagerAPI } from "../api/gitlab";
import { CONFIG } from "../config";
import { retryWithBackoff } from "../utils/retry";

export interface StepUpdateData {
  progress?: number;
  elapsedSeconds?: number;
  completedJobs?: number;
  totalJobs?: number;
  runningJobName?: string;
}

export interface PipelineStateManager {
  updateStep(
    service: string,
    stepId: number,
    status: "pending" | "running" | "success" | "failed" | "waiting",
    data?: StepUpdateData,
  ): void;
  log(service: string, message: string): void;
}

export class DeployPipelineHandler {
  constructor(
    public api: ReleaseManagerAPI,
    public stateManager: PipelineStateManager,
  ) {}

  /**
   * パイプライン完了待ち
   * @param maxWaitOverride タイムアウト上書き（CIパイプライン監視時は90分など）
   */
  async waitForPipeline(
    service: string,
    projectId: string,
    pipelineId: number,
    stepId: number = 4,
    maxWaitOverride?: number,
  ): Promise<void> {
    const maxWait =
      maxWaitOverride ?? CONFIG.UI.PIPELINE_MAX_WAIT ?? 30 * 60 * 1000;
    const interval = CONFIG.UI.PIPELINE_POLL_INTERVAL ?? 10 * 1000;
    const startTime = Date.now();
    const completedStatuses = new Set([
      "success",
      "failed",
      "canceled",
      "skipped",
    ]);

    while (Date.now() - startTime < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, interval));

      const [pipeline, jobs] = await Promise.all([
        retryWithBackoff(
          () => this.api.getPipelineStatus(projectId, pipelineId),
          {
            onRetry: (err, attempt) =>
              this.stateManager.log(
                service,
                `[WARNING] API一時エラー (リトライ ${attempt}/3): ${err.message}`,
              ),
          },
        ),
        retryWithBackoff(
          () => this.api.getPipelineJobs(projectId, pipelineId),
          {
            onRetry: (err, attempt) =>
              this.stateManager.log(
                service,
                `[WARNING] ジョブ一覧取得エラー (リトライ ${attempt}/3): ${err.message}`,
              ),
          },
        ).catch(() => []),
      ]);
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);

      // ジョブベースの進捗計算
      const totalJobs = jobs.length;
      const completedJobs = jobs.filter((j) =>
        completedStatuses.has(j.status),
      ).length;
      const runningJob = jobs.find((j) => j.status === "running");

      const progress =
        totalJobs > 0
          ? Math.min(95, Math.floor((completedJobs / totalJobs) * 100))
          : Math.min(
              95,
              Math.floor(((Date.now() - startTime) / maxWait) * 100),
            );

      this.stateManager.log(
        service,
        `[INFO] パイプライン状態: ${pipeline.status}${totalJobs > 0 ? ` (${completedJobs}/${totalJobs}ジョブ完了)` : ""}`,
      );

      this.stateManager.updateStep(service, stepId, "running", {
        progress,
        elapsedSeconds,
        completedJobs,
        totalJobs,
        runningJobName: runningJob?.name,
      });

      if (pipeline.status === "success") {
        this.stateManager.log(service, `[SUCCESS] パイプライン完了`);
        return;
      }

      if (pipeline.status === "failed" || pipeline.status === "canceled") {
        throw new Error(`パイプライン失敗: ${pipeline.status}`);
      }
    }

    throw new Error("パイプラインタイムアウト（30分）");
  }

  /**
   * タグのCI/CDパイプラインを検出し、完了まで待機する。
   * タグ作成直後はGitLabがパイプラインを生成するまでラグがあるため、
   * ポーリングでパイプラインの出現を待ってから完了待機に移行する。
   */
  async waitForTagPipeline(
    service: string,
    projectPath: string,
    tagName: string,
    stepId: number = 4,
  ): Promise<{ pipelineId: number; webUrl: string }> {
    const detectionInterval =
      CONFIG.UI.PIPELINE_DETECTION_INTERVAL ?? 10 * 1000;
    const detectionMaxWait =
      CONFIG.UI.PIPELINE_DETECTION_MAX_WAIT ?? 5 * 60 * 1000;
    const startTime = Date.now();

    this.stateManager.log(
      service,
      `[INFO] タグ ${tagName} のパイプラインを検出中...`,
    );

    // パイプライン検出ポーリング
    while (Date.now() - startTime < detectionMaxWait) {
      const pipelines = await retryWithBackoff(
        () =>
          this.api.getPipelines(projectPath, {
            ref: tagName,
            per_page: "1",
            order_by: "id",
            sort: "desc",
          }),
        {
          onRetry: (err, attempt) =>
            this.stateManager.log(
              service,
              `[WARNING] API一時エラー (リトライ ${attempt}/3): ${err.message}`,
            ),
        },
      );

      if (pipelines.length > 0) {
        const pipeline = pipelines[0];
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        this.stateManager.log(
          service,
          `[SUCCESS] パイプライン検出: ${pipeline.web_url} (${elapsedSeconds}秒)`,
        );

        // 既に完了している場合
        if (pipeline.status === "success") {
          this.stateManager.log(
            service,
            `[INFO] パイプラインは既に成功しています`,
          );
          return { pipelineId: pipeline.id, webUrl: pipeline.web_url };
        }

        if (pipeline.status === "failed" || pipeline.status === "canceled") {
          throw new Error(
            `タグパイプライン失敗: ${pipeline.status} (${pipeline.web_url})`,
          );
        }

        // パイプライン完了待機
        await this.waitForPipeline(service, projectPath, pipeline.id, stepId);
        return { pipelineId: pipeline.id, webUrl: pipeline.web_url };
      }

      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      this.stateManager.log(
        service,
        `[INFO] パイプライン未検出、リトライ中...`,
      );

      this.stateManager.updateStep(service, stepId, "running", {
        progress: Math.min(
          50,
          Math.floor(((Date.now() - startTime) / detectionMaxWait) * 50),
        ),
        elapsedSeconds,
      });

      await new Promise((resolve) => setTimeout(resolve, detectionInterval));
    }

    throw new Error(
      `パイプライン検出タイムアウト（${Math.floor(detectionMaxWait / 60000)}分）: タグ ${tagName} のパイプラインが見つかりませんでした`,
    );
  }
}
