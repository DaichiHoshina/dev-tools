/**
 * PRD MR作成 Helm操作ハンドラー
 * ブランチ作成・values更新・MR作成を担当
 */

import type { GitLabAPI, ServiceDefinition } from "../api/gitlab";
import type { PromoteStateManager } from "./promote-state";
import { CONFIG } from "../config";
import { PRD_TAG_PREFIX } from "../promote-config";
import { retryWithBackoff } from "../utils/retry";
import { MrTitleTemplateStorage, MR_TITLE_PRESETS } from "../storage";

export class PromoteHelmHandler {
  public onMrCreated?: (service: string, mrUrl: string) => void;

  private mrTitleTemplate: string;

  constructor(
    private api: GitLabAPI,
    private stateManager: PromoteStateManager,
  ) {
    this.mrTitleTemplate = MrTitleTemplateStorage.get(MR_TITLE_PRESETS.prd);
  }

  setMrTitleTemplate(template: string): void {
    this.mrTitleTemplate = template;
  }

  /**
   * PRD MR作成のHelm処理（Step 3-4）
   */
  async promoteToHelm(
    service: string,
    svcConfig: ServiceDefinition,
    tesTag: string,
    prdTag: string,
  ): Promise<void> {
    const infraProjectId = CONFIG.GITLAB.INFRASTRUCTURE_PROJECT_ID;
    const branchName = `promote-prd/${service}/${tesTag}`;

    // Step 3: Helmブランチ作成
    this.stateManager.updateStep(service, 3, "running");
    this.stateManager.log(service, `[INFO] Helmブランチ作成: ${branchName}`);

    try {
      await retryWithBackoff(
        () => this.api.createBranch(infraProjectId, branchName, "master"),
        {
          maxRetries: 2,
          onRetry: (err, attempt) =>
            this.stateManager.log(
              service,
              `[WARN] ブランチ作成リトライ (${attempt}): ${err.message}`,
            ),
        },
      );
      this.stateManager.log(
        service,
        `[SUCCESS] ブランチ作成完了: ${branchName}`,
      );
    } catch (error) {
      // 前回失敗時に残ったブランチを再利用すると、masterとの差分が
      // 不整合になり "Branch cannot be merged" エラーが発生する。
      // masterから最新の状態でブランチを再作成する。
      if (error instanceof Error && error.message.includes("already exists")) {
        this.stateManager.log(
          service,
          `[INFO] 既存ブランチを削除して再作成: ${branchName}`,
        );
        await this.recreateBranch(service, infraProjectId, branchName);
      } else {
        this.stateManager.updateStep(service, 3, "failed");
        throw error;
      }
    }

    // PRD values更新
    const prdValuesFile = `environments/prd/values/${svcConfig.values_file}`;
    this.stateManager.log(service, `[INFO] PRD values更新: ${prdValuesFile}`);

    const currentContent = await this.api.getFile(
      infraProjectId,
      prdValuesFile,
      branchName,
    );

    const prdHelmTag = `${PRD_TAG_PREFIX}${tesTag}`;
    const updatedContent = this.updateTagInValues(currentContent, prdHelmTag);

    if (updatedContent === currentContent) {
      this.stateManager.log(
        service,
        `[WARN] tag値が既に最新です: ${prdHelmTag}`,
      );
    } else {
      await this.api.updateFile(
        infraProjectId,
        prdValuesFile,
        branchName,
        updatedContent,
        `chore: promote ${service} to ${prdHelmTag} (PRD)`,
      );
      this.stateManager.log(service, `[SUCCESS] PRD values更新完了`);
    }

    this.stateManager.updateStep(service, 3, "success");

    // Step 4: MR作成
    this.stateManager.updateStep(service, 4, "running");
    const mrTitle = MrTitleTemplateStorage.resolve(
      this.mrTitleTemplate,
      service,
      tesTag,
    );
    const mrDescription = [
      `## PRD MR作成`,
      `- **サービス**: ${service}`,
      `- **TESバージョン**: ${tesTag}`,
      `- **PRDバージョン（変更前）**: ${prdTag || "N/A"}`,
      `- **Helmタグ**: ${prdHelmTag}`,
    ].join("\n");

    this.stateManager.log(service, `[INFO] Helm MR作成中...`);

    // 既存MR検索
    const existingMrs = await this.api.getMergeRequests(infraProjectId, {
      source_branch: branchName,
      target_branch: "master",
      state: "opened",
    });

    let mrUrl: string;

    if (existingMrs.length > 0) {
      mrUrl = existingMrs[0].web_url;
      this.stateManager.log(
        service,
        `[INFO] 既存MR使用: !${existingMrs[0].iid} (${mrUrl})`,
      );
    } else {
      const mr = await retryWithBackoff(
        () =>
          this.api.createMergeRequest(
            infraProjectId,
            branchName,
            "master",
            mrTitle,
            mrDescription,
          ),
        {
          maxRetries: 2,
          onRetry: (err, attempt) =>
            this.stateManager.log(
              service,
              `[WARN] MR作成リトライ (${attempt}): ${err.message}`,
            ),
        },
      );
      mrUrl = mr.web_url;
      this.stateManager.log(
        service,
        `[SUCCESS] Helm MR作成: !${mr.iid} (${mrUrl})`,
      );
    }

    this.onMrCreated?.(service, mrUrl);
    this.stateManager.log(service, `[INFO] 手動マージが必要です: ${mrUrl}`);
    this.stateManager.updateStep(service, 4, "success");
  }

