// クライアントサイドエントリ（完全版）
import "./styles/globals.css";
import { DeployController } from "./lib/controller/deploy";
import {
  ReleaseManagerAPI,
  GitLabAPI,
  type ServiceConfig,
  type ServiceDefinition,
} from "./lib/api/gitlab";
import { CONFIG, DEPLOY_STEPS } from "./lib/config";
import {
  BranchComparisonService,
  type BranchComparisonResult,
} from "./lib/services/branch-comparison";
import { AlertManager } from "./lib/ui/alert-manager";
import { DialogManager } from "./lib/ui/dialog-manager";
import { LogViewer } from "./lib/ui/log-viewer";
import {
  VersionInputManager,
  calculateDefaultMinorVersion,
} from "./lib/ui/version-input-manager";
import { ServiceTableManager } from "./lib/ui/service-table-manager";
import { DeployCardManager } from "./lib/ui/deploy-card-manager";
import { render } from "hono/jsx/dom";
import { ThemeToggle } from "./components/ThemeToggle";
import {
  PipelineMonitorStorage,
  DeployHistoryStorage,
  MrTitleTemplateStorage,
} from "./lib/storage";
import { TabTitleManager } from "./lib/ui/tab-title-manager";
import { NotificationService } from "./lib/ui/notification-service";
import { setupTokenSettings } from "./lib/ui/token-settings";

console.log("Release TES リリース UI v3.2.0");

/**
 * メインUIクラス
 */
class DeployUI {
  private controller: DeployController;
  private api: ReleaseManagerAPI;
  private alertManager: AlertManager;
  private dialogManager: DialogManager;
  private branchComparisonService: BranchComparisonService | null = null;
  private serviceConfig: ServiceConfig | null = null;
  private activeServices = new Set<string>();

  private selectedService: string | null = null;
  private lastBranchComparison: BranchComparisonResult | null = null;
  private existingHelmMRs = new Map<
    string,
    { iid: number; web_url: string; title: string }
  >();

  // タブタイトル・通知
  private tabTitleManager: TabTitleManager;
  private notificationService: NotificationService;

  // DOM要素
  private alertContainer!: HTMLElement;
  private servicesTbody!: HTMLElement;
  private deployDetailsContainer!: HTMLElement;

  // UIマネージャー
  private logViewer: LogViewer;
  private versionInputManager: VersionInputManager;
  private serviceTableManager!: ServiceTableManager;
  private deployCardManager!: DeployCardManager;

  constructor() {
    this.controller = new DeployController();
    this.api = new ReleaseManagerAPI();
    this.alertManager = new AlertManager();
    this.dialogManager = new DialogManager();
    this.tabTitleManager = new TabTitleManager();
    this.notificationService = new NotificationService();

    // UIマネージャー初期化
    this.logViewer = new LogViewer();
    this.versionInputManager = new VersionInputManager(this.api);

    this.initElements();
    this.initTabs();

    // DOM依存マネージャー初期化
    this.serviceTableManager = new ServiceTableManager({
      servicesTbody: this.servicesTbody,
      activeServices: this.activeServices,
      onSelectService: (service) => this.selectService(service),
      onSelectionChange: (count) => this.updateReleaseButton(count),
      versionInputManager: this.versionInputManager,
    });

    this.deployCardManager = new DeployCardManager({
      deployDetailsContainer: this.deployDetailsContainer,
    });

    this.checkAuthentication();
    this.initControllerCallbacks();
    this.loadServices();
    this.initBranchComparison();
    this.initReleaseControls();
  }

