/**
 * PRD MR作成コントローラー
 * 4ステップのMR作成フローをオーケストレーション
 */

import {
  GitLabAPI,
  ReleaseManagerAPI,
  type ServiceConfig,
  type ServiceDefinition,
} from "../api/gitlab";
import { CONFIG } from "../config";
import { PRD_TAG_PREFIX, type PromotionState } from "../promote-config";
import { PromoteStateManager } from "./promote-state";
import { PromoteHelmHandler } from "./promote-helm";
import { DeployPipelineHandler } from "./deploy-pipeline";

export type { PromotionState };

export class PromoteController {
  private api: GitLabAPI;
  private releaseManagerApi: ReleaseManagerAPI;
  public promotions: Map<string, PromotionState>;
  private serviceConfig: ServiceConfig | null = null;

  private stateManager: PromoteStateManager;
  private helmHandler: PromoteHelmHandler;
  private pipelineHandler: DeployPipelineHandler;

  // UIコールバック
  public onStepUpdate?: (
    service: string,
    stepId: number,
    status: "pending" | "running" | "success" | "failed",
    data?: any,
  ) => void;
  public onLogUpdate?: (service: string, log: string) => void;
  public onMrCreated?: (service: string, mrUrl: string) => void;
  public onPromotionComplete?: (
    service: string,
    status: "success" | "failed",
  ) => void;
  public onError?: (service: string, error: Error) => void;

  constructor(api?: GitLabAPI) {
    this.api = api ?? new GitLabAPI();
    this.releaseManagerApi = new ReleaseManagerAPI();
    this.promotions = new Map();

    this.stateManager = new PromoteStateManager(
      this.promotions,
      (service, stepId, status, data) =>
        this.onStepUpdate?.(service, stepId, status, data),
      (service, log) => this.onLogUpdate?.(service, log),
    );

    this.helmHandler = new PromoteHelmHandler(this.api, this.stateManager);
    this.helmHandler.onMrCreated = (service, mrUrl) =>
      this.onMrCreated?.(service, mrUrl);

    this.pipelineHandler = new DeployPipelineHandler(
      this.releaseManagerApi,
      this.stateManager,
    );
  }

  /**
   * サービス設定を取得
   */

  setMrTitleTemplate(template: string): void {
    this.helmHandler.setMrTitleTemplate(template);
  }

  async loadServiceConfig(): Promise<ServiceConfig> {
    if (!this.serviceConfig) {
      this.serviceConfig = await this.releaseManagerApi.getServiceConfig();
    }
    return this.serviceConfig;
  }