  /**
   * 複数サービスのHelm変更を1ブランチ・1MRにまとめる（バッチ版）
   */
  async promoteBatchToHelm(
    entries: Array<{
      service: string;
      svcConfig: ServiceDefinition;
      tesTag: string;
      prdTag: string;
    }>,
    logService: string,
  ): Promise<string> {
    const infraProjectId = CONFIG.GITLAB.INFRASTRUCTURE_PROJECT_ID;
    const timestamp = new Date()
      .toISOString()
      .replace(/[:-]/g, "")
      .slice(0, 15);
    const branchName = `promote-prd/batch/${timestamp}`;

    // ブランチ作成
    this.stateManager.log(
      logService,
      `[INFO] バッチブランチ作成: ${branchName}`,
    );

    try {
      await retryWithBackoff(
        () => this.api.createBranch(infraProjectId, branchName, "master"),
        {
          maxRetries: 2,
          onRetry: (err, attempt) =>
            this.stateManager.log(
              logService,
              `[WARN] ブランチ作成リトライ (${attempt}): ${err.message}`,
            ),
        },
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("already exists")) {
        await this.recreateBranch(logService, infraProjectId, branchName);
      } else {
        throw error;
      }
    }

    this.stateManager.log(
      logService,
      `[SUCCESS] ブランチ作成完了: ${branchName}`,
    );

    // 各サービスのvalues更新
    for (const entry of entries) {
      const prdValuesFile = `environments/prd/values/${entry.svcConfig.values_file}`;
      this.stateManager.log(
        logService,
        `[INFO] ${entry.service}: PRD values更新: ${prdValuesFile}`,
      );

      const currentContent = await this.api.getFile(
        infraProjectId,
        prdValuesFile,
        branchName,
      );

      const prdHelmTag = `${PRD_TAG_PREFIX}${entry.tesTag}`;
      const updatedContent = this.updateTagInValues(currentContent, prdHelmTag);

      if (updatedContent === currentContent) {
        this.stateManager.log(
          logService,
          `[WARN] ${entry.service}: tag値が既に最新: ${prdHelmTag}`,
        );
      } else {
        await this.api.updateFile(
          infraProjectId,
          prdValuesFile,
          branchName,
          updatedContent,
          `chore: promote ${entry.service} to ${prdHelmTag} (PRD)`,
        );
        this.stateManager.log(
          logService,
          `[SUCCESS] ${entry.service}: PRD values更新完了 → ${prdHelmTag}`,
        );
      }
    }

    // MR作成
    const serviceNames = entries.map((e) => e.service).join(", ");
    const mrTitle = this.mrTitleTemplate
      ? `${this.mrTitleTemplate} ${serviceNames}`
      : `promote(prd): ${serviceNames}`;
    const mrDescriptionLines = [
      `## PRD 一括MR作成`,
      "",
      `| サービス | TES版 | PRD版(変更前) | Helmタグ |`,
      `|---------|-------|-------------|---------|`,
    ];
    for (const entry of entries) {
      const prdHelmTag = `${PRD_TAG_PREFIX}${entry.tesTag}`;
      mrDescriptionLines.push(
        `| ${entry.service} | ${entry.tesTag} | ${entry.prdTag || "N/A"} | ${prdHelmTag} |`,
      );
    }

    this.stateManager.log(logService, `[INFO] Helm MR作成中...`);

    const existingMrs = await this.api.getMergeRequests(infraProjectId, {
      source_branch: branchName,
      target_branch: "master",
      state: "opened",
    });

    let mrUrl: string;

    if (existingMrs.length > 0) {
      mrUrl = existingMrs[0].web_url;
      this.stateManager.log(
        logService,
        `[INFO] 既存MR使用: !${existingMrs[0].iid} (${mrUrl})`,
      );
    } else {
      const mr = await retryWithBackoff(
        () =>
          this.api.createMergeRequest(
            infraProjectId,
            branchName,
            "master",
            mrTitle,
            mrDescriptionLines.join("\n"),
          ),
        {
          maxRetries: 2,
          onRetry: (err, attempt) =>
            this.stateManager.log(
              logService,
              `[WARN] MR作成リトライ (${attempt}): ${err.message}`,
            ),
        },
      );
      mrUrl = mr.web_url;
      this.stateManager.log(
        logService,
        `[SUCCESS] Helm MR作成: !${mr.iid} (${mrUrl})`,
      );
    }

    this.stateManager.log(logService, `[INFO] 手動マージが必要です: ${mrUrl}`);
    return mrUrl;
  }

