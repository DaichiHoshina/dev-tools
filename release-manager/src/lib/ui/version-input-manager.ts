import { ReleaseManagerAPI, type ServiceDefinition } from "../api/gitlab";

/**
 * 木曜16時（JST）を起点としたマイナーバージョンを計算
 * 基準: 2026-01-29 16:00 JST = v3.23
 */
export function calculateDefaultMinorVersion(): number {
  const BASE_DATE = new Date("2026-01-29T16:00:00+09:00"); // 木曜16時 JST
  const BASE_MINOR = 23;

  const now = new Date();
  const diffMs = now.getTime() - BASE_DATE.getTime();
  const weeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));

  return BASE_MINOR + Math.max(0, weeks);
}

/**
 * バージョン入力管理クラス
 * 責務: バージョン入力フィールドの更新、タグプレビュー表示
 */
export class VersionInputManager {
  constructor(private api: ReleaseManagerAPI) {}

  /**
   * 現在のバージョンを取得して入力欄に設定
   * @param serviceName サービス名
   * @param svcConfig サービス設定
   */
  async fetchCurrentVersion(
    serviceName: string,
    svcConfig: ServiceDefinition,
  ): Promise<void> {
    const badge = document.getElementById(`current-ver-${serviceName}`);
    const minorInput = document.getElementById(
      `version-minor-${serviceName}`,
    ) as HTMLInputElement;
    const buildInput = document.getElementById(
      `version-build-${serviceName}`,
    ) as HTMLInputElement;
    if (!badge) return;

    try {
      const tag = await this.api.getLatestTag(svcConfig.app_repo, "v");
      if (tag) {
        badge.textContent = tag;
        badge.className = "badge badge-info badge-sm font-mono";
        badge.style.display = "";
      } else {
        badge.style.display = "none";
      }

      // 木曜16時ベースでマイナーバージョンを計算し、ビルド番号は現在のタグから+1
      if (minorInput && buildInput) {
        const defaultMinor = calculateDefaultMinorVersion();
        minorInput.value = String(defaultMinor);

        // 現在のタグからビルド番号を取得して+1（同じminorの場合）
        if (tag) {
          const match = tag.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
          if (match) {
            const currentMinor = parseInt(match[2], 10);
            const currentBuild = parseInt(match[3], 10);
            if (currentMinor === defaultMinor) {
              buildInput.value = String(currentBuild + 1);
            } else {
              buildInput.value = "0";
            }
          } else {
            buildInput.value = "0";
          }
        } else {
          buildInput.value = "0";
        }
      }
    } catch {
      badge.textContent = "エラー";
      badge.className = "badge badge-error";
    }
  }

  /**
   * 自動バージョンを取得（未使用）
   * @param serviceName サービス名
   * @returns バージョン文字列 or null
   */
  private getAutoVersion(serviceName: string): string | null {
    const minorInput = document.getElementById(
      `version-minor-${serviceName}`,
    ) as HTMLInputElement | null;
    const buildInput = document.getElementById(
      `version-build-${serviceName}`,
    ) as HTMLInputElement | null;

    if (!minorInput) return null;

    const minor = minorInput.value.trim();
    const build = buildInput?.value.trim() || "0";

    return minor ? `3.${minor}.${build}` : null;
  }
}
