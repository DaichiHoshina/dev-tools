import { DEPLOY_STEPS } from "../config";
import type { StepUpdateData } from "../controller/deploy-pipeline";

export interface DeployCardDeps {
  deployDetailsContainer: HTMLElement;
}

/**
 * デプロイカード管理クラス
 * 責務: デプロイ詳細カードの表示・更新・削除
 */
export class DeployCardManager {
  constructor(private deps: DeployCardDeps) {}

  /**
   * デプロイ詳細カードを表示（各サービスに個別のカードを作成）
   * @param serviceName サービス名
   */
  showDeployDetail(serviceName: string): void {
    // 既存のカードがあればスキップ
    const existingCard = document.getElementById(`deploy-card-${serviceName}`);
    if (existingCard) return;

    // 新しいカードを作成
    const card = document.createElement("div");
    card.id = `deploy-card-${serviceName}`;
    card.className = "deploy-detail-card";
    card.innerHTML = `
      <div class="deploy-card-header px-5 py-3.5 border-b border-base-300/50 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-neutral flex items-center gap-2.5 m-0">
          <span class="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
            <i class="fas fa-terminal text-primary text-[10px]"></i>
          </span>
          <span class="deploy-card-title">${serviceName}</span>
        </h3>
      </div>
      <div class="card-body">
        <div class="deploy-overall-progress" id="overall-progress-${serviceName}">
          <div class="overall-progress-label">
            <span class="text-xs font-medium text-secondary">全体進捗</span>
            <span class="overall-progress-text" id="overall-progress-text-${serviceName}">0/${DEPLOY_STEPS.length}</span>
          </div>
          <div class="overall-progress-bar-container">
            <div class="overall-progress-bar" id="overall-progress-bar-${serviceName}" style="width: 0%;"></div>
          </div>
        </div>
        <div class="m3-step-list" id="deploy-steps-${serviceName}">
          ${DEPLOY_STEPS.map(
            (step) => `
            <div class="m3-step m3-step-pending" id="step-${serviceName}-${step.id}">
              <div class="m3-step-icon">
                <i class="fas ${step.icon}"></i>
              </div>
              <div class="m3-step-content">
                <div class="m3-step-name">${step.name}</div>
                <div class="m3-step-progress">
                  <div class="m3-step-progress-bar" id="progress-${serviceName}-${step.id}"></div>
                </div>
              </div>
              <span class="m3-step-status"></span>
            </div>
          `,
          ).join("")}
        </div>
        <details class="m3-log-accordion" open>
          <summary class="m3-log-header">
            <i class="fas fa-terminal text-xs"></i>
            Console
            <span class="badge badge-ghost badge-sm ml-auto text-[10px]" id="log-line-count-${serviceName}">0行</span>
          </summary>
          <div class="m3-log-container">
            <pre id="log-output-${serviceName}" class="m3-log-output"></pre>
          </div>
        </details>
      </div>
    `;

    this.deps.deployDetailsContainer.appendChild(card);
    card.scrollIntoView({ behavior: "smooth" });
  }

  /**
   * デプロイ詳細カードを削除
   * @param serviceName サービス名
   */
  removeDeployDetail(serviceName: string): void {
    const card = document.getElementById(`deploy-card-${serviceName}`);
    if (card) {
      card.remove();
    }
  }

  /**
   * デプロイ詳細カードのタイトルを更新
   * @param serviceName サービス名
   * @param title タイトル
   */
  updateDeployCardTitle(serviceName: string, title: string): void {
    const card = document.getElementById(`deploy-card-${serviceName}`);
    if (card) {
      const titleEl = card.querySelector(".deploy-card-title");
      if (titleEl) {
        titleEl.textContent = title;
      }
    }
  }

