/**
 * MR処理ハンドラー
 */

import {
  ReleaseManagerAPI,
  ServiceDefinition,
  GitLabMergeRequest,
} from "../api/gitlab";
import { CONFIG } from "../config";
import { DeployStateManager } from "./deploy-state";
import { DeployPipelineHandler } from "./deploy-pipeline";
import { DeployHelmHandler } from "./deploy-helm";
import { retryWithBackoff } from "../utils/retry";
import { MrTitleTemplateStorage } from "../storage";

export class DeployMRHandler {
  private mrTitleTemplate: string;

  constructor(
    public api: ReleaseManagerAPI,
    public stateManager: DeployStateManager,
    public pipelineHandler: DeployPipelineHandler,
    public helmHandler: DeployHelmHandler,
    public onMrCreated?: (
      service: string,
      mrType: "app" | "helm",
      mrUrl: string,
    ) => void,
    public onPipelineStarted?: (service: string, pipelineUrl: string) => void,
  ) {
    this.mrTitleTemplate = MrTitleTemplateStorage.get();
  }

  setMrTitleTemplate(template: string): void {
    this.mrTitleTemplate = template;
  }

  private resolveMrTitle(service: string, tagName: string): string {
    return MrTitleTemplateStorage.resolve(
      this.mrTitleTemplate,
      service,
      tagName,
    );
  }

  /**
   * タグ作成フロー（Step 1〜4）
   */
  async createTagViaMergeRequest(
    service: string,
    svcConfig: ServiceDefinition,
    tagName: string,
  ): Promise<void> {
    const appProjectPath = `${svcConfig.app_repo}`;

    // Step 1: アプリMR作成
    this.stateManager.updateStep(service, 1, "running");
    this.stateManager.log(service, `[INFO] アプリMR作成中: ${appProjectPath}`);

    const appMr = await this.api.createMergeRequest(
      appProjectPath,
      "main",
      "release",
      this.resolveMrTitle(service, tagName),
      `## リリース\n- サービス: ${service}\n- バージョン: ${tagName}\n\n自動生成されたMRです。`,
    );

    this.stateManager.log(
      service,
      `[SUCCESS] アプリMR作成完了: ${appMr.web_url}`,
    );
    this.onMrCreated?.(service, "app", appMr.web_url);
    this.stateManager.updateStep(service, 1, "success");

    // Step 2: アプリMR自動マージ
    this.stateManager.updateStep(service, 2, "running");
    this.stateManager.log(service, `[INFO] アプリMRを承認・マージ中...`);

    await this.api.approveMergeRequest(appProjectPath, appMr.iid);
    this.stateManager.log(
      service,
      `[INFO] MR承認完了。マージ可能状態を確認中...`,
    );

    await new Promise((resolve) => setTimeout(resolve, 2000));

    let retries = 3;
    let mergeSuccess = false;
    let mergeCommitSha = "";

    while (retries > 0 && !mergeSuccess) {
      try {
        let mrState = await retryWithBackoff(
          () => this.api.getMergeRequest(appProjectPath, appMr.iid),
          {
            onRetry: (err, attempt) =>
              this.stateManager.log(
                service,
                `[WARNING] API一時エラー (リトライ ${attempt}/3): ${err.message}`,
              ),
          },
        );
        this.stateManager.log(
          service,
          `[DEBUG] MR状態: state=${mrState.state}, merge_status=${mrState.merge_status}, has_conflicts=${mrState.has_conflicts}`,
        );

        if (mrState.state === "closed" || mrState.state === "merged") {
          this.stateManager.log(
            service,
            `[ERROR] MRが既に閉じられています: ${mrState.state}`,
          );
          throw new Error(`MRが既に閉じられています: ${mrState.state}`);
        }

        if (mrState.has_conflicts) {
          this.stateManager.log(
            service,
            `[ERROR] ブランチにコンフリクトがあります`,
          );
          throw new Error("ブランチにコンフリクトがあります");
        }

        // unchecked/checking の場合は差分計算完了を待つ（最大30秒）
        if (
          mrState.merge_status === "unchecked" ||
          mrState.merge_status === "checking"
        ) {
          this.stateManager.log(
            service,
            `[INFO] MR差分計算中... (${mrState.merge_status})`,
          );
          for (let i = 0; i < 6; i++) {
            await new Promise((resolve) => setTimeout(resolve, 5000));
            mrState = await this.api.getMergeRequest(appProjectPath, appMr.iid);
            if (
              mrState.merge_status !== "unchecked" &&
              mrState.merge_status !== "checking"
            ) {
              break;
            }
          }
        }

        if (mrState.merge_status && mrState.merge_status !== "can_be_merged") {
          this.stateManager.log(
            service,
            `[WARNING] MRがマージ可能状態ではありません: ${mrState.merge_status}`,
          );

          if (retries > 1) {
            this.stateManager.log(
              service,
              `[INFO] 5秒待機してリトライします... (残り${retries - 1}回)`,
            );
            await new Promise((resolve) => setTimeout(resolve, 5000));
            retries--;
            continue;
          }
        }

        await retryWithBackoff(
          () =>
            this.api.mergeMergeRequest(appProjectPath, appMr.iid, {
              removeSourceBranch: false,
              mergeWhenPipelineSucceeds: true,
            }),
          {
            maxRetries: 3,
            baseDelay: 3000,
            onRetry: (err, attempt) =>
              this.stateManager.log(
                service,
                `[WARNING] マージリトライ (${attempt}/3): ${err.message}`,
              ),
          },
        );

        this.stateManager.log(
          service,
          `[INFO] マージ予約完了。パイプライン完了を待機中...`,
        );

        const maxWaitTime = 30 * 60 * 1000;
        const pollInterval = 15 * 1000;
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitTime) {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));

          const currentMr = await retryWithBackoff(
            () => this.api.getMergeRequest(appProjectPath, appMr.iid),
            {
              onRetry: (err, attempt) =>
                this.stateManager.log(
                  service,
                  `[WARNING] API一時エラー (リトライ ${attempt}/3): ${err.message}`,
                ),
            },
          );
          const elapsed = Math.floor((Date.now() - startTime) / 1000);

          const progress = Math.min(
            95,
            Math.floor(((Date.now() - startTime) / maxWaitTime) * 100),
          );
          this.stateManager.updateStep(service, 2, "running", {
            progress,
            elapsedSeconds: elapsed,
          });

          if (currentMr.state === "merged") {
            this.stateManager.log(
              service,
              `[SUCCESS] アプリMRがマージされました（${elapsed}秒）`,
            );
            mergeCommitSha = currentMr.merge_commit_sha ?? "";
            mergeSuccess = true;
            break;
          }

          if (currentMr.state === "closed") {
            throw new Error("MRがクローズされました");
          }

          this.stateManager.log(
            service,
            `[INFO] マージ待機中... (state=${currentMr.state})`,
          );
        }

