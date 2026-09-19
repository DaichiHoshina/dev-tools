// PRD MR作成 & ロールバック クライアントサイドエントリ
import "./styles/globals.css";
import {
  PromoteController,
  type PromotionState,
} from "./lib/controller/promote";
import { RollbackController } from "./lib/controller/rollback";
import {
  ReleaseManagerAPI,
  type ServiceConfig,
  type ServiceDefinition,
} from "./lib/api/gitlab";
import { AlertManager } from "./lib/ui/alert-manager";
import { DialogManager } from "./lib/ui/dialog-manager";
import { LogViewer } from "./lib/ui/log-viewer";
import { PromoteServiceTableManager } from "./lib/ui/promote-service-table-manager";
import { PromoteCardManager } from "./lib/ui/promote-card-manager";
import { RollbackServiceTableManager } from "./lib/ui/rollback-service-table-manager";
import { RollbackCardManager } from "./lib/ui/rollback-card-manager";
import { PROMOTE_STEPS } from "./lib/promote-config";
import { ROLLBACK_STEPS } from "./lib/rollback-config";
import { render } from "hono/jsx/dom";
import { ThemeToggle } from "./components/ThemeToggle";
import { TabTitleManager } from "./lib/ui/tab-title-manager";
import { NotificationService } from "./lib/ui/notification-service";
import { MrTitleTemplateStorage, MR_TITLE_PRESETS } from "./lib/storage";

console.log("Release TES PRD Promote UI v2.0.0");

class PromoteUI {
  private controller: PromoteController;
  private api: ReleaseManagerAPI;
  private alertManager: AlertManager;
  private dialogManager: DialogManager;
  private serviceConfig: ServiceConfig | null = null;
  private activeServices = new Set<string>();
  private selectedService: string | null = null;

  // タブタイトル・通知
  private tabTitleManager: TabTitleManager;
  private notificationService: NotificationService;

  // DOM要素
  private servicesTbody!: HTMLElement;
  private deployDetailsContainer!: HTMLElement;
  private batchPromoteBtn!: HTMLButtonElement;
  private batchCancelBtn!: HTMLButtonElement;
  private batchCountSpan!: HTMLElement;
  private checkAllBox!: HTMLInputElement;

  // UIマネージャー
  private logViewer: LogViewer;
  private serviceTableManager!: PromoteServiceTableManager;
  private cardManager!: PromoteCardManager;

  constructor() {
    this.controller = new PromoteController();
    this.api = new ReleaseManagerAPI();
    this.alertManager = new AlertManager();
    this.dialogManager = new DialogManager();
    this.tabTitleManager = new TabTitleManager();
    this.notificationService = new NotificationService();
    this.logViewer = new LogViewer();

    this.initElements();
    this.initControllerCallbacks();
    this.checkAuthentication();
    this.loadServices();
  }

  private initElements(): void {
    this.servicesTbody = document.getElementById("services-tbody")!;
    this.deployDetailsContainer = document.getElementById(
      "deploy-details-container",
    )!;
    this.batchPromoteBtn = document.getElementById(
      "batch-promote-btn",
    ) as HTMLButtonElement;
    this.batchCancelBtn = document.getElementById(
      "batch-cancel-btn",
    ) as HTMLButtonElement;
    this.batchCountSpan = document.getElementById("batch-count")!;
    this.checkAllBox = document.getElementById("check-all") as HTMLInputElement;

    this.serviceTableManager = new PromoteServiceTableManager({
      servicesTbody: this.servicesTbody,
      activeServices: this.activeServices,
      onSelectService: (service) => this.selectService(service),
      onCheckChange: () => this.updateBatchButton(),
    });

    this.cardManager = new PromoteCardManager({
      deployDetailsContainer: this.deployDetailsContainer,
    });

    this.dialogManager.init();

    // 全選択チェックボックス
    this.checkAllBox.addEventListener("change", () => {
      this.serviceTableManager.setAllChecked(this.checkAllBox.checked);
    });

    // バッチMR作成ボタン
    this.batchPromoteBtn.addEventListener("click", () =>
      this.handleBatchPromote(),
    );

    // バッチキャンセルボタン
    this.batchCancelBtn.addEventListener("click", () =>
      this.handleBatchCancel(),
    );

    // MRタイトルテンプレート初期化
    const mrTitleInput = document.getElementById(
      "mr-title-template",
    ) as HTMLInputElement | null;
    if (mrTitleInput) {
      mrTitleInput.value = MrTitleTemplateStorage.get(MR_TITLE_PRESETS.prd);
      mrTitleInput.addEventListener("change", () => {
        MrTitleTemplateStorage.save(mrTitleInput.value.trim(), "prd");
      });
    }
  }

