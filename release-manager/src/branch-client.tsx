import "./styles/globals.css";
import { ReleaseManagerAPI, type ServiceConfig } from "./lib/api/gitlab";
import { AlertManager } from "./lib/ui/alert-manager";
import { DialogManager } from "./lib/ui/dialog-manager";
import { render } from "hono/jsx/dom";
import { ThemeToggle } from "./components/ThemeToggle";

console.log("Release Manager Branch Creator v1.0.0");

/** デフォルトでONにする主要サービス（release-config.yaml のサービスキーに合わせて変更） */
const DEFAULT_SELECTED_SERVICES = new Set([
  "api-server",
  "web-frontend",
  "worker",
]);

interface BranchResult {
  service: string;
  status: "success" | "error" | "skipped";
  message: string;
  url?: string;
}

class BranchUI {
  private api: ReleaseManagerAPI;
  private alertManager: AlertManager;
  private dialogManager: DialogManager;
  private serviceConfig: ServiceConfig | null = null;

  // DOM要素
  private branchNameInput!: HTMLInputElement;
  private servicesList!: HTMLElement;
  private selectAllCheckbox!: HTMLInputElement;
  private createBtn!: HTMLButtonElement;
  private resultsContainer!: HTMLElement;
  private resultsList!: HTMLElement;

  constructor() {
    this.api = new ReleaseManagerAPI();
    this.alertManager = new AlertManager();
    this.dialogManager = new DialogManager();

    this.initElements();
    this.dialogManager.init();
    this.checkAuthentication();
    this.loadServices();
  }

  private initElements(): void {
    this.branchNameInput = document.getElementById(
      "branch-name-input",
    ) as HTMLInputElement;
    this.servicesList = document.getElementById("services-list")!;
    this.selectAllCheckbox = document.getElementById(
      "select-all-checkbox",
    ) as HTMLInputElement;
    this.createBtn = document.getElementById(
      "create-branches-btn",
    ) as HTMLButtonElement;
    this.resultsContainer = document.getElementById("results-container")!;
    this.resultsList = document.getElementById("results-list")!;

    // ブランチ名入力でボタン有効化
    this.branchNameInput.addEventListener("input", () =>
      this.updateCreateButton(),
    );

    // 全選択チェックボックス
    this.selectAllCheckbox.addEventListener("change", () => {
      const checkboxes = this.servicesList.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"]',
      );
      checkboxes.forEach((cb) => (cb.checked = this.selectAllCheckbox.checked));
      this.updateSelectedCount();
      this.updateCreateButton();
    });