        if (!mergeSuccess) {
          throw new Error("マージ待機タイムアウト（30分）");
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        if (
          (errorMessage.includes("422") || errorMessage.includes("405")) &&
          retries > 1
        ) {
          this.stateManager.log(
            service,
            `[WARNING] マージ失敗（${errorMessage.includes("422") ? "422" : "405"}エラー）。MR状態を再確認します... (残り${retries - 1}回)`,
          );
          await new Promise((resolve) => setTimeout(resolve, 5000));
          retries--;
        } else {
          this.stateManager.log(
            service,
            `[ERROR] アプリMRマージ失敗: ${errorMessage}`,
          );
          throw error;
        }
      }
    }

    if (!mergeSuccess) {
      throw new Error("アプリMRのマージに失敗しました（リトライ回数超過）");
    }

    this.stateManager.updateStep(service, 2, "success");

    // Step 3: releaseビルド & タグ作成
    this.stateManager.updateStep(service, 3, "running");

    this.stateManager.log(
      service,
      `[INFO] releaseブランチのパイプライン完了を待機中...`,
    );
    await new Promise((resolve) =>
      setTimeout(resolve, CONFIG.UI.PIPELINE_POLL_INTERVAL),
    );

    const releasePipelines = await this.api.getPipelines(appProjectPath, {
      ref: "release",
      per_page: "1",
      order_by: "id",
      sort: "desc",
    });

    if (releasePipelines.length > 0) {
      const releasePipeline = releasePipelines[0];
      this.stateManager.log(
        service,
        `[INFO] releaseパイプライン検出: ${releasePipeline.web_url} (status=${releasePipeline.status})`,
      );

      if (
        mergeCommitSha &&
        releasePipeline.sha &&
        releasePipeline.sha !== mergeCommitSha
      ) {
        this.stateManager.log(
          service,
          `[WARNING] パイプラインSHA不一致: pipeline=${releasePipeline.sha}, merge=${mergeCommitSha}。最新パイプラインとして続行します。`,
        );
      }

      if (
        releasePipeline.status !== "success" &&
        releasePipeline.status !== "failed" &&
        releasePipeline.status !== "canceled"
      ) {
        await this.pipelineHandler.waitForPipeline(
          service,
          appProjectPath,
          releasePipeline.id,
          3,
        );
      } else if (releasePipeline.status === "success") {
        this.stateManager.log(
          service,
          `[INFO] releaseパイプラインは既に成功しています`,
        );
      } else {
        this.stateManager.log(
          service,
          `[WARNING] releaseパイプラインが失敗/キャンセル: ${releasePipeline.status}`,
        );
        throw new Error(`releaseパイプライン失敗: ${releasePipeline.status}`);
      }
    } else {
      this.stateManager.log(
        service,
        `[INFO] releaseブランチのパイプラインが見つかりません。スキップします。`,
      );
    }

    // タグ作成
    this.stateManager.log(service, `[INFO] タグ作成中: ${tagName}`);

    await this.api.createTag(
      appProjectPath,
      tagName,
      "release",
      `Release ${tagName}`,
    );
    this.stateManager.log(service, `[SUCCESS] タグ作成完了: ${tagName}`);
    this.stateManager.updateStep(service, 3, "success");

    // Step 4: CI/CDパイプライン（検出+完了待機）
    this.stateManager.updateStep(service, 4, "running");
    this.stateManager.log(service, `[INFO] CI/CDパイプラインを待機中...`);

    const { webUrl: pipelineUrl } =
      await this.pipelineHandler.waitForTagPipeline(
        service,
        appProjectPath,
        tagName,
      );
    this.onPipelineStarted?.(service, pipelineUrl);

    this.stateManager.updateStep(service, 4, "success");

    this.stateManager.log(
      service,
      `[SUCCESS] タグ作成フロー完了: ${service} ${tagName}`,
    );
  }

  /**
   * 複数サービスのHelm変更を1ブランチ・1MRにまとめる（バッチ版）
   */
  async createBatchHelmMR(
    entries: Array<{
      service: string;
      svcConfig: ServiceDefinition;
      tagName: string;
    }>,
    logService: string,
  ): Promise<string> {
    const helmProjectPath = CONFIG.GITLAB.INFRASTRUCTURE_PROJECT_ID;
    const timestamp = new Date()
      .toISOString()
      .replace(/[:-]/g, "")
      .slice(0, 15);
    const branchName = `deploy/batch/${timestamp}`;

    // ブランチ作成
    this.stateManager.log(
      logService,
      `[INFO] バッチブランチ作成: ${branchName}`,
    );

    try {
      await this.api.createBranch(helmProjectPath, branchName, "master");
      this.stateManager.log(
        logService,
        `[SUCCESS] ブランチ作成完了: ${branchName}`,
      );
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes("already exists")) {
        this.stateManager.log(
          logService,
          `[INFO] ブランチ既存: ${branchName}（スキップ）`,
        );
      } else {
        throw error;
      }
    }

    // 各サービスの関連MRを一括取得
    const allRelatedMRs: GitLabMergeRequest[] = [];
    for (const entry of entries) {
      const appProjectPath = `${entry.svcConfig.app_repo}`;
      const mrs = await this.getRelatedMergeRequests(appProjectPath);
      allRelatedMRs.push(...mrs);
    }
    const relatedMRsSection = this.formatRelatedMRs(
      Array.from(new Map(allRelatedMRs.map((mr) => [mr.web_url, mr])).values()),
    );

    // 各サービスのvalues更新
    for (const entry of entries) {
      const valuesFilePath = `environments/tes/values/${entry.svcConfig.values_file}`;
      this.stateManager.log(
        logService,
        `[INFO] ${entry.service}: values更新: ${valuesFilePath}`,
      );
      await this.helmHandler.updateHelmValues(
        helmProjectPath,
        valuesFilePath,
        branchName,
        entry.tagName,
        entry.service,
      );
      this.stateManager.log(
        logService,
        `[SUCCESS] ${entry.service}: values更新完了`,
      );
    }

    // MR作成
    const serviceNames = entries.map((e) => e.service).join(", ");
    const mrTitle = this.mrTitleTemplate
      ? `${this.mrTitleTemplate} ${serviceNames}`
      : `deploy(tes): ${serviceNames}`;
    const mrDescriptionLines = [
      `## TES Helm一括リリース`,
      "",
      `| サービス | バージョン |`,
      `|---------|----------|`,
    ];
    for (const entry of entries) {
      mrDescriptionLines.push(`| ${entry.service} | ${entry.tagName} |`);
    }
    if (relatedMRsSection) {
      mrDescriptionLines.push(relatedMRsSection);
    }
    mrDescriptionLines.push("", "自動生成されたMRです。");

    this.stateManager.log(logService, `[INFO] Helm MR作成中...`);

    const mr = await this.api.createMergeRequest(
      helmProjectPath,
      branchName,
      "master",
      mrTitle,
      mrDescriptionLines.join("\n"),
    );

    const mrUrl = mr.web_url;
    this.stateManager.log(logService, `[SUCCESS] Helm MR作成完了: ${mrUrl}`);
    this.onMrCreated?.(logService, "helm", mrUrl);

    return mrUrl;
  }

  /**
   * MRがマージされるまで待機
   */
  async waitForMrMerge(
    service: string,
    projectId: string,
    mrIid: number,
    options: {
      maxWait?: number;
      pollInterval?: number;
      successMessage?: string;
      waitingMessage?: string;
      stepId?: number;
    } = {},
  ): Promise<{ success: true; elapsedSeconds: number }> {
    const maxWait = options.maxWait ?? CONFIG.UI.MR_MAX_WAIT ?? 30 * 60 * 1000;
    const pollInterval =
      options.pollInterval ?? CONFIG.UI.MR_POLL_INTERVAL ?? 15 * 1000;
    const successMessage = options.successMessage ?? "MRがマージされました";
    const waitingMessage = options.waitingMessage ?? "MRマージ待機中";
    const stepId = options.stepId;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      const mr = await retryWithBackoff(
        () => this.api.getMergeRequest(projectId, mrIid),
        {
          onRetry: (err, attempt) =>
            this.stateManager.log(
              service,
              `[WARNING] API一時エラー (リトライ ${attempt}/3): ${err.message}`,
            ),
        },
      );
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);

      if (stepId) {
        const progress = Math.min(
          90,
          Math.floor(((Date.now() - startTime) / maxWait) * 100),
        );
        this.stateManager.updateStep(service, stepId, "running", {
          progress,
          elapsedSeconds,
        });
      }

      if (mr.state === "merged") {
        this.stateManager.log(
          service,
          `[SUCCESS] ${successMessage}（${elapsedSeconds}秒）`,
        );
        return { success: true, elapsedSeconds };
      }

      if (mr.state === "closed") {
        throw new Error("MRがクローズされました");
      }

      this.stateManager.log(
        service,
        `[INFO] ${waitingMessage}... (state=${mr.state})`,
      );
    }

    throw new Error(
      `${waitingMessage}タイムアウト（${Math.floor(maxWait / 60000)}分）`,
    );
  }

  /**
   * 関連MR一覧を取得
   */
  async getRelatedMergeRequests(
    projectPath: string,
  ): Promise<GitLabMergeRequest[]> {
    try {
      const comparison = await this.api.compareBranches(
        projectPath,
        "release",
        "main",
      );

      console.log(
        `[関連MR] compareBranches(${projectPath}, release→main): ${comparison.commits?.length ?? 0}件のコミット`,
      );

      if (!comparison.commits || comparison.commits.length === 0) {
        return [];
      }

      const mrMap = new Map<number, GitLabMergeRequest>();

      for (const commit of comparison.commits) {
        try {
          const mrs = await this.api.getCommitMergeRequests(
            projectPath,
            commit.id,
          );
          for (const mr of mrs) {
            if (mr.target_branch === "main" && mr.state === "merged") {
              mrMap.set(mr.iid, mr);
            }
          }
        } catch {
          // 個別コミットのMR取得失敗は無視
        }
      }

      return Array.from(mrMap.values());
    } catch (error) {
      console.error(`[関連MR] 取得失敗(${projectPath}):`, error);
      return [];
    }
  }

  /**
   * 関連MR一覧をMarkdown形式で整形
   */
  formatRelatedMRs(mrs: GitLabMergeRequest[]): string {
    if (mrs.length === 0) {
      return "";
    }

    const mrList = mrs
      .map((mr) => `- ${mr.title} ([!${mr.iid}](${mr.web_url}))`)
      .join("\n");

    return `\n### 含まれる変更\n${mrList}\n`;
  }
}