  private checkAuthentication(): void {
    if (!this.api.hasToken()) {
      this.alertManager.showAlert(
        "GitLabトークンが設定されていません。",
        "warning",
      );
    }
  }

  private initControllerCallbacks(): void {
    this.controller.onStepUpdate = (service, stepId, status, data) => {
      this.cardManager.updateStepUI(service, stepId, status, data);
      if (status === "running") {
        this.tabTitleManager.update(service, stepId, PROMOTE_STEPS.length);
      }
    };

    this.controller.onLogUpdate = (service, log) => {
      this.logViewer.appendLog(service, log);
    };

    this.controller.onMrCreated = (service, mrUrl) => {
      this.cardManager.showMrLink(service, mrUrl);
    };

    this.controller.onPromotionComplete = (service, status) => {
      this.onPromotionComplete(service, status);
    };

    this.controller.onError = (service, error) => {
      this.alertManager.showError(service, error);
    };
  }

  private async loadServices(): Promise<void> {
    try {
      this.serviceConfig = await this.api.getServiceConfig();
      if (this.serviceConfig) {
        await this.serviceTableManager.renderServiceRows(this.serviceConfig);
        this.fetchAllVersions();
      }
    } catch (error) {
      console.error("Failed to load services:", error);
      this.alertManager.showAlert(
        "サービス一覧の読み込みに失敗しました。",
        "danger",
      );
    }
  }

  private async fetchAllVersions(): Promise<void> {
    if (!this.serviceConfig) return;

    for (const [serviceName, svcConfig] of Object.entries(
      this.serviceConfig.services,
    )) {
      this.fetchVersionForService(serviceName, svcConfig);
    }
  }

  private async fetchVersionForService(
    serviceName: string,
    svcConfig: ServiceDefinition,
  ): Promise<void> {
    try {
      const { tesTag, prdTag } = await this.controller.getVersions(
        serviceName,
        svcConfig,
      );
      this.serviceTableManager.updateVersions(serviceName, tesTag, prdTag);
    } catch (error) {
      console.error(`Failed to fetch versions for ${serviceName}:`, error);
      this.serviceTableManager.updateVersions(serviceName, "?", "?");
    }
  }

  /**
   * バッチボタンの件数・有効状態を更新
   */
  private updateBatchButton(): void {
    const count = this.serviceTableManager.getCheckedCount();
    this.batchCountSpan.textContent = String(count);
    this.batchPromoteBtn.disabled = count === 0;
    if (count === 0) {
      this.batchPromoteBtn.classList.add("btn-disabled");
    } else {
      this.batchPromoteBtn.classList.remove("btn-disabled");
    }
  }

