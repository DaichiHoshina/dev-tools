/**
 * PRDロールバック サービステーブル管理
 * チェックボックス選択・現在PRDバージョン・ロールバック先ドロップダウンを管理
 */

import type { ServiceConfig, ServiceDefinition } from "../api/gitlab";
import type { VersionHistoryEntry } from "../rollback-config";
import { CONFIG } from "../config";

export interface RollbackServiceTableDeps {
  servicesTbody: HTMLElement;
  activeServices: Set<string>;
  onSelectService: (serviceName: string) => void;
  onCheckChange: () => void;
}

export class RollbackServiceTableManager {
  constructor(private deps: RollbackServiceTableDeps) {}

  async renderServiceRows(serviceConfig: ServiceConfig): Promise<void> {
    this.deps.servicesTbody.innerHTML = "";

    for (const serviceName of Object.keys(serviceConfig.services)) {
      const svcConfig = serviceConfig.services[serviceName];
      const row = this.createServiceRow(serviceName, svcConfig);
      this.deps.servicesTbody.appendChild(row);
    }
  }

  createServiceRow(
    serviceName: string,
    svcConfig: ServiceDefinition,
  ): HTMLTableRowElement {
    const tr = document.createElement("tr");
    tr.id = `rb-service-row-${serviceName}`;
    tr.className = "service-row";
    tr.innerHTML = `
      <td class="text-center">
        <label class="cursor-pointer">
          <input type="checkbox" class="checkbox checkbox-xs rb-service-check" data-service="${serviceName}" />
        </label>
      </td>
      <td class="text-center clickable-cell">
        <span class="status-indicator status-idle" id="rb-status-${serviceName}">
          <i class="fas fa-circle text-[10px]"></i>
        </span>
      </td>
      <td class="clickable-cell">
        <a href="${CONFIG.GITLAB.BASE_URL}/${svcConfig.app_repo}" target="_blank" rel="noopener" class="font-semibold text-sm link link-hover">${serviceName}</a>
        <div class="deploy-info" id="rb-deploy-info-${serviceName}"></div>
      </td>
      <td class="text-center clickable-cell">
        <span class="badge badge-ghost badge-sm font-mono" id="rb-prd-version-${serviceName}">...</span>
      </td>
      <td class="clickable-cell">
        <select id="rb-target-${serviceName}" class="select select-bordered select-sm w-full font-mono text-xs" disabled>
          <option value="">読み込み中...</option>
        </select>
      </td>
    `;

    // チェックボックス
    const checkbox = tr.querySelector(".rb-service-check") as HTMLInputElement;
    checkbox.addEventListener("change", () => {
      this.deps.onCheckChange();
    });

    // クリック可能セル
    const clickableCells = tr.querySelectorAll(".clickable-cell");
    clickableCells.forEach((cell) => {
      cell.addEventListener("click", () => {
        if (this.deps.activeServices.has(serviceName)) {
          this.deps.onSelectService(serviceName);
        }
      });
    });

    return tr;
  }

  /**
   * 現在のPRDバージョンを更新
   */
  updatePrdVersion(service: string, prdTag: string): void {
    const prdEl = document.getElementById(`rb-prd-version-${service}`);
    if (prdEl) prdEl.textContent = prdTag;
  }

  /**
   * バージョン履歴をドロップダウンにセット
   */
  updateVersionHistory(
    service: string,
    currentTag: string,
    history: VersionHistoryEntry[],
  ): void {
    const select = document.getElementById(
      `rb-target-${service}`,
    ) as HTMLSelectElement;
    if (!select) return;

    select.innerHTML = "";

    // 現在のバージョンを除外した履歴
    const filteredHistory = history.filter((entry) => entry.tag !== currentTag);

    if (filteredHistory.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "履歴なし";
      select.appendChild(opt);
      select.disabled = true;
      return;
    }

    for (const entry of filteredHistory) {
      const opt = document.createElement("option");
      opt.value = entry.tag;
      const date = new Date(entry.date).toLocaleDateString("ja-JP", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      opt.textContent = `${entry.tag} (${date})`;
      select.appendChild(opt);
    }

    // 直前のタグを自動選択
    select.value = filteredHistory[0].tag;
    select.disabled = false;
  }

  /**
   * チェック済みサービスとターゲットタグのMapを返す
   */
  getCheckedServiceTags(): Map<string, string> {
    const result = new Map<string, string>();
    const checkboxes = this.deps.servicesTbody.querySelectorAll(
      ".rb-service-check:checked",
    ) as NodeListOf<HTMLInputElement>;

    for (const cb of checkboxes) {
      const service = cb.dataset.service!;
      const select = document.getElementById(
        `rb-target-${service}`,
      ) as HTMLSelectElement;
      if (select?.value) {
        result.set(service, select.value);
      }
    }

    return result;
  }

  /**
   * チェック済み件数（ターゲットバージョン選択済みのもののみ）
   */
  getCheckedCount(): number {
    return this.getCheckedServiceTags().size;
  }

  /**
   * 全チェックボックスをセット
   */
  setAllChecked(checked: boolean): void {
    const checkboxes = this.deps.servicesTbody.querySelectorAll(
      ".rb-service-check",
    ) as NodeListOf<HTMLInputElement>;
    checkboxes.forEach((cb) => {
      cb.checked = checked;
    });
    this.deps.onCheckChange();
  }

  /**
   * 行のロールバック中状態を設定
   */
  setRowRollingBack(serviceName: string, isRollingBack: boolean): void {
    const statusIcon = document.getElementById(`rb-status-${serviceName}`);
    const targetSelect = document.getElementById(
      `rb-target-${serviceName}`,
    ) as HTMLSelectElement;
    const checkbox = this.deps.servicesTbody.querySelector(
      `.rb-service-check[data-service="${serviceName}"]`,
    ) as HTMLInputElement;

    if (isRollingBack) {
      if (targetSelect) targetSelect.disabled = true;
      if (checkbox) checkbox.disabled = true;
      if (statusIcon) {
        statusIcon.innerHTML =
          '<i class="fas fa-spinner fa-spin text-warning" title="ロールバック中"></i>';
      }
    } else {
      if (targetSelect) targetSelect.disabled = false;
      if (checkbox) checkbox.disabled = false;
      if (statusIcon) {
        statusIcon.innerHTML =
          '<i class="fas fa-circle text-secondary" title="アイドル"></i>';
      }
    }
  }

  /**
   * 行のステータスを設定
   */
  setRowStatus(
    serviceName: string,
    status: "success" | "failed" | "idle",
  ): void {
    const statusIcon = document.getElementById(`rb-status-${serviceName}`);
    const targetSelect = document.getElementById(
      `rb-target-${serviceName}`,
    ) as HTMLSelectElement;
    const checkbox = this.deps.servicesTbody.querySelector(
      `.rb-service-check[data-service="${serviceName}"]`,
    ) as HTMLInputElement;

    if (targetSelect) targetSelect.disabled = false;
    if (checkbox) checkbox.disabled = false;

    const iconMap = {
      success: '<i class="fas fa-sun text-success" title="成功"></i>',
      failed: '<i class="fas fa-cloud-rain text-danger" title="失敗"></i>',
      idle: '<i class="fas fa-circle text-secondary" title="アイドル"></i>',
    };

    if (statusIcon) {
      statusIcon.innerHTML = iconMap[status] || iconMap.idle;
    }
  }
}