  /**
   * ブランチ比較サービス初期化
   */
  private async initBranchComparison(): Promise<void> {
    console.log("[BranchComparison] 初期化開始");

    // GitLabトークンがある場合のみ初期化
    if (!this.api.hasToken()) {
      console.log("[BranchComparison] トークンなし、スキップ");
      return;
    }

    console.log("[BranchComparison] トークンあり、サービス開始");
    const gitlabApi = new GitLabAPI();
    this.branchComparisonService = new BranchComparisonService(gitlabApi);

    // サービス設定を取得してセット
    if (this.serviceConfig) {
      console.log("[BranchComparison] 既存のサービス設定を使用");
      this.branchComparisonService.setServiceConfig(this.serviceConfig);
    } else {
      // まだロードされていなければ取得
      try {
        console.log("[BranchComparison] サービス設定を取得中...");
        const config = await this.api.getServiceConfig();
        console.log(
          "[BranchComparison] サービス設定取得完了",
          Object.keys(config.services),
        );
        this.branchComparisonService.setServiceConfig(config);
      } catch (error) {
        console.error("[BranchComparison] サービス設定取得エラー:", error);
        return;
      }
    }

    this.branchComparisonService.startPolling((result) => {
      console.log("[BranchComparison] バッジ更新", result);
      this.updateBranchStatusBadge(result);
    });
  }

  /**
   * ブランチ状態バッジを更新
   */
  private updateBranchStatusBadge(result: BranchComparisonResult): void {
    this.lastBranchComparison = result;

    // ヘッダーバッジ更新
    const badge = document.getElementById("branch-status-badge");
    if (badge) {
      if (result.totalAhead > 0) {
        const serviceList = result.services
          .filter((s) => s.aheadCount > 0)
          .map((s) => `${s.serviceName}: +${s.aheadCount}`)
          .join(", ");

        // XSS対策: DOM APIで安全に構築
        badge.textContent = "";
        const span = document.createElement("span");
        span.className = "badge badge-warning";
        span.title = serviceList;
        const icon = document.createElement("i");
        icon.className = "fas fa-exclamation-triangle";
        span.appendChild(icon);
        span.appendChild(
          document.createTextNode(
            ` ${result.totalAhead}件のサービスでmainが先行`,
          ),
        );
        badge.appendChild(span);

        badge.style.display = "flex";
        badge.style.alignItems = "center";
        badge.style.gap = "8px";
      } else {
        badge.style.display = "none";
      }
    }

    // 各サービス行を更新
    for (const service of result.services) {
      const row = document.getElementById(`service-row-${service.serviceName}`);
      const indicator = document.getElementById(
        `branch-ahead-${service.serviceName}`,
      );

      if (row && indicator) {
        if (service.aheadCount > 0) {
          row.classList.add("branch-ahead-row");
          indicator.style.display = "inline-flex";
          const countEl = indicator.querySelector(".ahead-count");
          if (countEl) {
            countEl.textContent = `+${service.aheadCount}`;
          }
          this.setupMrTooltip(indicator, service);
        } else if (service.error) {
          row.classList.remove("branch-ahead-row");
          indicator.style.display = "inline-flex";
          indicator.title = `ブランチ比較失敗: ${service.error}`;
          const countEl = indicator.querySelector(".ahead-count");
          if (countEl) countEl.textContent = "?";
        } else {
          row.classList.remove("branch-ahead-row");
          indicator.style.display = "none";
        }
      }
    }
  }

