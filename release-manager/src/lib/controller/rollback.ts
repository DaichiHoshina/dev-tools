/**
 * PRDロールバックコントローラー
 * Helm values を以前のバージョンに戻すMRを作成
 */

import {
  GitLabAPI,
  ReleaseManagerAPI,
  type ServiceConfig,
  type ServiceDefinition,
} from "../api/gitlab";
import { CONFIG } from "../config";
import { PRD_TAG_PREFIX } from "../promote-config";
import type { RollbackState, VersionHistoryEntry } from "../rollback-config";
import type { StepUpdateData } from "./deploy-pipeline";
import { retryWithBackoff } from "../utils/retry";

export class RollbackController {
  private api: GitLabAPI;
  private releaseManagerApi: ReleaseManagerAPI;
  public rollbacks: Map<string, RollbackState>;
  private serviceConfig: ServiceConfig | null = null;

  // UIコールバック
  public onStepUpdate?: (
    service: string,
    stepId: number,
    status: "pending" | "running" | "success" | "failed",
    data?: StepUpdateData,
  ) => void;
  public onLogUpdate?: (service: string, log: string) => void;
  public onMrCreated?: (service: string, mrUrl: string) => void;
  public onRollbackComplete?: (
    service: string,
    status: "success" | "failed",
  ) => void;
  public onError?: (service: string, error: Error) => void;

  constructor(api?: GitLabAPI) {
    this.api = api ?? new GitLabAPI();
    this.releaseManagerApi = new ReleaseManagerAPI();
    this.rollbacks = new Map();
  }

  async loadServiceConfig(): Promise<ServiceConfig> {
    if (!this.serviceConfig) {
      this.serviceConfig = await this.releaseManagerApi.getServiceConfig();
    }
    return this.serviceConfig;
  }

  /**
   * ソフトキャンセル: 状態をcanceledに設定する。
   * 実行中のAPI呼び出しは即座には停止しない（PromoteController.cancelPromotion と同じ設計）。
   */
  cancelRollback(service: string): void {
    const rb = this.rollbacks.get(service);
    if (rb) rb.status = "canceled";
  }

  // --- 状態管理ヘルパー ---

  private log(service: string, message: string): void {
    const rb = this.rollbacks.get(service);
    if (rb) rb.logs += message + "\n";
    this.onLogUpdate?.(service, message);
  }

  // --- バージョン履歴 ---

  /**
   * PRD values file の git コミット履歴からバージョン履歴を取得
   */
  async getVersionHistory(
    service: string,
    svcConfig: ServiceDefinition,
  ): Promise<VersionHistoryEntry[]> {
    const infraProjectId = CONFIG.GITLAB.INFRASTRUCTURE_PROJECT_ID;
    const prdValuesPath = `environments/prd/values/${svcConfig.values_file}`;

    const commits = await this.api.getFileCommits(
      infraProjectId,
      prdValuesPath,
      {
        per_page: "20",
      },
    );

    const entries: VersionHistoryEntry[] = [];
    const seenTags = new Set<string>();

    for (const commit of commits) {
      const tag = this.extractTagFromCommitMessage(commit.message);
      if (tag && !seenTags.has(tag)) {
        seenTags.add(tag);
        entries.push({
          tag,
          commitMessage: commit.title,
          date: commit.created_at,
          sha: commit.id,
        });
      }
    }

    // コミットメッセージから抽出できなかった場合、直近コミットのファイル内容を確認
    if (entries.length === 0 && commits.length > 0) {
      for (const commit of commits.slice(0, 5)) {
        try {
          const content = await this.api.getFile(
            infraProjectId,
            prdValuesPath,
            commit.id,
          );
          const tag = this.extractTagFromValues(content);
          if (tag && !seenTags.has(tag)) {
            seenTags.add(tag);
            entries.push({
              tag,
              commitMessage: commit.title,
              date: commit.created_at,
              sha: commit.id,
            });
          }
        } catch {
          // ファイル読み取り失敗はスキップ
        }
      }
    }

    return entries;
  }

  /**
   * 現在の PRD バージョンを取得
   */
  async getCurrentPrdTag(svcConfig: ServiceDefinition): Promise<string> {
    const infraProjectId = CONFIG.GITLAB.INFRASTRUCTURE_PROJECT_ID;
    const prdValuesPath = `environments/prd/values/${svcConfig.values_file}`;

    try {
      const content = await this.api.getFile(
        infraProjectId,
        prdValuesPath,
        "master",
      );
      const rawTag = this.extractTagFromValues(content);
      if (!rawTag) return "-";
      return rawTag.startsWith(PRD_TAG_PREFIX)
        ? rawTag.substring(PRD_TAG_PREFIX.length)
        : rawTag;
    } catch {
      return "-";
    }
  }

