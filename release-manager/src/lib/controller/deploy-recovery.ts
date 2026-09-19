/**
 * デプロイリカバリー処理
 */

import { ReleaseManagerAPI, ServiceDefinition } from "../api/gitlab";
import { CONFIG } from "../config";
import { DeploymentState, DeployStateManager } from "./deploy-state";
import { DeployPipelineHandler } from "./deploy-pipeline";
import { DeployHelmHandler } from "./deploy-helm";
import { retryWithBackoff } from "../utils/retry";

export class DeployRecovery {
  constructor(
    public api: ReleaseManagerAPI,
    public deployments: Map<string, DeploymentState>,
    public stateManager: DeployStateManager,
    public pipelineHandler: DeployPipelineHandler,
    public helmHandler: DeployHelmHandler,
    public onMrCreated?: (
      service: string,
      mrType: "app" | "helm",
      mrUrl: string,
    ) => void,
    public onPipelineStarted?: (service: string, pipelineUrl: string) => void,
  ) {}

  /**
   * 指定ステップから再開
   */
  async recoverFromStep(
    service: string,
    svcConfig: ServiceDefinition,
    tagName: string,
    fromStep: number,
  ): Promise<void> {
    const appProjectPath = `${svcConfig.app_repo}`;
    const helmProjectPath = CONFIG.GITLAB.INFRASTRUCTURE_PROJECT_ID;

    // Step 1→2 のMR引き渡し用
    let appMrFromStep1: { iid: number; web_url: string } | null = null;

    // Step 1: アプリMR作成
    if (fromStep <= 1) {
      this.stateManager.updateStep(service, 1, "running");
      this.stateManager.log(
        service,
        `[INFO] アプリMR作成中: ${appProjectPath}`,
      );

      const appMr = await this.api.createMergeRequest(
        appProjectPath,
        "main",
        "release",
        `Release ${tagName} - ${service}`,
        `## リリース\n- サービス: ${service}\n- バージョン: ${tagName}\n\n自動生成されたMRです。`,
      );

      this.stateManager.log(
        service,
        `[SUCCESS] アプリMR作成完了: ${appMr.web_url}`,
      );
      this.onMrCreated?.(service, "app", appMr.web_url);
      this.stateManager.updateStep(service, 1, "success");
      appMrFromStep1 = { iid: appMr.iid, web_url: appMr.web_url };
    }

    // Step 2: アプリMRマージ
    if (fromStep <= 2) {
      this.stateManager.updateStep(service, 2, "running");
      this.stateManager.log(service, `[INFO] アプリMRを承認・マージ中...`);

      // Step 1から引き渡されたMRがあればそれを使用、なければAPI検索
      let appMrIid: number;
      if (appMrFromStep1) {
        appMrIid = appMrFromStep1.iid;
      } else {
        const openMrs = await this.api.getMergeRequests(appProjectPath, {
          state: "opened",
          source_branch: "main",
          target_branch: "release",
        });

        if (openMrs.length === 0) {
          throw new Error("アプリMRが見つかりません");
        }

        appMrIid = openMrs[0].iid;
        this.stateManager.log(
          service,
          `[SUCCESS] アプリMR発見: ${openMrs[0].web_url}`,
        );
      }

      await this.approveAndMergeMR(service, appProjectPath, appMrIid, {
        stepId: 2,
        successMessage: "アプリMRがマージされました",
        waitingMessage: "アプリMRマージ待機中",
        removeSourceBranch: false,
      });
    }

    // Step 3: タグ作成
    if (fromStep <= 3) {
      this.stateManager.updateStep(service, 3, "running");
      try {
        await this.api.createTag(
          appProjectPath,
          tagName,
          "release",
          `Release ${tagName}`,
        );
        this.stateManager.log(service, `[SUCCESS] タグ作成完了: ${tagName}`);
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        if (errMsg.includes("already exists")) {
          this.stateManager.log(
            service,
            `[INFO] タグ既存: ${tagName}（スキップ）`,
          );
        } else {
          throw error;
        }
      }
      this.stateManager.updateStep(service, 3, "success");
    }

    // Step 4: CI/CDパイプライン（検出+完了待機）
    if (fromStep <= 4) {
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
    }

    // Step 5: Helm ブランチ & MR
    if (fromStep <= 5) {
      this.stateManager.updateStep(service, 5, "running");
      const helmBranchName = `deploy/${service}/${tagName}`;

      try {
        await this.api.createBranch(helmProjectPath, helmBranchName, "master");
        this.stateManager.log(
          service,
          `[SUCCESS] Helmブランチ作成完了: ${helmBranchName}`,
        );
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        if (errMsg.includes("already exists")) {
          this.stateManager.log(
            service,
            `[INFO] Helmブランチ既存: ${helmBranchName}（スキップ）`,
          );
        } else {
          throw error;
        }
      }

      const valuesFilePath = `environments/tes/values/${svcConfig.values_file}`;
      this.stateManager.log(
        service,
        `[INFO] values.yaml更新中: ${valuesFilePath}`,
      );
      await this.helmHandler.updateHelmValues(
        helmProjectPath,
        valuesFilePath,
        helmBranchName,
        tagName,
        service,
      );
      this.stateManager.log(service, `[SUCCESS] values.yaml更新完了`);

      this.stateManager.log(
        service,
        `[INFO] Helm MR作成中: ${helmProjectPath}`,
      );
      const helmMr = await this.api.createMergeRequest(
        helmProjectPath,
        helmBranchName,
        "master",
        `Release ${service} ${tagName}`,
        `## Helmリリース\n- サービス: ${service}\n- バージョン: ${tagName}\n- values_file: ${svcConfig.values_file}\n- argocd_app: ${svcConfig.argocd_app}\n\n自動生成されたMRです。`,
      );
      this.stateManager.log(
        service,
        `[SUCCESS] Helm MR作成完了: ${helmMr.web_url}`,
      );
      this.onMrCreated?.(service, "helm", helmMr.web_url);
      this.stateManager.updateStep(service, 5, "success");
    }

    this.stateManager.log(
      service,
      `[SUCCESS] リカバリー完了: ${service} ${tagName}`,
    );
  }