  /**
   * ステップUIを更新
   * @param service サービス名
   * @param stepId ステップID
   * @param status ステータス
   * @param data 追加データ（進捗率、経過時間等）
   */
  updateStepUI(
    service: string,
    stepId: number,
    status: "pending" | "running" | "success" | "failed" | "waiting",
    data: StepUpdateData & {
      completedSteps?: number;
      totalSteps?: number;
    } = {},
  ): void {
    const formatElapsed = (sec: number): string => {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return m > 0 ? `${m}分${s}秒` : `${s}秒`;
    };

    const infoEl = document.getElementById(`deploy-info-${service}`);
    if (infoEl) {
      const totalSteps = DEPLOY_STEPS.length;
      const stepProgress = data.progress || 0;
      const overallProgress = Math.floor(
        ((stepId - 1) / totalSteps) * 100 + stepProgress / totalSteps,
      );

      if (status === "running") {
        const step = DEPLOY_STEPS.find((s) => s.id === stepId);
        const elapsedText =
          data.elapsedSeconds != null
            ? ` (${formatElapsed(data.elapsedSeconds)})`
            : "";
        infoEl.innerHTML = step
          ? `
            <span class="text-primary">ステップ ${stepId}/${totalSteps}: ${step.name}${elapsedText}</span>
            <div class="service-mini-progress">
              <div class="mini-bar mini-bar-waiting" style="width: ${Math.max(overallProgress, 5)}%;"></div>
            </div>
          `
          : "";
      } else if (status === "waiting") {
        const step = DEPLOY_STEPS.find((s) => s.id === stepId);
        const elapsedText =
          data.elapsedSeconds != null
            ? ` (${formatElapsed(data.elapsedSeconds)})`
            : "";
        infoEl.innerHTML = step
          ? `
            <span class="text-warning">ステップ ${stepId}/${totalSteps}: ${step.name} - 外部待機中${elapsedText}</span>
            <div class="service-mini-progress">
              <div class="mini-bar mini-bar-waiting" style="width: ${Math.max(overallProgress, 5)}%;"></div>
            </div>
          `
          : "";
      } else if (status === "success") {
        const completedProgress = Math.floor((stepId / totalSteps) * 100);
        const step = DEPLOY_STEPS.find((s) => s.id === stepId);
        infoEl.innerHTML = `
          <span class="text-primary">ステップ ${stepId}/${totalSteps}: ${step?.name ?? ""} 完了</span>
          <div class="service-mini-progress">
            <div class="mini-bar" style="width: ${completedProgress}%;"></div>
          </div>
        `;
      }
    }

    const stepEl = document.getElementById(`step-${service}-${stepId}`);
    if (!stepEl) return;

    stepEl.className = "m3-step";
    const statusClass = {
      pending: "m3-step-pending",
      running: "m3-step-running",
      success: "m3-step-success",
      failed: "m3-step-failed",
      waiting: "m3-step-waiting",
    };
    stepEl.classList.add(statusClass[status] || "m3-step-pending");

    // ステップ名の横にジョブ進捗と経過時間を表示
    const nameEl = stepEl.querySelector(".m3-step-name");
    if (
      nameEl &&
      (status === "running" || status === "waiting") &&
      data.elapsedSeconds != null
    ) {
      const step = DEPLOY_STEPS.find((s) => s.id === stepId);
      if (step) {
        const label =
          status === "waiting" ? `${step.name} - 外部待機中` : step.name;
        const parts: string[] = [];
        if (data.totalJobs != null && data.totalJobs > 0) {
          parts.push(`${data.completedJobs ?? 0}/${data.totalJobs}ジョブ`);
        }
        if (data.runningJobName) {
          parts.push(data.runningJobName);
        }
        parts.push(formatElapsed(data.elapsedSeconds));
        nameEl.textContent = `${label} (${parts.join(", ")})`;
      }
    }

    const progressBar = document.getElementById(
      `progress-${service}-${stepId}`,
    );
    if (progressBar) {
      if (status === "running") {
        const pct = data.progress ? `${data.progress}%` : "50%";
        (progressBar as HTMLElement).style.width = pct;
        progressBar.classList.add("progress-bar-waiting");
      } else if (status === "waiting") {
        (progressBar as HTMLElement).style.width = data.progress
          ? `${data.progress}%`
          : "100%";
        progressBar.classList.add("progress-bar-waiting");
      } else if (status === "success") {
        (progressBar as HTMLElement).style.width = "100%";
        progressBar.classList.remove("progress-bar-waiting");
      } else if (status === "failed") {
        (progressBar as HTMLElement).style.width = data.progress
          ? `${data.progress}%`
          : "0%";
        progressBar.classList.remove("progress-bar-waiting");
      }
    }

    const statusEl = stepEl.querySelector(".m3-step-status");
    if (statusEl) {
      const iconMap: Record<string, string> = {
        pending: "",
        running: '<i class="fas fa-spinner fa-spin text-primary"></i>',
        success: '<i class="fas fa-check text-success"></i>',
        failed: '<i class="fas fa-times text-error"></i>',
        waiting: '<i class="fas fa-hourglass-half fa-spin text-warning"></i>',
      };
      statusEl.innerHTML = iconMap[status] || "";
    }

    // 全体プログレスバーを更新
    this.updateOverallProgress(service);
  }