  /**
   * バッチMR作成
   */
  private async handleBatchPromote(): Promise<void> {
    const serviceTags = this.serviceTableManager.getCheckedServiceTags();
    if (serviceTags.size === 0) {
      this.alertManager.showAlert("サービスが選択されていません", "warning");
      return;
    }

    const serviceList = Array.from(serviceTags.entries())
      .map(([s, t]) => `  ${s}: ${t}`)
      .join("\n");

    const confirmed = await this.dialogManager.showConfirmDialog(
      "MR作成確認",
      `${serviceTags.size}件のサービスを1つのMRにまとめて作成しますか?\n\n${serviceList}\n\nHelm MRが作成されます（手動マージが必要です）。`,
    );

    if (!confirmed) return;

    this.notificationService.requestPermission();

    // UIを処理中状態に
    for (const service of serviceTags.keys()) {
      this.activeServices.add(service);
      this.serviceTableManager.setRowPromoting(service, true);

      // promotionステートを初期化
      this.controller.promotions.set(service, {
        service,
        status: "running",
        currentStep: 1,
        startedAt: new Date(),
        logs: "",
      });
    }

    // 最初のサービスを選択して詳細表示
    const firstService = serviceTags.keys().next().value!;
    this.selectService(firstService);

    // バッチボタン非表示・キャンセル表示
    this.batchPromoteBtn.style.display = "none";
    this.batchCancelBtn.style.display = "inline-flex";

    try {
      this.applyMrTitleTemplate();
      await this.controller.promoteBatch(serviceTags);
    } catch (error) {
      this.alertManager.showError(
        firstService,
        error instanceof Error ? error : new Error(String(error)),
      );
    } finally {
      // ボタン状態を復元
      this.batchPromoteBtn.style.display = "";
      this.batchCancelBtn.style.display = "none";
    }
  }

  private async handleBatchCancel(): Promise<void> {
    const confirmed = await this.dialogManager.showConfirmDialog(
      "キャンセル確認",
      "MR作成をキャンセルしますか?",
    );

    if (confirmed) {
      for (const service of this.activeServices) {
        this.controller.cancelPromotion(service);
        this.serviceTableManager.setRowPromoting(service, false);
      }
      this.activeServices.clear();
    }
  }