  /**
   * パイプライン経由リカバリー
   */
  async recoverWithPipeline(
    service: string,
    tag: string,
    svcConfig: ServiceDefinition,
  ): Promise<void> {
    const deployment: DeploymentState = {
      service,
      version: tag,
      status: "running",
      currentStep: 4,
      startedAt: new Date(),
      logs: "",
    };
    this.deployments.set(service, deployment);

    this.stateManager.log(service, `[INFO] パイプラインリカバリー開始: ${tag}`);
    this.stateManager.updateStep(service, 1, "success");
    this.stateManager.updateStep(service, 2, "success");
    this.stateManager.updateStep(service, 3, "success");

    // Step 4: パイプライン実行
    this.stateManager.updateStep(service, 4, "running");
    const pipeline = await this.api.deploy(service, tag);
    this.stateManager.log(
      service,
      `[SUCCESS] リカバリーパイプライン開始: ${pipeline.web_url}`,
    );
    this.onPipelineStarted?.(service, pipeline.web_url);
    await this.pipelineHandler.waitForPipeline(
      service,
      CONFIG.GITLAB.PROJECT_ID,
      pipeline.id,
    );
    this.stateManager.updateStep(service, 4, "success");

    // Step 5以降: Helm処理
    await this.createHelmMRAndMerge(service, tag, svcConfig);

    this.stateManager.log(
      service,
      `[SUCCESS] リカバリー完了: ${service} ${tag}`,
    );
  }