  /**
   * MRツールチップを設定
   */
  private setupMrTooltip(
    indicator: HTMLElement,
    service: {
      serviceName: string;
      aheadCount: number;
      mrs?: Array<{ title: string; iid: number; url: string }>;
    },
  ): void {
    // 既存のツールチップを削除
    const existingTooltip = document.getElementById(
      `tooltip-${service.serviceName}`,
    );
    if (existingTooltip) {
      existingTooltip.remove();
    }

    // MRがない場合は簡易titleのみ
    if (!service.mrs || service.mrs.length === 0) {
      indicator.title = `mainがreleaseより${service.aheadCount}コミット先行`;
      return;
    }

    // titleをクリア（カスタムツールチップを使用）
    indicator.title = "";

    // ツールチップ要素を作成
    const tooltip = document.createElement("div");
    tooltip.id = `tooltip-${service.serviceName}`;
    tooltip.className = "mr-tooltip";
    tooltip.style.cssText = `
      position: absolute;
      display: none;
      background: #ffffff;
      color: #1f2937;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 12px;
      z-index: 1000;
      max-width: 340px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
      border: 1px solid #e5e7eb;
    `;

    // ヘッダー
    const header = document.createElement("div");
    header.style.cssText =
      "font-weight: 600; font-size: 11px; color: #6b7280; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;";
    header.textContent = `${service.mrs.length}件のMR`;
    tooltip.appendChild(header);

    for (const mr of service.mrs) {
      const item = document.createElement("a");
      item.href = mr.url;
      item.target = "_blank";
      item.rel = "noopener";
      item.style.cssText = `
        display: flex;
        align-items: baseline;
        gap: 6px;
        padding: 5px 8px;
        margin: 2px -4px;
        border-radius: 4px;
        text-decoration: none;
        color: #1f2937;
        transition: background 0.15s;
      `;
      item.addEventListener("mouseenter", () => {
        item.style.background = "#f3f4f6";
      });
      item.addEventListener("mouseleave", () => {
        item.style.background = "transparent";
      });

      const badge = document.createElement("span");
      badge.style.cssText =
        "font-size: 11px; color: #6366f1; font-weight: 600; white-space: nowrap;";
      badge.textContent = `!${mr.iid}`;

      const title = document.createElement("span");
      title.style.cssText = "font-size: 12px; line-height: 1.4;";
      title.textContent = mr.title;

      item.appendChild(badge);
      item.appendChild(title);
      tooltip.appendChild(item);
    }

    document.body.appendChild(tooltip);

    let hideTimer: number | null = null;

    const showTooltip = (e: MouseEvent) => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      tooltip.style.display = "block";
      const rect = indicator.getBoundingClientRect();
      tooltip.style.left = `${rect.left + window.scrollX}px`;
      tooltip.style.top = `${rect.bottom + window.scrollY + 4}px`;
    };

    const scheduleHide = () => {
      hideTimer = window.setTimeout(() => {
        tooltip.style.display = "none";
      }, 200);
    };

    indicator.addEventListener("mouseenter", showTooltip);
    indicator.addEventListener("mouseleave", scheduleHide);