    // 作成ボタン
    this.createBtn.addEventListener("click", () => this.handleCreateBranches());
  }

  private checkAuthentication(): void {
    if (!this.api.hasToken()) {
      this.alertManager.showAlert(
        "GitLabトークンが設定されていません。",
        "warning",
      );
    }
  }

  private async loadServices(): Promise<void> {
    try {
      this.serviceConfig = await this.api.getServiceConfig();
      if (this.serviceConfig) {
        this.renderServiceList(this.serviceConfig);
        this.fetchLatestReleaseBranches();
      }
    } catch (error) {
      console.error("Failed to load services:", error);
      this.alertManager.showAlert(
        "サービス一覧の読み込みに失敗しました。",
        "danger",
      );
    }
  }

  private renderServiceList(config: ServiceConfig): void {
    this.servicesList.innerHTML = "";

    const entries = Object.entries(config.services);
    const sorted = entries.sort(([a], [b]) => {
      const aDefault = DEFAULT_SELECTED_SERVICES.has(a) ? 0 : 1;
      const bDefault = DEFAULT_SELECTED_SERVICES.has(b) ? 0 : 1;
      return aDefault - bDefault;
    });

    for (const [serviceName] of sorted) {
      const isDefault = DEFAULT_SELECTED_SERVICES.has(serviceName);

      const row = document.createElement("div");
      row.className =
        "py-1.5 px-1 rounded-md hover:bg-base-content/5 transition-colors";
      row.id = `branch-row-${serviceName}`;

      row.innerHTML = `
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-2 cursor-pointer shrink-0">
            <input
              type="checkbox"
              class="checkbox checkbox-xs checkbox-primary service-checkbox"
              data-service="${serviceName}"
              ${isDefault ? "checked" : ""}
            />
            <span class="text-[13px]">${serviceName}</span>
          </label>
          <span id="branch-latest-${serviceName}" class="text-[11px] text-base-content/30 ml-auto flex gap-1 flex-wrap justify-end"></span>
        </div>
      `;

      const checkbox = row.querySelector("input")!;
      checkbox.addEventListener("change", () => {
        this.updateSelectAllState();
        this.updateSelectedCount();
        this.updateCreateButton();
      });

      this.servicesList.appendChild(row);
    }

    this.updateSelectAllState();
    this.updateSelectedCount();
    this.updateCreateButton();
  }

  /** 各リポジトリの release-* ブランチを作成日順で最新4件表示 */
  private async fetchLatestReleaseBranches(): Promise<void> {
    if (!this.serviceConfig) return;

    const MAX_DISPLAY = 4;
    const entries = Object.entries(this.serviceConfig.services);
    const promises = entries.map(async ([serviceName, svcConfig]) => {
      const el = document.getElementById(`branch-latest-${serviceName}`);
      if (!el) return;

      const projectId = `${svcConfig.app_repo}`;
      try {
        const branches = await this.api.searchBranches(projectId, "release");
        const releaseBranches = branches
          .filter((b) => /^release[\-\/]/.test(b.name))
          .sort(
            (a, b) =>
              new Date(b.commit.created_at).getTime() -
              new Date(a.commit.created_at).getTime(),
          )
          .slice(0, MAX_DISPLAY);

        if (releaseBranches.length > 0) {
          el.innerHTML = releaseBranches
            .map(
              (b) =>
                `<a href="${this.escHtml(b.web_url)}" target="_blank" rel="noopener"
                  onclick="event.stopPropagation()"
                  class="badge badge-xs ${b.merged ? "badge-ghost line-through opacity-50" : "badge-primary badge-outline"} gap-0.5 cursor-pointer hover:opacity-80"
                  title="${this.escHtml(b.name)}${b.merged ? " (merged)" : ""}"
                ><i class="fa-solid fa-code-branch text-[7px]"></i>${this.escHtml(b.name)}</a>`,
            )
            .join("");
        }
      } catch {
        // 取得失敗は無視
      }
    });

    await Promise.allSettled(promises);
  }

  private getSelectedServices(): string[] {
    const checkboxes = this.servicesList.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]:checked',
    );
    return Array.from(checkboxes).map((cb) => cb.dataset.service!);
  }

  private updateSelectAllState(): void {
    const checkboxes = this.servicesList.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    const checked = this.servicesList.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]:checked',
    );
    this.selectAllCheckbox.checked = checked.length === checkboxes.length;
    this.selectAllCheckbox.indeterminate =
      checked.length > 0 && checked.length < checkboxes.length;
  }

  private updateSelectedCount(): void {
    const el = document.getElementById("selected-count");
    if (!el) return;
    const total = this.servicesList.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    ).length;
    const selected = this.getSelectedServices().length;
    el.textContent = `${selected} / ${total}`;
  }

  private updateCreateButton(): void {
    const branchName = this.branchNameInput.value.trim();
    const selected = this.getSelectedServices();
    this.createBtn.disabled = !branchName || selected.length === 0;
  }

  private async handleCreateBranches(): Promise<void> {
    const branchName = this.branchNameInput.value.trim();
    const selectedServices = this.getSelectedServices();

    if (!branchName || selectedServices.length === 0) return;

    // MR同時作成の確認ダイアログ
    const createMRs = await this.dialogManager.showConfirmDialog(
      "MR作成確認",
      `mainに向けたMRも同時に作成しますか？`,
    );

    // ボタンを無効化
    this.createBtn.disabled = true;
    this.createBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 作成中...`;

    // 結果エリアを表示
    this.resultsContainer.style.display = "block";
    this.resultsList.innerHTML = "";

    const results: BranchResult[] = [];
    const successfulServices: string[] = [];

    try {
      // 並列でブランチ作成
      const promises = selectedServices.map(async (serviceName) => {
        const svcConfig = this.serviceConfig?.services[serviceName];
        if (!svcConfig) {
          results.push({
            service: serviceName,
            status: "error",
            message: "サービス設定が見つかりません",
          });
          return;
        }

        const projectId = `${svcConfig.app_repo}`;

        try {
          const branch = await this.api.createBranch(
            projectId,
            branchName,
            "main",
          );
          results.push({
            service: serviceName,
            status: "success",
            message: "ブランチ作成成功",
            url: branch.web_url,
          });
          successfulServices.push(serviceName);
        } catch (error) {
          const msg = error instanceof Error ? error.message : "不明なエラー";
          results.push({
            service: serviceName,
            status: "error",
            message: msg,
          });
        }
      });

      await Promise.allSettled(promises);

      // MR同時作成がYesで、成功したサービスがある場合
      if (createMRs && successfulServices.length > 0) {
        this.createBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> MR作成中...`;

        const mrTitle = `[Release] ${branchName} → main`;
        const mrPromises = successfulServices.map(async (serviceName) => {
          const svcConfig = this.serviceConfig?.services[serviceName];
          if (!svcConfig) return;

          const projectId = `${svcConfig.app_repo}`;

          try {
            const mr = await this.api.createMergeRequest(
              projectId,
              branchName,
              "main",
              mrTitle,
            );
            // ブランチ作成の結果をMR結果で上書き
            const idx = results.findIndex((r) => r.service === serviceName);
            if (idx !== -1) {
              results[idx] = {
                service: serviceName,
                status: "success",
                message: "ブランチ + MR作成成功",
                url: mr.web_url,
              };
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : "不明なエラー";
            const idx = results.findIndex((r) => r.service === serviceName);
            if (idx !== -1) {
              results[idx] = {
                service: serviceName,
                status: "error",
                message: `ブランチ作成成功 / MR作成失敗: ${msg}`,
              };
            }
          }
        });

        await Promise.allSettled(mrPromises);
      }

      // 結果をサービス名順にソートして表示
      results.sort((a, b) => a.service.localeCompare(b.service));
      this.renderResults(results);

      // 成功件数をアラート
      const successCount = results.filter((r) => r.status === "success").length;
      const errorCount = results.filter((r) => r.status === "error").length;

      if (errorCount === 0) {
        const suffix = createMRs ? "ブランチ + MR" : "ブランチ";
        this.alertManager.showAlert(
          `${successCount}件の${suffix}を作成しました`,
          "success",
        );
      } else {
        this.alertManager.showAlert(
          `成功: ${successCount}件 / 失敗: ${errorCount}件`,
          "warning",
        );
      }
    } finally {
      this.createBtn.innerHTML = `<i class="fa-solid fa-code-branch text-xs"></i> ブランチ作成`;
      this.updateCreateButton();
      // ブランチバッジを再取得して表示を更新
      this.fetchLatestReleaseBranches();
    }
  }

  private escHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  private renderResults(results: BranchResult[]): void {
    this.resultsList.innerHTML = "";

    for (const result of results) {
      const row = document.createElement("div");
      row.className = "flex items-center gap-3 py-1.5";

      const iconMap = {
        success: '<i class="fa-solid fa-check text-success text-xs"></i>',
        error: '<i class="fa-solid fa-xmark text-error text-xs"></i>',
        skipped: '<i class="fa-solid fa-forward text-warning text-xs"></i>',
      };

      const statusClass = {
        success: "text-success",
        error: "text-error",
        skipped: "text-warning",
      };

      row.innerHTML = `
        <span class="w-4 text-center shrink-0">${iconMap[result.status]}</span>
        <span class="text-[13px] font-medium flex-1 truncate">${this.escHtml(result.service)}</span>
        <span class="text-xs ${statusClass[result.status]} shrink-0">${this.escHtml(result.message)}</span>
        ${result.url ? `<a href="${this.escHtml(result.url)}" target="_blank" rel="noopener" class="text-[11px] text-info hover:underline shrink-0"><i class="fa-solid fa-arrow-up-right-from-square text-[9px] mr-0.5"></i>Open</a>` : ""}
      `;

      this.resultsList.appendChild(row);
    }
  }
}

// 初期化
document.addEventListener("DOMContentLoaded", () => {
  new BranchUI();

  // ThemeToggleをマウント
  const themeToggleContainer = document.getElementById(
    "theme-toggle-container",
  );
  if (themeToggleContainer) {
    render(<ThemeToggle />, themeToggleContainer);
  }
});