  /**
   * タグ作成からリカバリー
   */
  async recoverFromTag(
    service: string,
    tag: string,
    svcConfig: ServiceDefinition,
  ): Promise<void> {
    const deployment: DeploymentState = {
      service,
      version: tag,
      status: "running",
      currentStep: 3,
      startedAt: new Date(),
      logs: "",
    };
    this.deployments.set(service, deployment);

    this.stateManager.log(service, `[INFO] タグ作成リカバリー開始: ${tag}`);

    await this.recoverFromStep(service, svcConfig, tag, 3);

    this.stateManager.log(
      service,
      `[SUCCESS] タグ作成リカバリー完了: ${service} ${tag}`,
    );
  }

  /**
   * アプリMR作成からリカバリー（Step 1から）
   */
  async recoverFromAppMr(
    service: string,
    tag: string,
    svcConfig: ServiceDefinition,
  ): Promise<void> {
    const deployment: DeploymentState = {
      service,
      version: tag,
      status: "running",
      currentStep: 1,
      startedAt: new Date(),
      logs: "",
    };
    this.deployments.set(service, deployment);

    this.stateManager.log(service, `[INFO] アプリMR作成リカバリー開始: ${tag}`);

    await this.recoverFromStep(service, svcConfig, tag, 1);

    this.stateManager.log(
      service,
      `[SUCCESS] アプリMR作成リカバリー完了: ${service} ${tag}`,
    );
  }

  /**
   * アプリMRマージからリカバリー（Step 2から）
   */
  async recoverFromAppMrMerge(
    service: string,
    tag: string,
    svcConfig: ServiceDefinition,
  ): Promise<void> {
    const deployment: DeploymentState = {
      service,
      version: tag,
      status: "running",
      currentStep: 2,
      startedAt: new Date(),
      logs: "",
    };
    this.deployments.set(service, deployment);

    this.stateManager.log(
      service,
      `[INFO] アプリMRマージリカバリー開始: ${tag}`,
    );

    // Step 1を成功としてマーク
    this.stateManager.updateStep(service, 1, "success");

    await this.recoverFromStep(service, svcConfig, tag, 2);

    this.stateManager.log(
      service,
      `[SUCCESS] アプリMRマージリカバリー完了: ${service} ${tag}`,
    );
  }

  /**
   * Infra（Helm）側からリカバリー
   */
  async recoverFromInfra(
    service: string,
    tag: string,
    svcConfig: ServiceDefinition,
  ): Promise<void> {
    const deployment: DeploymentState = {
      service,
      version: tag,
      status: "running",
      currentStep: 5,
      startedAt: new Date(),
      logs: "",
    };
    this.deployments.set(service, deployment);

    this.stateManager.log(service, `[INFO] Infraリカバリー開始: ${tag}`);
    this.stateManager.updateStep(service, 1, "success");
    this.stateManager.updateStep(service, 2, "success");
    this.stateManager.updateStep(service, 3, "success");
    this.stateManager.updateStep(service, 4, "success");

    await this.createHelmMRAndMerge(service, tag, svcConfig);

    this.stateManager.log(
      service,
      `[SUCCESS] Infraリカバリー完了: ${service} ${tag}`,
    );
  }