  // --- バッチロールバック（1MRにまとめる） ---

  /**
   * 複数サービスを1つのMRにまとめてロールバック
   * MR作成のみ（自動マージ・ArgoCD Syncは行わない）
   */
  async rollbackBatch(serviceTags: Map<string, string>): Promise<string> {
    const config = await this.loadServiceConfig();
    const logService = serviceTags.keys().next().value!;

    this.log(
      logService,
      `[INFO] バッチロールバック開始: ${serviceTags.size}件`,
    );

    // バリデーション: 各サービスの設定・現在バージョン確認
    const validEntries: Array<{
      service: string;
      svcConfig: ServiceDefinition;
      targetTag: string;
      currentTag: string;
    }> = [];

    for (const [service, targetTag] of serviceTags) {
      const svcConfig = config.services[service];
      if (!svcConfig) {
        this.log(
          logService,
          `[WARN] ${service}: 設定が見つかりません（スキップ）`,
        );
        this.onRollbackComplete?.(service, "failed");
        continue;
      }

      try {
        const currentTag = await this.getCurrentPrdTag(svcConfig);
        if (targetTag === currentTag) {
          this.log(
            logService,
            `[WARN] ${service}: ロールバック先（${targetTag}）は現在のPRDバージョンと同じです（スキップ）`,
          );
          this.onRollbackComplete?.(service, "failed");
          continue;
        }
        validEntries.push({ service, svcConfig, targetTag, currentTag });
      } catch (error) {
        this.log(
          logService,
          `[WARN] ${service}: ${error instanceof Error ? error.message : String(error)}（スキップ）`,
        );
        this.onRollbackComplete?.(service, "failed");
      }
    }

    if (validEntries.length === 0) {
      throw new Error("ロールバック対象のサービスがありません");
    }

    this.log(
      logService,
      `[INFO] ${validEntries.length}件のサービスをMRにまとめます`,
    );

    // ブランチ作成
    const infraProjectId = CONFIG.GITLAB.INFRASTRUCTURE_PROJECT_ID;
    const timestamp = new Date()
      .toISOString()
      .replace(/[:-]/g, "")
      .slice(0, 15);
    const branchName = `rollback-prd/batch/${timestamp}`;

    this.log(logService, `[INFO] バッチブランチ作成: ${branchName}`);

    try {
      await retryWithBackoff(
        () => this.api.createBranch(infraProjectId, branchName, "master"),
        {
          maxRetries: 2,
          onRetry: (err, attempt) =>
            this.log(
              logService,
              `[WARN] ブランチ作成リトライ (${attempt}): ${err.message}`,
            ),
        },
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("already exists")) {
        this.log(
          logService,
          `[INFO] 既存ブランチを削除して再作成: ${branchName}`,
        );
        await this.recreateBranch(logService, infraProjectId, branchName);
      } else {
        throw error;
      }
    }

    this.log(logService, `[SUCCESS] ブランチ作成完了: ${branchName}`);

    // 各サービスの PRD values 更新
    for (const entry of validEntries) {
      const prdValuesFile = `environments/prd/values/${entry.svcConfig.values_file}`;
      this.log(
        logService,
        `[INFO] ${entry.service}: PRD values更新: ${prdValuesFile}`,
      );

      const currentContent = await this.api.getFile(
        infraProjectId,
        prdValuesFile,
        branchName,
      );

      const rollbackHelmTag = `${PRD_TAG_PREFIX}${entry.targetTag}`;
      const updatedContent = this.updateTagInValues(
        currentContent,
        rollbackHelmTag,
      );

      if (updatedContent === currentContent) {
        this.log(
          logService,
          `[WARN] ${entry.service}: tag値が既にロールバック先と同じ: ${rollbackHelmTag}`,
        );
      } else {
        await this.api.updateFile(
          infraProjectId,
          prdValuesFile,
          branchName,
          updatedContent,
          `chore: rollback ${entry.service} to ${rollbackHelmTag} (PRD)`,
        );
        this.log(
          logService,
          `[SUCCESS] ${entry.service}: PRD values更新完了 → ${rollbackHelmTag}`,
        );
      }
    }

    // MR作成
    const serviceNames = validEntries.map((e) => e.service).join(", ");
    const mrTitle = `[ROLLBACK] Revert ${serviceNames}`;
    const mrDescriptionLines = [
      `## PRD 一括ロールバック`,
      "",
      `| サービス | 現在PRD | ロールバック先 | Helmタグ |`,
      `|---------|--------|-------------|---------|`,
    ];
    for (const entry of validEntries) {
      const rollbackHelmTag = `${PRD_TAG_PREFIX}${entry.targetTag}`;
      mrDescriptionLines.push(
        `| ${entry.service} | ${entry.currentTag} | ${entry.targetTag} | ${rollbackHelmTag} |`,
      );
    }

    this.log(logService, `[INFO] Helm MR作成中...`);

    const existingMrs = await this.api.getMergeRequests(infraProjectId, {
      source_branch: branchName,
      target_branch: "master",
      state: "opened",
    });

    let mrUrl: string;

    if (existingMrs.length > 0) {
      mrUrl = existingMrs[0].web_url;
      this.log(
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
            this.log(
              logService,
              `[WARN] MR作成リトライ (${attempt}): ${err.message}`,
            ),
        },
      );
      mrUrl = mr.web_url;
      this.log(logService, `[SUCCESS] Helm MR作成: !${mr.iid} (${mrUrl})`);
    }