  /**
   * 全体プログレスバーを更新
   */
  private updateOverallProgress(service: string): void {
    const totalSteps = DEPLOY_STEPS.length;
    let completedSteps = 0;

    for (const step of DEPLOY_STEPS) {
      const stepEl = document.getElementById(`step-${service}-${step.id}`);
      if (stepEl?.classList.contains("m3-step-success")) {
        completedSteps++;
      }
    }

    const progressPercent = Math.floor((completedSteps / totalSteps) * 100);
    const progressBar = document.getElementById(
      `overall-progress-bar-${service}`,
    );
    const progressText = document.getElementById(
      `overall-progress-text-${service}`,
    );

    if (progressBar) {
      (progressBar as HTMLElement).style.width = `${progressPercent}%`;
    }
    if (progressText) {
      progressText.textContent = `${completedSteps}/${totalSteps}`;
    }
  }

  /**
   * MRリンクを表示
   * @param service サービス名
   * @param mrType MRタイプ（app/helm）
   * @param mrUrl MR URL
   */
  showMrLink(service: string, mrType: "app" | "helm", mrUrl: string): void {
    const stepId = mrType === "app" ? 2 : 5;
    const actionEl = document.querySelector(
      `#step-${service}-${stepId} .step-action`,
    );
    if (actionEl) {
      actionEl.textContent = "";
      const link = document.createElement("a");
      link.href = mrUrl;
      link.target = "_blank";
      link.className = "btn btn-outline btn-sm";
      const icon = document.createElement("i");
      icon.className = "fas fa-external-link-alt me-1";
      link.appendChild(icon);
      link.appendChild(document.createTextNode("MRを開く"));
      actionEl.appendChild(link);
    }
  }

  /**
   * パイプラインリンクを表示
   * @param service サービス名
   * @param pipelineUrl パイプライン URL
   */
  showPipelineLink(service: string, pipelineUrl: string): void {
    const card = document.getElementById(`deploy-card-${service}`);
    if (!card) return;

    // 既存のリンクがあれば削除
    const existingLink = card.querySelector(".pipeline-link-btn");
    if (existingLink) {
      existingLink.remove();
    }

    const header = card.querySelector(".deploy-card-header");
    if (header) {
      const linkBtn = document.createElement("a");
      linkBtn.className = "btn btn-ghost btn-sm gap-1 pipeline-link-btn";
      linkBtn.href = pipelineUrl;
      linkBtn.target = "_blank";
      linkBtn.rel = "noopener noreferrer";
      linkBtn.innerHTML = '<i class="fab fa-gitlab"></i> Pipeline';
      header.appendChild(linkBtn);
    }
  }
}
