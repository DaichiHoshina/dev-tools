import { ReleaseManagerAPI, ServiceConfig } from "../api/gitlab";
import { CONFIG, DEPLOY_STEPS } from "../config";
import { DeploymentState, DeployStateManager } from "./deploy-state";
import { DeployPipelineHandler } from "./deploy-pipeline";
import { DeployHelmHandler } from "./deploy-helm";
import { DeployMRHandler } from "./deploy-mr";
import { DeployRecovery } from "./deploy-recovery";
import { PipelineMonitorStorage, DeployHistoryStorage } from "../storage";

// CIパイプライン監視のタイムアウト（CIジョブのタイムアウト70分より余裕をもたせる）
const CI_PIPELINE_MAX_WAIT_MS = 90 * 60 * 1000;

export type { DeploymentState };

/**
 * デプロイコントローラー
 */
export class DeployController {
  private api: ReleaseManagerAPI;
  public deployments: Map<string, DeploymentState>;
  private serviceConfig: ServiceConfig | null = null;

  private stateManager: DeployStateManager;
  private pipelineHandler: DeployPipelineHandler;
  private helmHandler: DeployHelmHandler;
  private mrHandler: DeployMRHandler;
  private recovery: DeployRecovery;

  // コールバック（UIと連携）
  public onStepUpdate?: (
    service: string,
    stepId: number,
    status: "pending" | "running" | "success" | "failed" | "waiting",
    data?: any,
  ) => void;
  public onLogUpdate?: (service: string, log: string) => void;
  public onMrCreated?: (
    service: string,
    mrType: "app" | "helm",
    mrUrl: string,
  ) => void;
  public onDeploymentComplete?: (
    service: string,
    status: "success" | "failed",
  ) => void;
  public onError?: (service: string, error: Error) => void;
  public onPipelineStarted?: (service: string, pipelineUrl: string) => void;

  constructor(api?: any) {
    this.api = api ?? new ReleaseManagerAPI();
    this.deployments = new Map();

    this.stateManager = new DeployStateManager(
      this.deployments,
      (service, stepId, status, data) =>
        this.onStepUpdate?.(service, stepId, status, data),
      (service, log) => this.onLogUpdate?.(service, log),
    );

    this.pipelineHandler = new DeployPipelineHandler(
      this.api,
      this.stateManager,
    );
    this.helmHandler = new DeployHelmHandler(this.api, this.stateManager);
    this.mrHandler = new DeployMRHandler(
      this.api,
      this.stateManager,
      this.pipelineHandler,
      this.helmHandler,
      (service, mrType, mrUrl) => this.onMrCreated?.(service, mrType, mrUrl),
      (service, pipelineUrl) => this.onPipelineStarted?.(service, pipelineUrl),
    );
    this.recovery = new DeployRecovery(
      this.api,
      this.deployments,
      this.stateManager,
      this.pipelineHandler,
      this.helmHandler,
      (service, mrType, mrUrl) => this.onMrCreated?.(service, mrType, mrUrl),
      (service, pipelineUrl) => this.onPipelineStarted?.(service, pipelineUrl),
    );
  }

  /**
   * パイプラインモードか判定
   */
  isPipelineMode(): boolean {
    return !!CONFIG.PIPELINE.TRIGGER_TOKEN;
  }

  setMrTitleTemplate(template: string): void {
    this.mrHandler.setMrTitleTemplate(template);
  }

  /**
   * サービス設定を取得
   */
  async loadServiceConfig(): Promise<ServiceConfig> {
    if (!this.serviceConfig) {
      this.serviceConfig = await this.api.getServiceConfig();
    }
    return this.serviceConfig;
  }