    this.log(logService, `[INFO] 手動マージが必要です: ${mrUrl}`);

    // 全サービス完了通知
    for (const entry of validEntries) {
      const rb = this.rollbacks.get(entry.service);
      if (rb) rb.status = "success";
      this.onMrCreated?.(entry.service, mrUrl);
      this.onRollbackComplete?.(entry.service, "success");
    }

    this.log(
      logService,
      `[SUCCESS] バッチロールバックMR作成完了: ${validEntries.length}件`,
    );

    return mrUrl;
  }

  // --- ユーティリティ ---

  private async recreateBranch(
    service: string,
    projectId: string,
    branchName: string,
  ): Promise<void> {
    if (!branchName.startsWith("rollback-prd/")) {
      throw new Error(
        `ブランチ削除の安全ガード: rollback-prd/ で始まるブランチのみ削除可能です（${branchName}）`,
      );
    }

    try {
      const existingMrs = await this.api.getMergeRequests(projectId, {
        source_branch: branchName,
        state: "opened",
      });
      for (const mr of existingMrs) {
        try {
          await this.api.closeMergeRequest(projectId, mr.iid);
          this.log(service, `[INFO] 既存MRをクローズ: !${mr.iid}`);
        } catch (closeError) {
          this.log(
            service,
            `[WARN] MRクローズ失敗（続行）: !${mr.iid} - ${closeError instanceof Error ? closeError.message : String(closeError)}`,
          );
        }
      }

      await this.api.deleteBranch(projectId, branchName);
      await this.api.createBranch(projectId, branchName, "master");
      this.log(service, `[SUCCESS] ブランチ再作成完了: ${branchName}`);
    } catch (recreateError) {
      throw recreateError;
    }
  }

  private extractTagFromCommitMessage(message: string): string | null {
    // "chore: promote {service} to prd-{tag} (PRD)" パターン
    const promoteMatch = message.match(
      /^(?:chore|feat|fix):\s+promote\s+\S+\s+to\s+prd-(\S+)/,
    );
    if (promoteMatch) return promoteMatch[1];

    // "chore: update {service} to prd-{tag}" パターン
    const updateMatch = message.match(
      /^(?:chore|feat|fix):\s+update\s+\S+\s+to\s+prd-(\S+)/,
    );
    if (updateMatch) return updateMatch[1];

    // "chore: rollback {service} to prd-{tag}" パターン
    const rollbackMatch = message.match(
      /^(?:chore|feat|fix):\s+rollback\s+\S+\s+to\s+prd-(\S+)/,
    );
    if (rollbackMatch) return rollbackMatch[1];

    return null;
  }

  private extractTagFromValues(content: string): string | null {
    const imageBlockMatch = content.match(
      /image:\s*\n(?:\s*(?:repository|pullPolicy|digest):\s*[^\n]*\n){0,5}\s*tag:\s*["']?([^"'\s\n]+)["']?/,
    );
    if (imageBlockMatch) return imageBlockMatch[1];

    const simpleMatch = content.match(/tag:\s*["']?([^"'\s\n]+)["']?/);
    if (simpleMatch) return simpleMatch[1];

    return null;
  }

  private updateTagInValues(content: string, newTag: string): string {
    const updated = content.replace(
      /(image:\s*\n(?:\s*(?:repository|pullPolicy|digest):\s*[^\n]*\n){0,5}\s*tag:\s*["']?)([^"'\s\n]+)(["']?)/,
      `$1${newTag}$3`,
    );

    if (updated !== content) return updated;

    return content.replace(
      /(tag:\s*["']?)([^"'\s\n]+)(["']?)/,
      `$1${newTag}$3`,
    );
  }
}
