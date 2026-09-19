/**
 * PRDロールバックカード管理
 * ロールバック詳細カードの表示・更新を担当
 */

import { ROLLBACK_STEPS } from "../rollback-config";

export interface RollbackCardDeps {
  deployDetailsContainer: HTMLElement;
}

export class RollbackCardManager {
  constructor(private deps: RollbackCardDeps) {}

  /**
   * ロールバック詳細カードを表示
   */
  showRollbackDetail(serviceName: string): void {
    const existingCard = document.getElementById(
      `rb-deploy-card-${serviceName}`,
    );
    if (existingCard) return;

    const totalSteps = ROLLBACK_STEPS.length;
    const card = document.createElement("div");
    card.id = `rb-deploy-card-${serviceName}`;
    card.className = "deploy-detail-card";
    card.innerHTML = `
      <div class="deploy-card-header px-5 py-3.5 border-b border-base-300/50 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-neutral flex items-center gap-2.5 m-0">
          <span class="w-6 h-6 rounded-md bg-warning/10 flex items-center justify-center">
            <i class="fas fa-undo text-warning text-[10px]"></i>
          </span>
          <span class="rb-deploy-card-title">${serviceName} - ロールバック</span>
        </h3>
      </div>
      <div class="card-body">
        <div class="deploy-overall-progress" id="rb-overall-progress-${serviceName}">
          <div class="overall-progress-label">
            <span class="text-xs font-medium text-secondary">全体進捗</span>
            <span class="overall-progress-text" id="rb-overall-progress-text-${serviceName}">0/${totalSteps}</span>
          </div>
          <div class="overall-progress-bar-container">
            <div class="overall-progress-bar" id="rb-overall-progress-bar-${serviceName}" style="width: 0%;"></div>
          </div>
        </div>
        <div class="m3-step-list" id="rb-deploy-steps-${serviceName}">
          ${ROLLBACK_STEPS.map(
            (step) => `
            <div class="m3-step m3-step-pending" id="rb-step-${serviceName}-${step.id}">
              <div class="m3-step-icon">
                <i class="fas ${step.icon}"></i>
              </div>
              <div class="m3-step-content">
                <div class="m3-step-name">${step.name}</div>
                <div class="m3-step-progress">
                  <div class="m3-step-progress-bar" id="rb-progress-${serviceName}-${step.id}"></div>
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
            <span class="badge badge-ghost badge-sm ml-auto text-[10px]" id="rb-log-line-count-${serviceName}">0行</span>
          </summary>
          <div class="m3-log-container">
            <pre id="rb-log-output-${serviceName}" class="m3-log-output"></pre>
          </div>
        </details>
      </div>
    `;

    this.deps.deployDetailsContainer.appendChild(card);
    card.scrollIntoView({ behavior: "smooth" });
  }

  /**
   * カードタイトルを更新
   */
  updateCardTitle(serviceName: string, title: string): void {
    const card = document.getElementById(`rb-deploy-card-${serviceName}`);
    if (!card) return;

    const titleEl = card.querySelector(".rb-deploy-card-title");
    if (titleEl) titleEl.textContent = title;
  }

  /**
   * ステップUIを更新
   */
  updateStepUI(
    service: string,
    stepId: number,
    status: "pending" | "running" | "success" | "failed",
    data: { progress?: number; elapsedSeconds?: number } = {},
  ): void {
    const stepEl = document.getElementById(`rb-step-${service}-${stepId}`);
    if (!stepEl) return;

    stepEl.className = "m3-step";
    const statusClass: Record<string, string> = {
      pending: "m3-step-pending",
      running: "m3-step-running",
      success: "m3-step-success",
      failed: "m3-step-failed",
    };
    stepEl.classList.add(statusClass[status] || "m3-step-pending");

    // プログレスバー
    const progressBar = document.getElementById(
      `rb-progress-${service}-${stepId}`,
    );
    if (progressBar) {
      if (status === "running") {
        (progressBar as HTMLElement).style.width = data.progress
          ? `${data.progress}%`
          : "50%";
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

    // ステータスアイコン
    const statusEl = stepEl.querySelector(".m3-step-status");
    if (statusEl) {
      const iconMap: Record<string, string> = {
        pending: "",
        running: '<i class="fas fa-spinner fa-spin text-primary"></i>',
        success: '<i class="fas fa-check text-success"></i>',
        failed: '<i class="fas fa-times text-error"></i>',
      };
      statusEl.innerHTML = iconMap[status] || "";
    }

    // 全体プログレス更新
    this.updateOverallProgress(service);
  }

  /**
   * MRリンクを表示
   */
  showMrLink(service: string, mrUrl: string): void {
    const card = document.getElementById(`rb-deploy-card-${service}`);
    if (!card) return;

    const existingLink = card.querySelector(".mr-link-container");
    if (existingLink) existingLink.remove();

    const header = card.querySelector(".deploy-card-header");
    if (!header) return;

    const linkContainer = document.createElement("div");
    linkContainer.className = "mr-link-container";
    linkContainer.innerHTML = `
      <a href="${mrUrl}" target="_blank" rel="noopener" class="btn btn-ghost btn-xs gap-1 text-primary">
        <i class="fab fa-gitlab text-[10px]"></i>
        MR
        <i class="fas fa-external-link-alt text-[8px]"></i>
      </a>
    `;
    header.appendChild(linkContainer);
  }

  private updateOverallProgress(service: string): void {
    const totalSteps = ROLLBACK_STEPS.length;
    let completedSteps = 0;

    for (const step of ROLLBACK_STEPS) {
      const stepEl = document.getElementById(`rb-step-${service}-${step.id}`);
      if (stepEl?.classList.contains("m3-step-success")) {
        completedSteps++;
      }
    }

    const percentage = Math.round((completedSteps / totalSteps) * 100);
    const progressBar = document.getElementById(
      `rb-overall-progress-bar-${service}`,
    );
    const progressText = document.getElementById(
      `rb-overall-progress-text-${service}`,
    );

    if (progressBar) {
      (progressBar as HTMLElement).style.width = `${percentage}%`;
    }
    if (progressText) {
      progressText.textContent = `${completedSteps}/${totalSteps}`;
    }
  }
}