  /**
   * デプロイ実行（複数サービス対応）
   */
  async deployMultiple(services: string[], tagName: string): Promise<void> {
    for (const service of services) {
      try {
        await this.deploy(service, tagName);
      } catch (error) {
        this.onError?.(
          service,
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
  }

  /**
   * デプロイ実行（単一サービス） — 旧互換（CIパイプラインモード用）
   */
  async deploy(service: string, tagName: string): Promise<void> {
    const config = await this.loadServiceConfig();
    const svcConfig = config.services[service];

    if (!svcConfig) {
      throw new Error(`サービス ${service} の設定が見つかりません`);
    }

    const deployment: DeploymentState = {
      service,
      version: tagName,
      status: "running",
      currentStep: 1,
      startedAt: new Date(),
      logs: "",
    };

    this.deployments.set(service, deployment);

    this.stateManager.log(
      service,
      `[INFO] リリース開始: ${service} ${tagName}`,
    );
    this.stateManager.log(
      service,
      `[INFO] パイプラインモード: ${this.isPipelineMode() ? "ON（CIに委譲）" : "OFF（ブラウザ実行）"}`,
    );

    try {
      if (this.isPipelineMode()) {
        await this.deployViaCIPipeline(service, tagName);
      } else {
        await this.mrHandler.createTagViaMergeRequest(
          service,
          svcConfig,
          tagName,
        );
      }

      deployment.status = "success";
      this.recordHistory(deployment, "success");
      this.onDeploymentComplete?.(service, "success");
      this.stateManager.log(service, `[SUCCESS] リリース完了: ${service}`);
    } catch (error) {
      deployment.status = "failed";
      deployment.error = error instanceof Error ? error.message : String(error);
      this.recordHistory(deployment, "failed");
      this.onDeploymentComplete?.(service, "failed");
      this.stateManager.log(
        service,
        `[ERROR] リリース失敗: ${error instanceof Error ? error.message : String(error)}`,
      );

      throw error;
    }
  }

  /**
   * タグ作成（Step 1〜4）
   */
  async createTag(service: string, tagName: string): Promise<void> {
    const config = await this.loadServiceConfig();
    const svcConfig = config.services[service];

    if (!svcConfig) {
      throw new Error(`サービス ${service} の設定が見つかりません`);
    }

    const deployment: DeploymentState = {
      service,
      version: tagName,
      status: "running",
      currentStep: 1,
      startedAt: new Date(),
      logs: "",
    };

    this.deployments.set(service, deployment);

    this.stateManager.log(
      service,
      `[INFO] タグ作成開始: ${service} ${tagName}`,
    );

    try {
      await this.mrHandler.createTagViaMergeRequest(
        service,
        svcConfig,
        tagName,
      );

      deployment.status = "success";
      this.recordHistory(deployment, "success");
      this.onDeploymentComplete?.(service, "success");
      this.stateManager.log(
        service,
        `[SUCCESS] タグ作成完了: ${service} ${tagName}`,
      );
    } catch (error) {
      deployment.status = "failed";
      deployment.error = error instanceof Error ? error.message : String(error);
      this.recordHistory(deployment, "failed");
      this.onDeploymentComplete?.(service, "failed");
      this.stateManager.log(
        service,
        `[ERROR] タグ作成失敗: ${error instanceof Error ? error.message : String(error)}`,
      );

      throw error;
    }
  }

  /**
   * バッチHelm MR作成（複数サービスの変更を1MRにまとめる）
   */
  async createBatchHelm(serviceTags: Map<string, string>): Promise<string> {
    const config = await this.loadServiceConfig();

    const entries = Array.from(serviceTags.entries()).map(
      ([service, tagName]) => {
        const svcConfig = config.services[service];
        if (!svcConfig) {
          throw new Error(`サービス ${service} の設定が見つかりません`);
        }
        return { service, svcConfig, tagName };
      },
    );

    const logService = entries[0].service;
    return this.mrHandler.createBatchHelmMR(entries, logService);
  }

  /**
   * CIパイプライン経由のデプロイ
   * ブラウザ側でGitLab APIを直接操作する代わりに、CIパイプラインに処理を委譲する。
   * タブ切り替え・ページ遷移後もCIがサーバーサイドで処理を継続する。
   */
  private async deployViaCIPipeline(
    service: string,
    tagName: string,
  ): Promise<void> {
    const totalSteps = DEPLOY_STEPS.length;

    this.stateManager.updateStep(service, 1, "running");
    for (let i = 2; i <= totalSteps; i++) {
      this.stateManager.updateStep(service, i, "waiting");
    }

    this.stateManager.log(service, `[INFO] CIパイプラインを起動中...`);

    const pipeline = await this.api.deploy(service, tagName);

    PipelineMonitorStorage.save({
      service,
      tagName,
      pipelineId: pipeline.id,
      pipelineUrl: pipeline.web_url,
      startedAt: new Date().toISOString(),
    });

    const deployment = this.deployments.get(service);
    if (deployment) deployment.pipelineUrl = pipeline.web_url;
    this.onPipelineStarted?.(service, pipeline.web_url);
    this.stateManager.log(
      service,
      `[SUCCESS] CIパイプライン起動: ${pipeline.web_url}`,
    );
    this.stateManager.log(
      service,
      `[INFO] タブを切り替えてもCIがサーバーサイドで処理を継続します`,
    );

    try {
      await this.pipelineHandler.waitForPipeline(
        service,
        CONFIG.GITLAB.PROJECT_ID,
        pipeline.id,
        1,
        CI_PIPELINE_MAX_WAIT_MS,
      );

      for (let i = 1; i <= totalSteps; i++) {
        this.stateManager.updateStep(service, i, "success");
      }
    } finally {
      PipelineMonitorStorage.remove(service);
    }
  }

  /**
   * ページリロード後のパイプライン監視再開
   * LocalStorageに保存されたパイプラインIDを使って監視を復旧する。
   */
  async resumePipelineMonitoring(
    service: string,
    pipelineId: number,
    pipelineUrl: string,
    tagName: string = "",
  ): Promise<void> {
    const totalSteps = DEPLOY_STEPS.length;

    const deployment: DeploymentState = {
      service,
      version: tagName,
      status: "running",
      currentStep: 1,
      startedAt: new Date(),
      logs: "",
      pipelineUrl,
    };
    this.deployments.set(service, deployment);

    this.stateManager.updateStep(service, 1, "running");
    for (let i = 2; i <= totalSteps; i++) {
      this.stateManager.updateStep(service, i, "waiting");
    }

    this.onPipelineStarted?.(service, pipelineUrl);
    this.stateManager.log(
      service,
      `[INFO] パイプライン監視を再開: ${pipelineUrl}`,
    );

    try {
      await this.pipelineHandler.waitForPipeline(
        service,
        CONFIG.GITLAB.PROJECT_ID,
        pipelineId,
        1,
        CI_PIPELINE_MAX_WAIT_MS,
      );

      PipelineMonitorStorage.remove(service);

      for (let i = 1; i <= totalSteps; i++) {
        this.stateManager.updateStep(service, i, "success");
      }

      deployment.status = "success";
      this.recordHistory(deployment, "success");
      this.onDeploymentComplete?.(service, "success");
      this.stateManager.log(service, `[SUCCESS] リリース完了: ${service}`);
    } catch (error) {
      PipelineMonitorStorage.remove(service);

      this.stateManager.updateStep(service, 1, "failed");
      deployment.status = "failed";
      deployment.error = error instanceof Error ? error.message : String(error);
      this.recordHistory(deployment, "failed");
      this.onDeploymentComplete?.(service, "failed");
      this.stateManager.log(
        service,
        `[ERROR] リリース失敗: ${deployment.error}`,
      );
      this.onError?.(
        service,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * デプロイキャンセル
   */
  cancelDeployment(service: string): void {
    const deployment = this.deployments.get(service);
    if (deployment) {
      deployment.status = "canceled";
      this.stateManager.log(service, `[WARN] リリースキャンセル`);

      // パイプラインモード: CIパイプラインをキャンセルしLocalStorageをクリーンアップ
      const pipelineState = PipelineMonitorStorage.get(service);
      if (pipelineState) {
        this.api
          .cancelPipeline(CONFIG.GITLAB.PROJECT_ID, pipelineState.pipelineId)
          .then(() =>
            this.stateManager.log(
              service,
              `[INFO] CIパイプラインをキャンセルしました`,
            ),
          )
          .catch((err) =>
            this.stateManager.log(
              service,
              `[WARNING] CIパイプラインキャンセル失敗: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
        PipelineMonitorStorage.remove(service);
      }

      this.onDeploymentComplete?.(service, "failed");
    }
  }

  /**
   * タグ作成からリカバリー
   */
  async recoverFromTag(service: string, tag: string): Promise<void> {
    const config = await this.loadServiceConfig();
    const svcConfig = config.services[service];
    if (!svcConfig) {
      throw new Error(`サービス設定が見つかりません: ${service}`);
    }
    await this.recovery.recoverFromTag(service, tag, svcConfig);
  }

  /**
   * パイプライン経由リカバリー
   */
  async recoverWithPipeline(service: string, tag: string): Promise<void> {
    const config = await this.loadServiceConfig();
    const svcConfig = config.services[service];
    if (!svcConfig) {
      throw new Error(`サービス設定が見つかりません: ${service}`);
    }
    await this.recovery.recoverWithPipeline(service, tag, svcConfig);
  }

  /**
   * Infra（Helm）側からリカバリー
   */
  async recoverFromInfra(service: string, tag: string): Promise<void> {
    const config = await this.loadServiceConfig();
    const svcConfig = config.services[service];
    if (!svcConfig) {
      throw new Error(`サービス設定が見つかりません: ${service}`);
    }
    await this.recovery.recoverFromInfra(service, tag, svcConfig);
  }

  /**
   * アプリMR作成からリカバリー（Step 1から）
   */
  async recoverFromAppMr(service: string, tag: string): Promise<void> {
    const config = await this.loadServiceConfig();
    const svcConfig = config.services[service];
    if (!svcConfig) {
      throw new Error(`サービス設定が見つかりません: ${service}`);
    }
    await this.recovery.recoverFromAppMr(service, tag, svcConfig);
  }

  /**
   * アプリMRマージからリカバリー（Step 2から）
   */
  async recoverFromAppMrMerge(service: string, tag: string): Promise<void> {
    const config = await this.loadServiceConfig();
    const svcConfig = config.services[service];
    if (!svcConfig) {
      throw new Error(`サービス設定が見つかりません: ${service}`);
    }
    await this.recovery.recoverFromAppMrMerge(service, tag, svcConfig);
  }

  /**
   * ArgoCD Sync（リリース完了後に手動実行）
   */
  async syncArgoCD(service: string): Promise<void> {
    this.stateManager.log(
      service,
      `[INFO] ArgoCD Sync パイプライン起動中（TES環境）...`,
    );
    const syncPipeline = await this.api.syncArgoCD(service);
    this.stateManager.log(
      service,
      `[SUCCESS] ArgoCD Sync パイプライン起動: ${syncPipeline.web_url}`,
    );
    await this.pipelineHandler.waitForPipeline(
      service,
      CONFIG.GITLAB.PROJECT_ID,
      syncPipeline.id,
    );
    this.stateManager.log(service, `[SUCCESS] ArgoCD Sync 完了`);
  }

  /**
   * デプロイ履歴をLocalStorageに記録
   */
  private recordHistory(
    deployment: DeploymentState,
    status: "success" | "failed",
  ): void {
    const now = new Date();
    DeployHistoryStorage.add({
      service: deployment.service,
      tagName: deployment.version || "-",
      status,
      startedAt: deployment.startedAt.toISOString(),
      completedAt: now.toISOString(),
      durationMs: now.getTime() - deployment.startedAt.getTime(),
      pipelineUrl: deployment.pipelineUrl,
    });
  }

  // テスト用の内部メソッド（ハンドラーに委譲）
  private updateStep(
    service: string,
    stepId: number,
    status: "pending" | "running" | "success" | "failed",
    data: { progress?: number; elapsedSeconds?: number } = {},
  ): void {
    this.stateManager.updateStep(service, stepId, status, data);
  }

  private log(service: string, message: string): void {
    this.stateManager.log(service, message);
  }

  private async updateHelmValues(
    projectPath: string,
    filePath: string,
    branch: string,
    tagName: string,
    service: string,
  ): Promise<void> {
    await this.helmHandler.updateHelmValues(
      projectPath,
      filePath,
      branch,
      tagName,
      service,
    );
  }

  private async waitForMrMerge(
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
    return await this.mrHandler.waitForMrMerge(
      service,
      projectId,
      mrIid,
      options,
    );
  }

  private async waitForPipeline(
    service: string,
    projectId: string,
    pipelineId: number,
    stepId: number = 4,
  ): Promise<void> {
    await this.pipelineHandler.waitForPipeline(
      service,
      projectId,
      pipelineId,
      stepId,
    );
  }
}