  /**
   * Helm MR作成＆マージ（共通処理）
   */
  private async createHelmMRAndMerge(
    service: string,
    tag: string,
    svcConfig: ServiceDefinition,
  ): Promise<void> {
    const helmProjectPath = CONFIG.GITLAB.INFRASTRUCTURE_PROJECT_ID;
    const helmBranchName = `deploy/${service}/${tag}`;

    // Step 5: Helm ブランチ & MR作成
    this.stateManager.updateStep(service, 5, "running");

    try {
      await this.api.createBranch(helmProjectPath, helmBranchName, "master");
      this.stateManager.log(
        service,
        `[SUCCESS] Helmブランチ作成完了: ${helmBranchName}`,
      );
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (
        errMsg.includes("already exists") ||
        errMsg.includes("Branch already exists")
      ) {
        this.stateManager.log(
          service,
          `[INFO] Helmブランチ既存: ${helmBranchName}（スキップ）`,
        );
      } else {
        throw error;
      }
    }

    const valuesFilePath = `environments/tes/values/${svcConfig.values_file}`;
    this.stateManager.log(
      service,
      `[INFO] values.yaml更新中: ${valuesFilePath}`,
    );
    await this.helmHandler.updateHelmValues(
      helmProjectPath,
      valuesFilePath,
      helmBranchName,
      tag,
      service,
    );
    this.stateManager.log(service, `[SUCCESS] values.yaml更新完了`);

    this.stateManager.log(service, `[INFO] Helm MR作成中: ${helmProjectPath}`);
    const helmMr = await this.api.createMergeRequest(
      helmProjectPath,
      helmBranchName,
      "master",
      `Release ${service} ${tag}`,
      `## Helmリリース\n- サービス: ${service}\n- バージョン: ${tag}\n- values_file: ${svcConfig.values_file}\n- argocd_app: ${svcConfig.argocd_app}\n\n自動生成されたMRです。`,
    );
    this.stateManager.log(
      service,
      `[SUCCESS] Helm MR作成完了: ${helmMr.web_url}`,
    );
    this.onMrCreated?.(service, "helm", helmMr.web_url);
    this.stateManager.updateStep(service, 5, "success");
  }

  /**
   * MR承認・マージ・待機の共通処理
   */
  private async approveAndMergeMR(
    service: string,
    projectPath: string,
    mrIid: number,
    options: {
      stepId: number;
      successMessage: string;
      waitingMessage: string;
      removeSourceBranch: boolean;
    },
  ): Promise<void> {
    this.stateManager.updateStep(service, options.stepId, "running");
    this.stateManager.log(service, `[INFO] MRを承認・マージ中...`);

    const mrState = await retryWithBackoff(
      () => this.api.getMergeRequest(projectPath, mrIid),
      {
        onRetry: (err, attempt) =>
          this.stateManager.log(
            service,
            `[WARNING] API一時エラー (リトライ ${attempt}/3): ${err.message}`,
          ),
      },
    );

    if (mrState.has_conflicts) {
      throw new Error("MRにコンフリクトがあります");
    }

    await this.api.approveMergeRequest(projectPath, mrIid);
    this.stateManager.log(service, `[INFO] MR承認完了。マージ予約中...`);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    await this.api.mergeMergeRequest(projectPath, mrIid, {
      removeSourceBranch: options.removeSourceBranch,
      mergeWhenPipelineSucceeds: true,
    });

    const maxWait = CONFIG.UI.MR_MAX_WAIT ?? 30 * 60 * 1000;
    const pollInterval = CONFIG.UI.MR_POLL_INTERVAL ?? 15 * 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      const mr = await retryWithBackoff(
        () => this.api.getMergeRequest(projectPath, mrIid),
        {
          onRetry: (err, attempt) =>
            this.stateManager.log(
              service,
              `[WARNING] API一時エラー (リトライ ${attempt}/3): ${err.message}`,
            ),
        },
      );
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);

      const progress = Math.min(
        95,
        Math.floor(((Date.now() - startTime) / maxWait) * 100),
      );
      this.stateManager.updateStep(service, options.stepId, "running", {
        progress,
        elapsedSeconds,
      });

      if (mr.state === "merged") {
        this.stateManager.log(
          service,
          `[SUCCESS] ${options.successMessage}（${elapsedSeconds}秒）`,
        );
        this.stateManager.updateStep(service, options.stepId, "success");
        return;
      }

      if (mr.state === "closed") {
        throw new Error("MRがクローズされました");
      }

      this.stateManager.log(
        service,
        `[INFO] ${options.waitingMessage}... (state=${mr.state})`,
      );
    }

    throw new Error(
      `${options.waitingMessage}タイムアウト（${Math.floor(maxWait / 60000)}分）`,
    );
  }
}