  /**
   * 既存ブランチを削除して再作成
   * 関連するオープンMRも事前にクローズする
   */
  private async recreateBranch(
    service: string,
    projectId: string,
    branchName: string,
  ): Promise<void> {
    // 安全ガード: promote-prd/ プレフィックスのみ許可
    if (!branchName.startsWith("promote-prd/")) {
      throw new Error(
        `ブランチ削除の安全ガード: promote-prd/ で始まるブランチのみ削除可能です（${branchName}）`,
      );
    }

    try {
      // 既存のオープンMRをクローズ
      const existingMrs = await this.api.getMergeRequests(projectId, {
        source_branch: branchName,
        state: "opened",
      });
      for (const mr of existingMrs) {
        try {
          await this.api.closeMergeRequest(projectId, mr.iid);
          this.stateManager.log(service, `[INFO] 既存MRをクローズ: !${mr.iid}`);
        } catch (closeError) {
          this.stateManager.log(
            service,
            `[WARN] MRクローズ失敗（続行）: !${mr.iid} - ${closeError instanceof Error ? closeError.message : String(closeError)}`,
          );
        }
      }

      await this.api.deleteBranch(projectId, branchName);
      await this.api.createBranch(projectId, branchName, "master");
      this.stateManager.log(
        service,
        `[SUCCESS] ブランチ再作成完了: ${branchName}`,
      );
    } catch (recreateError) {
      this.stateManager.updateStep(service, 3, "failed");
      throw recreateError;
    }
  }

  /**
   * values.yaml内のtag値を更新
   */
  private updateTagInValues(content: string, newTag: string): string {
    // 形式1: image:\n  tag: "prd-v1.2.3" (image直下、最大5行以内にtag)
    const updated = content.replace(
      /(image:\s*\n(?:\s*(?:repository|pullPolicy|digest):\s*[^\n]*\n){0,5}\s*tag:\s*["']?)([^"'\s\n]+)(["']?)/,
      `$1${newTag}$3`,
    );

    if (updated !== content) return updated;

    // 形式2: tag: "prd-v1.2.3" が直接ある場合
    return content.replace(
      /(tag:\s*["']?)([^"'\s\n]+)(["']?)/,
      `$1${newTag}$3`,
    );
  }
}