    tooltip.addEventListener("mouseenter", () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    });
    tooltip.addEventListener("mouseleave", scheduleHide);
  }

  initElements() {
    this.alertContainer = document.getElementById("alert-container")!;
    this.servicesTbody = document.getElementById("services-tbody")!;
    this.deployDetailsContainer = document.getElementById(
      "deploy-details-container",
    )!;

    // MRタイトルテンプレート初期化
    const mrTitleInput = document.getElementById(
      "mr-title-template",
    ) as HTMLInputElement | null;
    if (mrTitleInput) {
      mrTitleInput.value = MrTitleTemplateStorage.get();
      mrTitleInput.addEventListener("change", () => {
        MrTitleTemplateStorage.save(mrTitleInput.value.trim());
      });
    }

    this.initTabs();
  }

  initTabs() {
    const tabs = document.querySelectorAll(".tab");
    const tabsArray = Array.from(tabs);

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", (e) => {
        e.preventDefault();
        const targetTab = (tab as HTMLElement).dataset.tab;
        if (!targetTab) return;

        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");

        this.serviceTableManager.filterServicesByTab(targetTab);
      });

      // キーボードナビゲーション (WCAG 2.2 AA)
      tab.addEventListener("keydown", (e) => {
        const keyEvent = e as KeyboardEvent;
        if (keyEvent.key === "ArrowRight") {
          e.preventDefault();
          const next = tabsArray[(index + 1) % tabsArray.length] as HTMLElement;
          next.focus();
          next.click();
        } else if (keyEvent.key === "ArrowLeft") {
          e.preventDefault();
          const prev = tabsArray[
            (index - 1 + tabsArray.length) % tabsArray.length
          ] as HTMLElement;
          prev.focus();
          prev.click();
        }
      });
    });

    this.dialogManager.init();
  }

  /**
   * M3 確認ダイアログ初期化
   */

  checkAuthentication() {
    if (this.controller.isPipelineMode()) {
      return;
    }

    if (!this.api.hasToken()) {
      this.showAlert("GitLabトークンが設定されていません。", "warning");
    }
  }

  initControllerCallbacks() {
    this.controller.onStepUpdate = (service, stepId, status, data) => {
      this.deployCardManager.updateStepUI(service, stepId, status, data);
      // タブタイトル更新
      if (status === "running" || status === "waiting") {
        this.tabTitleManager.update(service, stepId, DEPLOY_STEPS.length);
      }
      // ステータス列を更新
      if (stepId > 0) {
        let statusForBadge:
          | "idle"
          | "running"
          | "waiting"
          | "success"
          | "failed";
        if (status === "pending") {
          statusForBadge = "idle";
        } else if (status === "success") {
          statusForBadge = "running";
        } else {
          statusForBadge = status;
        }
        const stepInfo = `Step ${stepId}/${DEPLOY_STEPS.length}`;
        this.serviceTableManager.updateDeployStatus(
          service,
          statusForBadge,
          stepInfo,
        );
      }
    };
    this.controller.onLogUpdate = (service, log) =>
      this.logViewer.appendLog(service, log);
    this.controller.onMrCreated = (service, mrType, mrUrl) =>
      this.deployCardManager.showMrLink(service, mrType, mrUrl);
    this.controller.onDeploymentComplete = (service, status) =>
      this.onDeploymentComplete(service, status);
    this.controller.onError = (service, error) =>
      this.showError(service, error);
    this.controller.onPipelineStarted = (service, pipelineUrl) =>
      this.deployCardManager.showPipelineLink(service, pipelineUrl);
  }

  async loadServices() {
    try {
      this.serviceConfig = await this.api.getServiceConfig();
      if (this.serviceConfig) {
        await this.serviceTableManager.renderServiceRows(this.serviceConfig);
        await this.recoverPipelineMonitoring();
        this.renderDeployHistory();
        this.checkExistingHelmMRs();
      }
    } catch (error) {
      console.error("Failed to load services:", error);
      this.showAlert("サービス一覧の読み込みに失敗しました。", "danger");
    }
  }

  /**
   * 既存のHelm MR（未マージ）を検出してテーブルに表示
   */
  private async checkExistingHelmMRs(): Promise<void> {
    if (!this.api.hasToken() || !this.serviceConfig) return;

    try {
      const infraProject = CONFIG.GITLAB.INFRASTRUCTURE_PROJECT_ID;
      const openMRs = await this.api.getMergeRequests(infraProject, {
        state: "opened",
        target_branch: "master",
        per_page: "50",
      });

      const serviceNames = Object.keys(this.serviceConfig.services);
      this.existingHelmMRs.clear();

      for (const mr of openMRs) {
        if (!mr.source_branch.startsWith("deploy/")) continue;

        for (const service of serviceNames) {
          if (
            mr.source_branch.includes(service) ||
            mr.title.includes(service)
          ) {
            if (!this.existingHelmMRs.has(service)) {
              this.existingHelmMRs.set(service, {
                iid: mr.iid,
                web_url: mr.web_url,
                title: mr.title,
              });
            }
          }
        }
      }

      for (const [service, mr] of this.existingHelmMRs) {
        const infoEl = document.getElementById(`deploy-info-${service}`);
        if (infoEl) {
          const link = document.createElement("a");
          link.href = mr.web_url;
          link.target = "_blank";
          link.rel = "noopener";
          link.className = "badge badge-warning badge-sm gap-1 cursor-pointer";
          link.title = mr.title;
          link.innerHTML = '<i class="fas fa-code-merge text-[9px]"></i>';
          link.appendChild(document.createTextNode(`MR !${mr.iid}`));
          infoEl.appendChild(link);
        }
      }
    } catch (error) {
      console.error("[HelmMR] 既存MR検出失敗:", error);
    }
  }

  /**
   * ページリロード後のパイプライン監視復旧
   */
  private async recoverPipelineMonitoring(): Promise<void> {
    const pendingPipelines = PipelineMonitorStorage.getAll();
    if (pendingPipelines.length === 0) return;

    console.log(
      `[PipelineRecover] ${pendingPipelines.length}件の未完了パイプラインを検出`,
    );

    for (const state of pendingPipelines) {
      this.activeServices.add(state.service);
      this.serviceTableManager.setRowDeploying(state.service, true);
      this.selectService(state.service);

      this.controller
        .resumePipelineMonitoring(
          state.service,
          state.pipelineId,
          state.pipelineUrl,
          state.tagName,
        )
        .catch((error) => {
          this.showError(state.service, error as Error);
        });
    }
  }

  /**
   * リリースボタン・全選択チェックボックス初期化
   */
  private initReleaseControls(): void {
    const releaseBtn = document.getElementById("release-btn");
    if (releaseBtn) {
      releaseBtn.addEventListener("click", () => this.handleBatchRelease());
    }

    const syncBtn = document.getElementById("sync-btn");
    if (syncBtn) {
      syncBtn.addEventListener("click", () => this.handleBatchSync());
    }

    const selectAll = document.getElementById(
      "select-all-checkbox",
    ) as HTMLInputElement;
    if (selectAll) {
      selectAll.addEventListener("change", () => {
        this.serviceTableManager.setSelectAll(selectAll.checked);
      });
    }
  }

  /**
   * ボタンの状態更新（リリース・Sync共通）
   */
  private updateReleaseButton(selectedCount: number): void {
    const releaseBtn = document.getElementById(
      "release-btn",
    ) as HTMLButtonElement;
    const syncBtnEl = document.getElementById("sync-btn") as HTMLButtonElement;
    const countEl = document.getElementById("selected-count");

    const disabled = selectedCount === 0;
    for (const btn of [releaseBtn, syncBtnEl]) {
      if (!btn) continue;
      btn.disabled = disabled;
      if (disabled) {
        btn.classList.add("btn-disabled");
      } else {
        btn.classList.remove("btn-disabled");
      }
    }
    if (countEl) {
      countEl.textContent = selectedCount > 0 ? `${selectedCount}件選択` : "";
    }
  }

  /**
   * 一括リリース（タグ作成→バッチHelm MR）
   */
  private async handleBatchRelease(): Promise<void> {
    const serviceTags = this.serviceTableManager.getSelectedServiceTags();
    if (serviceTags.size === 0) {
      this.showAlert("リリースするサービスを選択してください", "warning");
      return;
    }

    // バージョン未入力チェック
    const selected = this.serviceTableManager.getSelectedCount();
    if (serviceTags.size < selected) {
      this.showAlert(
        "マイナーバージョンが未入力のサービスがあります",
        "warning",
      );
      return;
    }

    // 既存Helm MR警告
    const existingMrServices = Array.from(serviceTags.keys()).filter((s) =>
      this.existingHelmMRs.has(s),
    );
    let existingMrWarning = "";
    if (existingMrServices.length > 0) {
      existingMrWarning =
        "\n\n⚠ 未マージのHelm MRがあります:\n" +
        existingMrServices
          .map((s) => {
            const mr = this.existingHelmMRs.get(s)!;
            return `  ${s}: !${mr.iid}`;
          })
          .join("\n");
    }

    // ブランチ比較結果からMR情報を収集
    let mrInfo = "";
    for (const [service] of serviceTags) {
      const serviceStatus = this.lastBranchComparison?.services.find(
        (s) => s.serviceName === service,
      );
      if (serviceStatus?.mrs && serviceStatus.mrs.length > 0) {
        mrInfo +=
          `\n${service}:\n` +
          serviceStatus.mrs
            .map((mr) => `  - !${mr.iid}: ${mr.title}`)
            .join("\n");
      }
    }

    const serviceList = Array.from(serviceTags.entries())
      .map(([s, t]) => `${s}: ${t}`)
      .join("\n");

    const confirmed = await this.dialogManager.showConfirmDialog(
      "一括リリース確認",
      `以下の${serviceTags.size}サービスをリリースしますか?\n\n${serviceList}\n\nタグ作成（並列実行）→ Helm MR作成（1MR）が行われます。${existingMrWarning}${mrInfo ? `\n\n変更内容:${mrInfo}` : ""}`,
    );

    if (!confirmed) return;

    this.notificationService.requestPermission();
    this.applyMrTitleTemplate();

    // リリースボタンを無効化
    const releaseBtn = document.getElementById(
      "release-btn",
    ) as HTMLButtonElement;
    if (releaseBtn) {
      releaseBtn.disabled = true;
      releaseBtn.classList.add("btn-disabled");
      releaseBtn.innerHTML =
        '<i class="fas fa-spinner fa-spin text-xs"></i> リリース中...';
    }

    // 全サービスのタグ作成を並列実行
    const tagResults = await Promise.all(
      Array.from(serviceTags.entries()).map(async ([service, tagName]) => {
        this.activeServices.add(service);
        this.serviceTableManager.setRowDeploying(service, true);
        this.selectService(service);

        try {
          await this.controller.createTag(service, tagName);
          return { service, tagName, success: true };
        } catch {
          return { service, tagName, success: false };
        }
      }),
    );

    // 成功したサービスでバッチHelm MR作成
    const successTags = new Map<string, string>();
    for (const r of tagResults) {
      if (r.success) successTags.set(r.service, r.tagName);
    }

    if (successTags.size > 0) {
      try {
        const mrUrl = await this.controller.createBatchHelm(successTags);
        this.alertManager.showAlert(`Helm MR作成完了: ${mrUrl}`, "success");
        window.open(mrUrl, "_blank", "noopener");
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.alertManager.showAlert(`Helm MR作成失敗: ${errMsg}`, "danger");
      }
    }

    const failedCount = tagResults.filter((r) => !r.success).length;
    if (failedCount > 0 && successTags.size > 0) {
      this.alertManager.showAlert(
        `${failedCount}件のサービスでタグ作成に失敗しました。成功分のみHelm MRを作成しました。`,
        "warning",
      );
    }

    // リリースボタンを復元
    if (releaseBtn) {
      releaseBtn.disabled = false;
      releaseBtn.classList.remove("btn-disabled");
      releaseBtn.innerHTML = '<i class="fas fa-rocket text-xs"></i> リリース';
    }
  }

  private applyMrTitleTemplate(): void {
    const input = document.getElementById(
      "mr-title-template",
    ) as HTMLInputElement | null;
    if (input) {
      this.controller.setMrTitleTemplate(input.value.trim());
    }
  }

  onDeploymentComplete(service: string, status: "success" | "failed") {
    this.serviceTableManager.setRowStatus(service, status);
    this.activeServices.delete(service);

    // タブタイトル更新
    if (status === "success") {
      this.tabTitleManager.setComplete(service);
      this.notificationService.notify(
        "リリース完了",
        `${service} のリリースが完了しました`,
      );
    } else {
      this.tabTitleManager.setFailed(service);
      this.notificationService.notify(
        "リリース失敗",
        `${service} のリリースが失敗しました`,
      );
    }

    // 履歴再描画
    this.renderDeployHistory();

    const infoEl = document.getElementById(`deploy-info-${service}`);
    if (infoEl) {
      if (status === "success") {
        infoEl.innerHTML = `
          <span class="text-success">完了</span>
          <div class="service-mini-progress">
            <div class="mini-bar" style="width: 100%; background: #4cae4c;"></div>
          </div>
        `;
      } else {
        infoEl.innerHTML = '<span class="text-error">失敗</span>';
      }
    }

    // カードタイトル更新
    this.deployCardManager.updateDeployCardTitle(
      service,
      status === "success"
        ? `${service} - リリース完了`
        : `${service} - リリース失敗`,
    );
  }

  /**
   * 一括ArgoCD Sync（選択サービスを並列実行）
   */
  private async handleBatchSync(): Promise<void> {
    const selected = this.serviceTableManager.getSelectedServices();
    if (selected.length === 0) {
      this.showAlert("Syncするサービスを選択してください", "warning");
      return;
    }

    const confirmed = await this.dialogManager.showConfirmDialog(
      "ArgoCD Sync確認",
      `以下の${selected.length}サービスのArgoCD Sync（TES環境）を実行しますか?\n\n${selected.join("\n")}`,
    );

    if (!confirmed) return;

    const syncBtn = document.getElementById("sync-btn") as HTMLButtonElement;
    if (syncBtn) {
      syncBtn.disabled = true;
      syncBtn.classList.add("btn-disabled");
      syncBtn.innerHTML =
        '<i class="fas fa-spinner fa-spin text-xs"></i> Sync中...';
    }

    const results = await Promise.all(
      selected.map(async (serviceName) => {
        try {
          this.logViewer.appendLog(
            serviceName,
            `[INFO] ArgoCD Sync 開始: ${serviceName}`,
          );
          await this.controller.syncArgoCD(serviceName);
          this.logViewer.appendLog(
            serviceName,
            `[SUCCESS] ArgoCD Sync 完了: ${serviceName}`,
          );
          return { service: serviceName, success: true };
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          this.logViewer.appendLog(
            serviceName,
            `[ERROR] ArgoCD Sync 失敗: ${errMsg}`,
          );
          return { service: serviceName, success: false };
        }
      }),
    );

    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    if (failedCount === 0) {
      this.alertManager.showAlert(
        `${successCount}件のArgoCD Syncが完了しました`,
        "success",
      );
    } else {
      this.alertManager.showAlert(
        `ArgoCD Sync: ${successCount}件成功、${failedCount}件失敗`,
        failedCount === selected.length ? "danger" : "warning",
      );
    }

    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.classList.remove("btn-disabled");
      syncBtn.innerHTML = '<i class="fas fa-sync text-xs"></i> Sync';
    }
  }

  selectService(serviceName: string) {
    // 以前の選択をクリア
    if (this.selectedService) {
      const prevRow = document.getElementById(
        `service-row-${this.selectedService}`,
      );
      if (prevRow) prevRow.classList.remove("service-row-selected");
    }

    this.selectedService = serviceName;

    const row = document.getElementById(`service-row-${serviceName}`);
    if (row) row.classList.add("service-row-selected");

    // デプロイ詳細カードを表示（まだ表示されていない場合）
    this.deployCardManager.showDeployDetail(serviceName);

    // 既存のログがあれば再表示
    const logOutput = document.getElementById(`log-output-${serviceName}`);
    if (logOutput && logOutput.children.length === 0) {
      const deployment = this.controller.deployments.get(serviceName);
      if (deployment?.logs) {
        const lines = deployment.logs.split("\n");
        lines.forEach((line) => {
          if (!line.trim()) return;
          const div = document.createElement("div");
          div.className = `log-line ${this.logViewer.getLogClass(line)}`;
          this.logViewer.linkifyUrls(div, line);
          logOutput.appendChild(div);
        });
        this.logViewer.updateLogLineCount(serviceName);
      }
    }

    // カードが見えるようにスクロール
    const card = document.getElementById(`deploy-card-${serviceName}`);
    if (card) {
      card.scrollIntoView({ behavior: "smooth" });
    }
  }

  showError(service: string, error: Error) {
    this.alertManager.showError(service, error);
  }

  showAlert(message: string, type: string = "info") {
    this.alertManager.showAlert(message, type);
  }

  /**
   * デプロイ履歴を表示
   */
  private renderDeployHistory(): void {
    const containerId = "deploy-history-section";
    let section = document.getElementById(containerId);
    const entries = DeployHistoryStorage.getAll();

    if (entries.length === 0) {
      if (section) section.remove();
      return;
    }

    if (!section) {
      section = document.createElement("div");
      section.id = containerId;
      section.className = "card-modern mt-5";
      this.deployDetailsContainer.parentElement?.appendChild(section);
    }

    // ヘッダー + テーブルを構築
    section.innerHTML = "";

    const displayEntries = entries.slice(0, 20);

    const header = document.createElement("div");
    header.className =
      "flex items-center justify-between px-4 py-3 cursor-pointer select-none";
    header.innerHTML = `
      <div class="flex items-center gap-2 text-sm font-semibold">
        <i class="fas fa-history text-secondary"></i>
        <span>リリース履歴</span>
        <span class="badge badge-ghost badge-sm">直近${displayEntries.length}件</span>
      </div>
      <i class="fas fa-chevron-down text-secondary text-xs toggle-icon"></i>
    `;

    const content = document.createElement("div");
    content.className = "table-wrap";
    content.style.display = "none";

    header.addEventListener("click", () => {
      const isOpen = content.style.display !== "none";
      content.style.display = isOpen ? "none" : "block";
      const toggleIcon = header.querySelector(".toggle-icon");
      if (toggleIcon) {
        toggleIcon.className = isOpen
          ? "fas fa-chevron-down text-secondary text-xs toggle-icon"
          : "fas fa-chevron-up text-secondary text-xs toggle-icon";
      }
    });

    const table = document.createElement("table");
    table.className = "table table-sm";
    table.innerHTML = `
      <thead>
        <tr>
          <th class="text-xs">結果</th>
          <th class="text-xs">サービス</th>
          <th class="text-xs">バージョン</th>
          <th class="text-xs">開始日時</th>
          <th class="text-xs">所要時間</th>
          <th class="text-xs">リンク</th>
        </tr>
      </thead>
    `;

    const tbody = document.createElement("tbody");

    for (const entry of displayEntries) {
      const tr = document.createElement("tr");

      const statusIcon =
        entry.status === "success"
          ? '<i class="fas fa-check-circle text-success"></i>'
          : '<i class="fas fa-times-circle text-error"></i>';

      const startDate = new Date(entry.startedAt);
      const dateStr = `${startDate.getMonth() + 1}/${startDate.getDate()} ${startDate.getHours().toString().padStart(2, "0")}:${startDate.getMinutes().toString().padStart(2, "0")}`;

      const durationSec = Math.round(entry.durationMs / 1000);
      const durationMin = Math.floor(durationSec / 60);
      const durationStr =
        durationMin > 0
          ? `${durationMin}分${durationSec % 60}秒`
          : `${durationSec}秒`;

      tr.innerHTML = `
        <td class="text-center">${statusIcon}</td>
        <td class="text-sm font-medium"></td>
        <td><span class="badge badge-ghost badge-sm font-mono"></span></td>
        <td class="text-xs text-secondary">${dateStr}</td>
        <td class="text-xs text-secondary">${durationStr}</td>
        <td class="text-xs"></td>
      `;

      // XSS安全にテキスト設定
      const serviceTd = tr.querySelectorAll("td")[1];
      serviceTd.textContent = entry.service;
      const versionBadge = tr.querySelector(".badge")!;
      versionBadge.textContent = entry.tagName;

      const linkTd = tr.querySelectorAll("td")[5];
      if (entry.pipelineUrl) {
        const link = document.createElement("a");
        link.href = entry.pipelineUrl;
        link.target = "_blank";
        link.rel = "noopener";
        link.className = "link link-primary text-xs";
        link.textContent = "Pipeline";
        linkTd.appendChild(link);
      }

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    content.appendChild(table);
    section.appendChild(header);
    section.appendChild(content);
  }
}

// 初期化
document.addEventListener("DOMContentLoaded", () => {
  setupTokenSettings();
  new DeployUI();

  // ThemeToggleをマウント
  const themeToggleContainer = document.getElementById(
    "theme-toggle-container",
  );
  if (themeToggleContainer) {
    render(<ThemeToggle />, themeToggleContainer);
  }
});