  /**
   * 複数サービスの一括MR作成
   */
  async promoteMultiple(
    services: string[],
    tagMap?: Map<string, string>,
  ): Promise<void> {
    for (const service of services) {
      try {
        await this.promote(service, tagMap?.get(service));
      } catch (error) {
        this.onError?.(
          service,
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
  }

  /**
   * 複数サービスを1つのMRにまとめてPRD反映
   * @param serviceTags サービス名 → タグのMap
   */
  async promoteBatch(serviceTags: Map<string, string>): Promise<string> {
    const config = await this.loadServiceConfig();
    const logService = serviceTags.keys().next().value!;

    this.stateManager.log(
      logService,
      `[INFO] バッチMR作成開始: ${serviceTags.size}件`,
    );

    // Step 1-2: 各サービスのタグ確認・差分チェック
    const validEntries: Array<{
      service: string;
      svcConfig: ServiceDefinition;
      tesTag: string;
      prdTag: string;
    }> = [];

    for (const [service, tesTag] of serviceTags) {
      const svcConfig = config.services[service];
      if (!svcConfig) {
        this.stateManager.log(
          logService,
          `[WARN] ${service}: 設定が見つかりません（スキップ）`,
        );
        continue;
      }

      try {
        const prdTag = await this.checkPrdDiff(service, svcConfig, tesTag);
        validEntries.push({ service, svcConfig, tesTag, prdTag });
      } catch (error) {
        this.stateManager.log(
          logService,
          `[WARN] ${service}: ${error instanceof Error ? error.message : String(error)}（スキップ）`,
        );
        this.onPromotionComplete?.(service, "failed");
      }
    }

    if (validEntries.length === 0) {
      throw new Error("MR作成対象のサービスがありません");
    }

    this.stateManager.log(
      logService,
      `[INFO] ${validEntries.length}件のサービスをMRにまとめます`,
    );

    // Step 3-4: バッチHelm処理（1ブランチ・1MR）
    const mrUrl = await this.helmHandler.promoteBatchToHelm(
      validEntries,
      logService,
    );

    // 全サービス完了通知
    for (const entry of validEntries) {
      const promotion = this.promotions.get(entry.service);
      if (promotion) promotion.status = "success";
      this.onMrCreated?.(entry.service, mrUrl);
      this.onPromotionComplete?.(entry.service, "success");
    }

    this.stateManager.log(
      logService,
      `[SUCCESS] バッチMR作成完了: ${validEntries.length}件`,
    );

    return mrUrl;
  }

  /**
   * PRD MR作成を実行（4ステップ）
   * @param service サービス名
   * @param overrideTag ユーザー指定タグ（省略時はTES valuesから自動取得）
   */
  async promote(service: string, overrideTag?: string): Promise<void> {
    const config = await this.loadServiceConfig();
    const svcConfig = config.services[service];

    if (!svcConfig) {
      throw new Error(`サービス ${service} の設定が見つかりません`);
    }

    const promotion: PromotionState = {
      service,
      status: "running",
      currentStep: 1,
      startedAt: new Date(),
      logs: "",
    };

    this.promotions.set(service, promotion);
    this.stateManager.log(service, `[INFO] PRD MR作成開始: ${service}`);

    try {
      // Step 1: TESタグ読み取り（overrideTag指定時はスキップ）
      let tesTag: string;
      if (overrideTag) {
        this.stateManager.updateStep(service, 1, "running");
        this.stateManager.log(
          service,
          `[INFO] ユーザー指定タグ使用: ${overrideTag}`,
        );
        tesTag = overrideTag;
        this.stateManager.updateStep(service, 1, "success");
      } else {
        tesTag = await this.readTesTag(service, svcConfig);
      }
      promotion.tesTag = tesTag;

      // Step 2: PRD差分確認
      const prdTag = await this.checkPrdDiff(service, svcConfig, tesTag);
      promotion.prdTag = prdTag;

      // Step 3-4: Helm処理
      await this.helmHandler.promoteToHelm(service, svcConfig, tesTag, prdTag);

      promotion.status = "success";
      this.onPromotionComplete?.(service, "success");
      this.stateManager.log(service, `[SUCCESS] PRD MR作成完了: ${service}`);
    } catch (error) {
      promotion.status = "failed";
      promotion.error = error instanceof Error ? error.message : String(error);
      this.onPromotionComplete?.(service, "failed");
      this.stateManager.log(
        service,
        `[ERROR] PRD MR作成失敗: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Step 1: TESタグ読み取り
   * environments/tes/values/{service}.yaml から tag を抽出
   */
  private async readTesTag(
    service: string,
    svcConfig: ServiceDefinition,
  ): Promise<string> {
    this.stateManager.updateStep(service, 1, "running");
    const infraProjectId = CONFIG.GITLAB.INFRASTRUCTURE_PROJECT_ID;
    const tesValuesFile = `environments/tes/values/${svcConfig.values_file}`;

    this.stateManager.log(
      service,
      `[INFO] TES valuesファイル読み取り: ${tesValuesFile}`,
    );

    const content = await this.api.getFile(
      infraProjectId,
      tesValuesFile,
      "master",
    );

    const tag = this.extractTagFromValues(content);
    if (!tag) {
      this.stateManager.updateStep(service, 1, "failed");
      throw new Error(
        `TES values.yamlからtag値を取得できません: ${tesValuesFile}`,
      );
    }

    // prd- プレフィックスを除去してアプリタグを取得
    const appTag = tag.startsWith(PRD_TAG_PREFIX)
      ? tag.substring(PRD_TAG_PREFIX.length)
      : tag;
    this.stateManager.log(service, `[SUCCESS] TESタグ取得: ${appTag}`);
    this.stateManager.updateStep(service, 1, "success");
    return appTag;
  }

  /**
   * Step 2: PRD差分確認
   * TES vs PRD のタグ比較
   */
  private async checkPrdDiff(
    service: string,
    svcConfig: ServiceDefinition,
    tesTag: string,
  ): Promise<string> {
    this.stateManager.updateStep(service, 2, "running");
    const infraProjectId = CONFIG.GITLAB.INFRASTRUCTURE_PROJECT_ID;
    const prdValuesFile = `environments/prd/values/${svcConfig.values_file}`;

    this.stateManager.log(
      service,
      `[INFO] PRD valuesファイル読み取り: ${prdValuesFile}`,
    );

    const content = await this.api.getFile(
      infraProjectId,
      prdValuesFile,
      "master",
    );

    const prdRawTag = this.extractTagFromValues(content);
    const prdTag = prdRawTag?.startsWith(PRD_TAG_PREFIX)
      ? prdRawTag.substring(PRD_TAG_PREFIX.length)
      : prdRawTag || "N/A";

    this.stateManager.log(service, `[INFO] PRDタグ: ${prdTag}`);

    if (tesTag === prdTag) {
      this.stateManager.updateStep(service, 2, "failed");
      throw new Error(`MR作成不要: TESとPRDは同一バージョンです (${tesTag})`);
    }

    this.stateManager.log(service, `[INFO] 差分あり: ${prdTag} → ${tesTag}`);
    this.stateManager.updateStep(service, 2, "success");
    return prdTag;
  }

  /**
   * values.yamlからtag値を抽出
   */
  private extractTagFromValues(content: string): string | null {
    // 形式1: image:\n  tag: "prd-v1.2.3"
    const imageBlockMatch = content.match(
      /image:\s*\n(?:\s*(?:repository|pullPolicy|digest):\s*[^\n]*\n){0,5}\s*tag:\s*["']?([^"'\s\n]+)["']?/,
    );
    if (imageBlockMatch) return imageBlockMatch[1];

    // 形式2: tag: "prd-v1.2.3"
    const simpleMatch = content.match(/tag:\s*["']?([^"'\s\n]+)["']?/);
    if (simpleMatch) return simpleMatch[1];

    return null;
  }

  /**
   * TESバージョンとPRDバージョンを取得（テーブル表示用）
   */
  async getVersions(
    service: string,
    svcConfig: ServiceDefinition,
  ): Promise<{ tesTag: string; prdTag: string }> {
    const infraProjectId = CONFIG.GITLAB.INFRASTRUCTURE_PROJECT_ID;

    const [tesContent, prdContent] = await Promise.all([
      this.api
        .getFile(
          infraProjectId,
          `environments/tes/values/${svcConfig.values_file}`,
          "master",
        )
        .catch(() => ""),
      this.api
        .getFile(
          infraProjectId,
          `environments/prd/values/${svcConfig.values_file}`,
          "master",
        )
        .catch(() => ""),
    ]);

    const tesRaw = this.extractTagFromValues(tesContent);
    const prdRaw = this.extractTagFromValues(prdContent);

    // prd- プレフィックスを除去
    const tesTag = tesRaw?.startsWith(PRD_TAG_PREFIX)
      ? tesRaw.substring(PRD_TAG_PREFIX.length)
      : tesRaw || "-";
    const prdTag = prdRaw?.startsWith(PRD_TAG_PREFIX)
      ? prdRaw.substring(PRD_TAG_PREFIX.length)
      : prdRaw || "-";

    return { tesTag, prdTag };
  }

  /**
   * ArgoCD Sync（手動呼び出し用）
   */
  async syncArgoCD(service: string): Promise<void> {
    this.stateManager.log(
      service,
      `[INFO] ArgoCD Sync パイプライン起動中（PRD環境）...`,
    );

    const syncPipeline = await this.releaseManagerApi.syncArgoCD(service, "prd");
    this.stateManager.log(
      service,
      `[SUCCESS] ArgoCD Sync パイプライン起動: ${syncPipeline.web_url}`,
    );

    // パイプライン完了を待機
    await this.pipelineHandler.waitForPipeline(
      service,
      CONFIG.GITLAB.PROJECT_ID,
      syncPipeline.id,
    );

    this.stateManager.log(service, `[SUCCESS] ArgoCD Sync 完了`);
  }

  /**
   * MR作成キャンセル
   */
  cancelPromotion(service: string): void {
    const promotion = this.promotions.get(service);
    if (promotion) {
      promotion.status = "canceled";
      this.stateManager.log(service, `[WARN] MR作成キャンセル`);
      this.onPromotionComplete?.(service, "failed");
    }
  }
}
