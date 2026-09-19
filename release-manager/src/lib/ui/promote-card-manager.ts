/**
 * PRD MR作成カード管理
 * MR作成詳細カードの表示・更新を担当
 */

import { PROMOTE_STEPS } from "../promote-config";
import { escHtml } from "../utils/html";

export interface PromoteCardDeps {
  deployDetailsContainer: HTMLElement;
}

export class PromoteCardManager {
  constructor(private deps: PromoteCardDeps) {}

  /**
   * MR作成詳細カードを表示
   */
  showPromoteDetail(serviceName: string): void {
    const existingCard = document.getElementById(`deploy-card-${serviceName}`);
    if (existingCard) return;

    const totalSteps = PROMOTE_STEPS.length;
    const card = document.createElement("div");
    card.id = `deploy-card-${serviceName}`;
    card.className = "deploy-detail-card";
    card.innerHTML = `
      <div class="deploy-card-header px-5 py-3.5 border-b border-base-300/50 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-neutral flex items-center gap-2.5 m-0">
          <span class="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
            <i class="fas fa-arrow-up text-primary text-[10px]"></i>
          </span>
          <span class="deploy-card-title">${escHtml(serviceName)} - PRD MR作成</span>
        </h3>
      </div>
      <div class="card-body">
        <div class="deploy-overall-progress" id="overall-progress-${serviceName}">
          <div class="overall-progress-label">
            <span class="text-xs font-medium text-secondary">全体進捗</span>
            <span class="overall-progress-text" id="overall-progress-text-${serviceName}">0/${totalSteps}</span>
          </div>
          <div class="overall-progress-bar-container">
            <div class="overall-progress-bar" id="overall-progress-bar-${serviceName}" style="width: 0%;"></div>
          </div>
        </div>
        <div class="m3-step-list" id="deploy-steps-${serviceName}">
          ${PROMOTE_STEPS.map(
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
   * カードタイトルを更新
   */
  updateCardTitle(serviceName: string, title: string): void {
    const card = document.getElementById(`deploy-card-${serviceName}`);
    if (card) {
      const titleEl = card.querySelector(".deploy-card-title");
      if (titleEl) titleEl.textContent = title;
    }
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
    const stepEl = document.getElementById(`step-${service}-${stepId}`);
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
      `progress-${service}-${stepId}`,
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

    // サービステーブルの情報行を更新
    this.updateServiceInfo(service, stepId, status);

    // 全体プログレス更新
    this.updateOverallProgress(service);
  }

  /**
   * サービステーブルの情報行を更新
   */
  private updateServiceInfo(
    service: string,
    stepId: number,
    status: string,
  ): void {
    const infoEl = document.getElementById(`deploy-info-${service}`);
    if (!infoEl) return;

    const totalSteps = PROMOTE_STEPS.length;

    if (status === "running") {
      const step = PROMOTE_STEPS.find((s) => s.id === stepId);
      if (step) {
        infoEl.innerHTML = `
          <span class="text-primary text-xs">ステップ ${stepId}/${totalSteps}: ${step.name}</span>
          <div class="service-mini-progress">
            <div class="mini-bar mini-bar-waiting" style="width: ${Math.max(((stepId - 1) / totalSteps) * 100, 5)}%;"></div>
          </div>
        `;
      }
    } else if (status === "success" && stepId === totalSteps) {
      infoEl.innerHTML = `
        <span class="text-success text-xs">完了</span>
        <div class="service-mini-progress">
          <div class="mini-bar" style="width: 100%; background: #4cae4c;"></div>
        </div>
      `;
    }
  }

  /**
   * 全体プログレスバーを更新
   */
  private updateOverallProgress(service: string): void {
    const totalSteps = PROMOTE_STEPS.length;
    let completedSteps = 0;

    for (const step of PROMOTE_STEPS) {
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
   * ArgoCD Syncボタンをカードヘッダーに表示（MR作成完了後の手動実行用）
   */
  showArgoCDSyncButton(service: string, onClick: () => void): void {
    const card = document.getElementById(`deploy-card-${service}`);
    if (!card) return;

    // 既存ボタン削除
    const existingBtn = card.querySelector(".argocd-sync-btn");
    if (existingBtn) existingBtn.remove();

    const header = card.querySelector(".deploy-card-header");
    if (header) {
      const syncBtn = document.createElement("button");
      syncBtn.className = "btn btn-accent btn-sm gap-1 argocd-sync-btn";
      syncBtn.innerHTML = '<i class="fas fa-sync"></i> ArgoCD同期';
      syncBtn.addEventListener("click", onClick);
      header.appendChild(syncBtn);
    }
  }

  /**
   * MRリンクを表示
   */
  showMrLink(service: string, mrUrl: string): void {
    const card = document.getElementById(`deploy-card-${service}`);
    if (!card) return;

    // 既存リンク削除
    const existingLink = card.querySelector(".mr-link-btn");
    if (existingLink) existingLink.remove();

    const header = card.querySelector(".deploy-card-header");
    if (header) {
      const linkBtn = document.createElement("a");
      linkBtn.className = "btn btn-ghost btn-sm gap-1 mr-link-btn";
      linkBtn.href = mrUrl;
      linkBtn.target = "_blank";
      linkBtn.rel = "noopener noreferrer";
      linkBtn.innerHTML = '<i class="fab fa-gitlab"></i> MR';
      header.appendChild(linkBtn);
    }
  }
}
