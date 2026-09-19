import { type ServiceConfig, type ServiceDefinition } from "../api/gitlab";
import { CONFIG } from "../config";
import { VersionInputManager } from "./version-input-manager";

export interface ServiceTableDeps {
  servicesTbody: HTMLElement;
  activeServices: Set<string>;
  onSelectService: (serviceName: string) => void;
  onSelectionChange?: (count: number) => void;
  versionInputManager: VersionInputManager;
}

/**
 * サービステーブル管理クラス
 * 責務: サービス行の作成・レンダリング・状態更新
 */
export class ServiceTableManager {
  private selectedServices = new Set<string>();

  constructor(private deps: ServiceTableDeps) {}

  /**
   * サービス行をレンダリング
   */
  async renderServiceRows(serviceConfig: ServiceConfig): Promise<void> {
    this.deps.servicesTbody.innerHTML = "";

    const services = Object.keys(serviceConfig.services);

    for (const serviceName of services) {
      const svcConfig = serviceConfig.services[serviceName];
      const row = this.createServiceRow(serviceName, svcConfig);
      this.deps.servicesTbody.appendChild(row);

      this.deps.versionInputManager.fetchCurrentVersion(serviceName, svcConfig);
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
      <td class="text-center" style="width: 40px;">
        <input type="checkbox" class="checkbox checkbox-xs checkbox-primary" id="select-${serviceName}" />
      </td>
      <td class="text-center clickable-cell" style="width: 40px;">
        <span class="status-indicator status-idle" id="status-${serviceName}">
          <i class="fas fa-circle text-[10px]"></i>
        </span>
      </td>
      <td class="clickable-cell">
        <div class="service-name-row">
          <a href="${CONFIG.GITLAB.BASE_URL}/${svcConfig.app_repo}" target="_blank" rel="noopener" class="font-semibold text-sm link link-hover">${serviceName}</a>
          <span class="branch-ahead-indicator" id="branch-ahead-${serviceName}" style="display: none;" title="mainがreleaseより先行">
            <i class="fas fa-code-branch"></i>
            <span class="ahead-count"></span>
          </span>
        </div>
        <div class="deploy-info" id="deploy-info-${serviceName}"></div>
      </td>
      <td class="clickable-cell text-center" style="display: none;">
        <span class="deploy-status-badge" id="deploy-status-${serviceName}">
          <span class="badge badge-ghost badge-sm">-</span>
        </span>
      </td>
      <td class="text-right">
        <div class="version-input-group justify-end">
          <span class="badge badge-ghost badge-sm font-mono" id="current-ver-${serviceName}">...</span>
          <span class="separator">→ v3.</span>
          <label for="version-minor-${serviceName}" class="sr-only">マイナーバージョン</label>
          <input type="number" class="input input-bordered input-xs w-14 text-center font-mono"
                 id="version-minor-${serviceName}"
                 aria-label="マイナーバージョン (${serviceName})"
                 min="0" value="0">
          <span class="separator">.</span>
          <label for="version-build-${serviceName}" class="sr-only">ビルド番号</label>
          <input type="number" class="input input-bordered input-xs w-14 text-center font-mono"
                 id="version-build-${serviceName}"
                 aria-label="ビルド番号 (${serviceName})"
                 min="0" value="0">
        </div>
      </td>
    `;

    const clickableCells = tr.querySelectorAll(".clickable-cell");
    clickableCells.forEach((cell) => {
      cell.addEventListener("click", () => {
        if (this.deps.activeServices.has(serviceName)) {
          this.deps.onSelectService(serviceName);
        }
      });
    });

    const checkbox = tr.querySelector(
      `#select-${serviceName}`,
    ) as HTMLInputElement;

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        this.selectedServices.add(serviceName);
      } else {
        this.selectedServices.delete(serviceName);
      }
      this.updateSelectAllState();
      this.deps.onSelectionChange?.(this.selectedServices.size);
    });

    return tr;
  }

  /**
   * 全選択チェックボックスの状態を同期
   */
  private updateSelectAllState(): void {
    const selectAll = document.getElementById(
      "select-all-checkbox",
    ) as HTMLInputElement;
    if (!selectAll) return;

    const allCheckboxes =
      this.deps.servicesTbody.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"][id^="select-"]',
      );
    const total = allCheckboxes.length;
    const checked = this.selectedServices.size;

    selectAll.checked = total > 0 && checked === total;
    selectAll.indeterminate = checked > 0 && checked < total;
  }

  /**
   * 全選択/全解除
   */
  setSelectAll(checked: boolean): void {
    const allCheckboxes =
      this.deps.servicesTbody.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"][id^="select-"]',
      );
    allCheckboxes.forEach((cb) => {
      // 処理中のサービスはスキップ
      const serviceName = cb.id.replace("select-", "");
      if (this.deps.activeServices.has(serviceName)) return;

      cb.checked = checked;
      if (checked) {
        this.selectedServices.add(serviceName);
      } else {
        this.selectedServices.delete(serviceName);
      }
    });
    this.deps.onSelectionChange?.(this.selectedServices.size);
  }

  /**
   * 選択中サービスとバージョン入力値のMapを取得
   */
  getSelectedServiceTags(): Map<string, string> {
    const result = new Map<string, string>();
    for (const serviceName of this.selectedServices) {
      const minorInput = document.getElementById(
        `version-minor-${serviceName}`,
      ) as HTMLInputElement;
      const buildInput = document.getElementById(
        `version-build-${serviceName}`,
      ) as HTMLInputElement;
      if (!minorInput) continue;

      const minor = minorInput.value.trim();
      const build = buildInput?.value.trim() || "0";
      if (!minor) continue;

      result.set(serviceName, `v3.${minor}.${build}`);
    }
    return result;
  }

  /**
   * 選択数を取得
   */
  getSelectedCount(): number {
    return this.selectedServices.size;
  }

  /**
   * 選択中サービス名の配列を取得
   */
  getSelectedServices(): string[] {
    return Array.from(this.selectedServices);
  }

  /**
   * タブに応じてサービス行をフィルタリング
   */
  filterServicesByTab(tabName: string): void {
    const rows = this.deps.servicesTbody.querySelectorAll(".service-row");
    rows.forEach((row) => {
      const serviceName = row.id.replace("service-row-", "");
      if (tabName === "all") {
        (row as HTMLElement).style.display = "";
      } else if (tabName === "app") {
        (row as HTMLElement).style.display = serviceName.startsWith("infra-")
          ? "none"
          : "";
      } else if (tabName === "infra") {
        (row as HTMLElement).style.display = serviceName.startsWith("infra-")
          ? ""
          : "none";
      }
    });
  }

  /**
   * デプロイ中状態を設定
   */
  setRowDeploying(serviceName: string, isDeploying: boolean): void {
    const checkbox = document.getElementById(
      `select-${serviceName}`,
    ) as HTMLInputElement;
    const statusIcon = document.getElementById(`status-${serviceName}`);

    if (isDeploying) {
      if (checkbox) checkbox.disabled = true;
      if (statusIcon) {
        statusIcon.innerHTML =
          '<i class="fas fa-spinner fa-spin text-primary" title="実行中"></i>';
      }
      this.updateDeployStatus(serviceName, "running");
    } else {
      if (checkbox) checkbox.disabled = false;
      if (statusIcon) {
        statusIcon.innerHTML =
          '<i class="fas fa-circle text-secondary" title="アイドル"></i>';
      }
      this.updateDeployStatus(serviceName, "idle");
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
      `select-${serviceName}`,
    ) as HTMLInputElement;

    if (checkbox) checkbox.disabled = false;

    const iconMap = {
      success: '<i class="fas fa-sun text-success" title="成功"></i>',
      failed: '<i class="fas fa-cloud-rain text-danger" title="失敗"></i>',
      idle: '<i class="fas fa-circle text-secondary" title="アイドル"></i>',
    };

    if (statusIcon) {
      statusIcon.innerHTML = iconMap[status] || iconMap.idle;
    }

    this.updateDeployStatus(serviceName, status);
  }

  /**
   * デプロイステータスバッジを更新
   */
  updateDeployStatus(
    serviceName: string,
    status: "idle" | "running" | "waiting" | "success" | "failed",
    stepInfo?: string,
  ): void {
    const badge = document.getElementById(`deploy-status-${serviceName}`);
    if (!badge) return;

    const badgeMap: Record<string, { class: string; text: string }> = {
      idle: { class: "badge-ghost", text: "-" },
      running: { class: "badge-primary", text: stepInfo || "リリース中" },
      waiting: { class: "badge-warning", text: stepInfo || "待機中" },
      success: { class: "badge-success", text: "完了" },
      failed: { class: "badge-error", text: "失敗" },
    };

    const config = badgeMap[status] || badgeMap.idle;
    badge.innerHTML = `<span class="badge ${config.class}">${config.text}</span>`;
  }
}