  private async handleArgoCDSync(serviceName: string): Promise<void> {
    const confirmed = await this.dialogManager.showConfirmDialog(
      "ArgoCD Sync確認",
      `${serviceName} のArgoCD Sync（PRD環境）を実行しますか?`,
    );

    if (!confirmed) return;

    try {
      this.logViewer.appendLog(
        serviceName,
        `[INFO] ArgoCD Sync 開始: ${serviceName}`,
      );
      await this.controller.syncArgoCD(serviceName);
      this.alertManager.showAlert(
        `${serviceName} のArgoCD Syncが完了しました`,
        "success",
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logViewer.appendLog(
        serviceName,
        `[ERROR] ArgoCD Sync 失敗: ${errMsg}`,
      );
      this.alertManager.showError(
        serviceName,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  private onPromotionComplete(
    service: string,
    status: "success" | "failed",
  ): void {
    this.serviceTableManager.setRowStatus(service, status);
    this.activeServices.delete(service);

    if (status === "success") {
      this.tabTitleManager.setComplete(service);
      this.notificationService.notify(
        "MR作成完了",
        `${service} のMR作成が完了しました`,
      );
    } else {
      this.tabTitleManager.setFailed(service);
      this.notificationService.notify(
        "MR作成失敗",
        `${service} のMR作成が失敗しました`,
      );
    }

    this.updateBatchButton();

    this.cardManager.updateCardTitle(
      service,
      status === "success"
        ? `${service} - MR作成完了`
        : `${service} - MR作成失敗`,
    );

    if (status === "success") {
      this.alertManager.showAlert(
        `${service} のMR作成が完了しました`,
        "success",
      );
      this.cardManager.showArgoCDSyncButton(service, () =>
        this.handleArgoCDSync(service),
      );
      if (this.serviceConfig) {
        const svcConfig = this.serviceConfig.services[service];
        if (svcConfig) {
          this.fetchVersionForService(service, svcConfig);
        }
      }
    }
  }

  private selectService(serviceName: string): void {
    if (this.selectedService) {
      const prevRow = document.getElementById(
        `service-row-${this.selectedService}`,
      );
      if (prevRow) prevRow.classList.remove("service-row-selected");
    }

    this.selectedService = serviceName;
    const row = document.getElementById(`service-row-${serviceName}`);
    if (row) row.classList.add("service-row-selected");

    this.cardManager.showPromoteDetail(serviceName);

    // 既存ログ再表示
    const logOutput = document.getElementById(`log-output-${serviceName}`);
    if (logOutput && logOutput.children.length === 0) {
      const promotion = this.controller.promotions.get(serviceName);
      if (promotion?.logs) {
        const lines = promotion.logs.split("\n");
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

    const card = document.getElementById(`deploy-card-${serviceName}`);
    if (card) {
      card.scrollIntoView({ behavior: "smooth" });
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
}

// --- RollbackUI ---

class RollbackUI {
  private controller: RollbackController;
  private api: ReleaseManagerAPI;
  private alertManager: AlertManager;
  private dialogManager: DialogManager;
  private serviceConfig: ServiceConfig | null = null;
  private activeServices = new Set<string>();
  private selectedService: string | null = null;

  private tabTitleManager: TabTitleManager;
  private notificationService: NotificationService;

  private servicesTbody!: HTMLElement;
  private deployDetailsContainer!: HTMLElement;
  private batchRollbackBtn!: HTMLButtonElement;
  private batchCancelBtn!: HTMLButtonElement;
  private batchCountSpan!: HTMLElement;
  private checkAllBox!: HTMLInputElement;

  private logViewer: LogViewer;
  private serviceTableManager!: RollbackServiceTableManager;
  private cardManager!: RollbackCardManager;

  private initialized = false;

  constructor() {
    this.controller = new RollbackController();
    this.api = new ReleaseManagerAPI();
    this.alertManager = new AlertManager();
    this.dialogManager = new DialogManager();
    this.tabTitleManager = new TabTitleManager();
    this.notificationService = new NotificationService();
    this.logViewer = new LogViewer();
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    this.initElements();
    this.initControllerCallbacks();
    await this.loadServices();
  }

  private initElements(): void {
    this.servicesTbody = document.getElementById("rb-services-tbody")!;
    this.deployDetailsContainer = document.getElementById(
      "rb-deploy-details-container",
    )!;
    this.batchRollbackBtn = document.getElementById(
      "rb-batch-rollback-btn",
    ) as HTMLButtonElement;
    this.batchCancelBtn = document.getElementById(
      "rb-batch-cancel-btn",
    ) as HTMLButtonElement;
    this.batchCountSpan = document.getElementById("rb-batch-count")!;
    this.checkAllBox = document.getElementById(
      "rb-check-all",
    ) as HTMLInputElement;

    this.dialogManager.init();

    this.serviceTableManager = new RollbackServiceTableManager({
      servicesTbody: this.servicesTbody,
      activeServices: this.activeServices,
      onSelectService: (service) => this.selectService(service),
      onCheckChange: () => this.updateBatchButton(),
    });

    this.cardManager = new RollbackCardManager({
      deployDetailsContainer: this.deployDetailsContainer,
    });

    // 全選択チェックボックス
    this.checkAllBox.addEventListener("change", () => {
      this.serviceTableManager.setAllChecked(this.checkAllBox.checked);
    });

    // バッチロールバックボタン
    this.batchRollbackBtn.addEventListener("click", () =>
      this.handleBatchRollback(),
    );

    // バッチキャンセルボタン
    this.batchCancelBtn.addEventListener("click", () =>
      this.handleBatchCancel(),
    );
  }

  private initControllerCallbacks(): void {
    this.controller.onStepUpdate = (service, stepId, status, data) => {
      this.cardManager.updateStepUI(service, stepId, status, data);
      if (status === "running") {
        this.tabTitleManager.update(service, stepId, ROLLBACK_STEPS.length);
      }
    };

    this.controller.onLogUpdate = (service, log) => {
      this.logViewer.appendLog(service, log, "rb-");
    };

    this.controller.onMrCreated = (service, mrUrl) => {
      this.cardManager.showMrLink(service, mrUrl);
    };

    this.controller.onRollbackComplete = (service, status) => {
      this.onRollbackComplete(service, status);
    };

    this.controller.onError = (service, error) => {
      this.alertManager.showError(service, error);
    };
  }

  private async loadServices(): Promise<void> {
    try {
      this.serviceConfig = await this.api.getServiceConfig();
      if (this.serviceConfig) {
        await this.serviceTableManager.renderServiceRows(this.serviceConfig);
        this.fetchAllVersionsAndHistory();
      }
    } catch (error) {
      console.error("Failed to load services for rollback:", error);
      this.alertManager.showAlert(
        "ロールバック: サービス一覧の読み込みに失敗しました。",
        "danger",
      );
    }
  }

  private async fetchAllVersionsAndHistory(): Promise<void> {
    if (!this.serviceConfig) return;

    for (const [serviceName, svcConfig] of Object.entries(
      this.serviceConfig.services,
    )) {
      this.fetchVersionAndHistory(serviceName, svcConfig);
    }
  }

  private async fetchVersionAndHistory(
    serviceName: string,
    svcConfig: ServiceDefinition,
  ): Promise<void> {
    try {
      const [currentTag, history] = await Promise.all([
        this.controller.getCurrentPrdTag(svcConfig),
        this.controller.getVersionHistory(serviceName, svcConfig),
      ]);

      this.serviceTableManager.updatePrdVersion(serviceName, currentTag);
      this.serviceTableManager.updateVersionHistory(
        serviceName,
        currentTag,
        history,
      );
    } catch (error) {
      console.error(
        `Failed to fetch version history for ${serviceName}:`,
        error,
      );
      this.serviceTableManager.updatePrdVersion(serviceName, "?");
    }
  }

  /**
   * バッチボタンの件数・有効状態を更新
   */
  private updateBatchButton(): void {
    const count = this.serviceTableManager.getCheckedCount();
    this.batchCountSpan.textContent = String(count);
    this.batchRollbackBtn.disabled = count === 0;
    if (count === 0) {
      this.batchRollbackBtn.classList.add("btn-disabled");
    } else {
      this.batchRollbackBtn.classList.remove("btn-disabled");
    }
  }

  /**
   * バッチロールバック
   */
  private async handleBatchRollback(): Promise<void> {
    const serviceTags = this.serviceTableManager.getCheckedServiceTags();
    if (serviceTags.size === 0) {
      this.alertManager.showAlert(
        "サービスが選択されていないか、ロールバック先が未選択です",
        "warning",
      );
      return;
    }

    const serviceList = Array.from(serviceTags.entries())
      .map(([s, t]) => `  ${s}: → ${t}`)
      .join("\n");

    const confirmed = await this.dialogManager.showConfirmDialog(
      "ロールバック確認",
      `${serviceTags.size}件のサービスを1つのMRにまとめてロールバックしますか?\n\n${serviceList}\n\nHelm MRが作成されます（手動マージが必要です）。`,
    );

    if (!confirmed) return;

    this.notificationService.requestPermission();

    // UIを処理中状態に
    for (const service of serviceTags.keys()) {
      this.activeServices.add(service);
      this.serviceTableManager.setRowRollingBack(service, true);

      this.controller.rollbacks.set(service, {
        service,
        targetTag: serviceTags.get(service)!,
        currentTag: "",
        status: "running",
        currentStep: 1,
        startedAt: new Date(),
        logs: "",
      });
    }

    // 最初のサービスを選択して詳細表示
    const firstService = serviceTags.keys().next().value!;
    this.selectService(firstService);

    // バッチボタン非表示・キャンセル表示
    this.batchRollbackBtn.style.display = "none";
    this.batchCancelBtn.style.display = "inline-flex";

    try {
      await this.controller.rollbackBatch(serviceTags);
    } catch (error) {
      this.alertManager.showError(
        firstService,
        error instanceof Error ? error : new Error(String(error)),
      );
    } finally {
      // ボタン状態を復元
      this.batchRollbackBtn.style.display = "";
      this.batchCancelBtn.style.display = "none";
    }
  }

  private async handleBatchCancel(): Promise<void> {
    const confirmed = await this.dialogManager.showConfirmDialog(
      "キャンセル確認",
      "ロールバックをキャンセルしますか?",
    );

    if (confirmed) {
      for (const service of this.activeServices) {
        this.controller.cancelRollback(service);
        this.serviceTableManager.setRowRollingBack(service, false);
      }
      this.activeServices.clear();
    }
  }

  private onRollbackComplete(
    service: string,
    status: "success" | "failed",
  ): void {
    this.serviceTableManager.setRowStatus(service, status);
    this.activeServices.delete(service);

    if (status === "success") {
      this.tabTitleManager.setComplete(service);
      this.notificationService.notify(
        "ロールバック完了",
        `${service} のロールバックが完了しました`,
      );
    } else {
      this.tabTitleManager.setFailed(service);
      this.notificationService.notify(
        "ロールバック失敗",
        `${service} のロールバックが失敗しました`,
      );
    }

    this.cardManager.updateCardTitle(
      service,
      status === "success"
        ? `${service} - ロールバック完了`
        : `${service} - ロールバック失敗`,
    );

    this.updateBatchButton();

    if (status === "success") {
      this.alertManager.showAlert(
        `${service} のロールバックMR作成が完了しました`,
        "success",
      );
      if (this.serviceConfig) {
        const svcConfig = this.serviceConfig.services[service];
        if (svcConfig) {
          this.fetchVersionAndHistory(service, svcConfig);
        }
      }
    }
  }

  private selectService(serviceName: string): void {
    if (this.selectedService) {
      const prevRow = document.getElementById(
        `rb-service-row-${this.selectedService}`,
      );
      if (prevRow) prevRow.classList.remove("service-row-selected");
    }

    this.selectedService = serviceName;
    const row = document.getElementById(`rb-service-row-${serviceName}`);
    if (row) row.classList.add("service-row-selected");

    this.cardManager.showRollbackDetail(serviceName);

    const logOutput = document.getElementById(`rb-log-output-${serviceName}`);
    if (logOutput && logOutput.children.length === 0) {
      const rb = this.controller.rollbacks.get(serviceName);
      if (rb?.logs) {
        const lines = rb.logs.split("\n");
        lines.forEach((line) => {
          if (!line.trim()) return;
          const div = document.createElement("div");
          div.className = `log-line ${this.logViewer.getLogClass(line)}`;
          this.logViewer.linkifyUrls(div, line);
          logOutput.appendChild(div);
        });
        this.logViewer.updateLogLineCount(serviceName, "rb-");
      }
    }

    const card = document.getElementById(`rb-deploy-card-${serviceName}`);
    if (card) {
      card.scrollIntoView({ behavior: "smooth" });
    }
  }
}

// --- タブ切替 ---

function initTabs(rollbackUI: RollbackUI): void {
  const tabPromote = document.getElementById("tab-promote");
  const tabRollback = document.getElementById("tab-rollback");
  const promotePanel = document.getElementById("promote-panel");
  const rollbackPanel = document.getElementById("rollback-panel");

  if (!tabPromote || !tabRollback || !promotePanel || !rollbackPanel) return;

  tabPromote.addEventListener("click", () => {
    tabPromote.classList.add("tab-active");
    tabRollback.classList.remove("tab-active");
    promotePanel.style.display = "";
    rollbackPanel.style.display = "none";
  });

  tabRollback.addEventListener("click", async () => {
    tabRollback.classList.add("tab-active");
    tabPromote.classList.remove("tab-active");
    rollbackPanel.style.display = "";
    promotePanel.style.display = "none";
    await rollbackUI.init();
  });
}

// --- 初期化 ---

document.addEventListener("DOMContentLoaded", () => {
  new PromoteUI();
  const rollbackUI = new RollbackUI();
  initTabs(rollbackUI);

  // ThemeToggleをマウント
  const themeToggleContainer = document.getElementById(
    "theme-toggle-container",
  );
  if (themeToggleContainer) {
    render(<ThemeToggle />, themeToggleContainer);
  }
});
