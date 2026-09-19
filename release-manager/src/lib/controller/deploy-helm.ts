/**
 * Helm values更新ハンドラー
 */

import { ReleaseManagerAPI } from "../api/gitlab";
import { DeployStateManager } from "./deploy-state";

export class DeployHelmHandler {
  constructor(
    public api: ReleaseManagerAPI,
    public stateManager: DeployStateManager,
  ) {}

  /**
   * Helm values.yamlのタグを更新
   */
  async updateHelmValues(
    projectPath: string,
    filePath: string,
    branch: string,
    tagName: string,
    service: string,
  ): Promise<void> {
    const helmTag = `prd-${tagName}`;

    const currentContent = await this.api.getFile(
      projectPath,
      filePath,
      branch,
    );

    // 形式1: image:\n  tag: "prd-v1.2.3" (image直下、最大5行以内にtag)
    const updatedContent = currentContent.replace(
      /(image:\s*\n(?:\s*(?:repository|pullPolicy|digest):\s*[^\n]*\n){0,5}\s*tag:\s*["']?)([^"'\s\n]+)(["']?)/,
      `$1${helmTag}$3`,
    );

    if (updatedContent === currentContent) {
      // 形式2: tag: "prd-v1.2.3" が直接ある場合
      const altUpdatedContent = currentContent.replace(
        /(tag:\s*["']?)([^"'\s\n]+)(["']?)/,
        `$1${helmTag}$3`,
      );

      if (altUpdatedContent !== currentContent) {
        this.stateManager.log(
          service,
          `[INFO] フォールバックパターンでtag更新`,
        );
        await this.api.updateFile(
          projectPath,
          filePath,
          branch,
          altUpdatedContent,
          `chore: update ${service} to ${helmTag}`,
        );
        return;
      }

      throw new Error(
        `values.yamlのtag形式が見つかりません（${filePath}）。手動でtag値を更新してください。`,
      );
    }

    await this.api.updateFile(
      projectPath,
      filePath,
      branch,
      updatedContent,
      `chore: update ${service} to ${helmTag}`,
    );
  }
}
