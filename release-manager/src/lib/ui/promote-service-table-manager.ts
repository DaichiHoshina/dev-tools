/**
 * PRD MR作成 サービステーブル管理
 * チェックボックス選択・TESタグ入力・差分バッジを管理
 */

import type { ServiceConfig, ServiceDefinition } from "../api/gitlab";
import { CONFIG } from "../config";
import { escHtml } from "../utils/html";

export interface PromoteServiceTableDeps {
  servicesTbody: HTMLElement;
  activeServices: Set<string>;
  onSelectService: (serviceName: string) => void;
  onCheckChange: () => void;
}

export class PromoteServiceTableManager {
  constructor(private deps: PromoteServiceTableDeps) {}

  /**
   * サービス行をレンダリング
   */
  async renderServiceRows(serviceConfig: ServiceConfig): Promise<void> {
    this.deps.servicesTbody.innerHTML = "";

    for (const serviceName of Object.keys(serviceConfig.services)) {
      const svcConfig = serviceConfig.services[serviceName];
      const row = this.createServiceRow(serviceName, svcConfig);
      this.deps.servicesTbody.appendChild(row);
    }
  }

  /**
   * サービス行を作成
   */
  createServiceRow(
    serviceName: string,
    svcConfig: ServiceDefinition,
  ): HTMLTableRowElement {
    const tr = document.createElement("tr");
    tr.id = `service-row-${serviceName}`;
    tr.className = "service-row";
    tr.innerHTML = `
      <td class="text-center">
        <label class="cursor-pointer">
          <input type="checkbox" class="checkbox checkbox-xs service-check" id="check-${serviceName}" />
        </label>
      </td>
      <td class="text-center clickable-cell">
        <span class="status-indicator status-idle" id="status-${serviceName}">
          <i class="fas fa-circle text-[10px]"></i>
        </span>
      </td>
      <td class="clickable-cell">
        <a href="${escHtml(CONFIG.GITLAB.BASE_URL + "/" + svcConfig.app_repo)}" target="_blank" rel="noopener" class="font-semibold text-sm link link-hover">${escHtml(serviceName)}</a>
        <div class="deploy-info" id="deploy-info-${serviceName}"></div>
      </td>
      <td class="text-center">
        <input type="text" class="input input-bordered input-xs w-28 text-center font-mono" id="tes-version-${serviceName}" value="" placeholder="..." />
      </td>
      <td class="text-center clickable-cell">
        <span class="badge badge-ghost badge-sm font-mono" id="prd-version-${serviceName}">...</span>
      </td>
      <td class="text-center clickable-cell">
        <span id="diff-badge-${serviceName}" class="badge badge-outline badge-sm">-</span>
      </td>
    `;

    // クリック可能セル
    const clickableCells = tr.querySelectorAll(".clickable-cell");
    clickableCells.forEach((cell) => {
      cell.addEventListener("click", () => {
        if (this.deps.activeServices.has(serviceName)) {
          this.deps.onSelectService(serviceName);
        }
      });
    });

    // チェックボックス変更
    const checkbox = tr.querySelector(
      `#check-${serviceName}`,
    ) as HTMLInputElement;
    checkbox.addEventListener("change", () => {
      this.deps.onCheckChange();
    });

    return tr;
  }

  /**
   * TES/PRDバージョンを更新
   */
  updateVersions(service: string, tesTag: string, prdTag: string): void {
    const tesEl = document.getElementById(
      `tes-version-${service}`,
    ) as HTMLInputElement | null;
    const prdEl = document.getElementById(`prd-version-${service}`);

    if (tesEl) tesEl.value = tesTag;
    if (prdEl) prdEl.textContent = prdTag;

    this.updateDiffBadge(service, tesTag, prdTag);
  }

  /**
   * 入力されたTESタグを取得
   */
  getInputTag(service: string): string {
    const input = document.getElementById(
      `tes-version-${service}`,
    ) as HTMLInputElement | null;
    return input?.value.trim() || "";
  }

  /**
   * チェック済みサービスとそのタグを取得
   */
  getCheckedServiceTags(): Map<string, string> {
    const result = new Map<string, string>();
    const checkboxes = this.deps.servicesTbody.querySelectorAll(
      ".service-check:checked",
    );
    for (const cb of checkboxes) {
      const id = (cb as HTMLInputElement).id; // check-{name}
      const serviceName = id.replace("check-", "");
      const tag = this.getInputTag(serviceName);
      if (tag) result.set(serviceName, tag);
    }
    return result;
  }

  /**
   * チェック済みサービス数を取得
   */
  getCheckedCount(): number {
    return this.deps.servicesTbody.querySelectorAll(".service-check:checked")
      .length;
  }

  /**
   * 全選択/全解除
   */
  setAllChecked(checked: boolean): void {
    const checkboxes = this.deps.servicesTbody.querySelectorAll(
      ".service-check:not(:disabled)",
    );
    checkboxes.forEach((cb) => {
      (cb as HTMLInputElement).checked = checked;
    });
    this.deps.onCheckChange();
  }

  /**
   * 差分バッジ更新
   */
  updateDiffBadge(service: string, tesTag: string, prdTag: string): void {
    const badge = document.getElementById(`diff-badge-${service}`);
    const checkbox = document.getElementById(
      `check-${service}`,
    ) as HTMLInputElement;
    const row = document.getElementById(`service-row-${service}`);

    if (!badge) return;

    const hasDiff = tesTag !== prdTag && tesTag !== "-" && prdTag !== "-";

    if (hasDiff) {
      badge.textContent = "差分あり";
      badge.className = "badge badge-warning badge-sm whitespace-nowrap";
      row?.classList.add("branch-ahead-row");
      if (checkbox) {
        checkbox.disabled = false;
        checkbox.checked = true;
      }
    } else {
      badge.textContent = tesTag === prdTag ? "同一" : "-";
      badge.className = "badge badge-ghost badge-sm";
      row?.classList.remove("branch-ahead-row");
      if (checkbox) {
        checkbox.disabled = false;
        checkbox.checked = false;
      }
    }

    this.deps.onCheckChange();
  }

  /**
   * MR作成中状態を設定
   */
  setRowPromoting(serviceName: string, isPromoting: boolean): void {
    const statusIcon = document.getElementById(`status-${serviceName}`);
    const checkbox = document.getElementById(
      `check-${serviceName}`,
    ) as HTMLInputElement;

    if (isPromoting) {
      if (checkbox) checkbox.disabled = true;
      if (statusIcon) {
        statusIcon.innerHTML =
          '<i class="fas fa-spinner fa-spin text-primary" title="MR作成中"></i>';
      }
    } else {
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
    const statusIcon = document.getElementById(`status-${serviceName}`);
    const checkbox = document.getElementById(
      `check-${serviceName}`,
    ) as HTMLInputElement;

    if (checkbox) checkbox.disabled = status !== "idle";

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
