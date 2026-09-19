import "./styles/globals.css";
import { render } from "hono/jsx/dom";
import { ThemeToggle } from "./components/ThemeToggle";

console.log("Release Flow v1.0.0");

interface FlowStep {
  name: string;
  description: string;
  icon: string;
  link?: string;
  linkLabel?: string;
}

const FLOW_STEPS: FlowStep[] = [
  {
    name: "ブランチ作成",
    description: "releaseブランチを各サービスに作成",
    icon: "fa-code-branch",
    link: "./branch.html",
    linkLabel: "Branch",
  },
  {
    name: "TESリリース",
    description: "TES環境へのリリース実施",
    icon: "fa-rocket",
    link: "./tes.html",
    linkLabel: "TES",
  },
  {
    name: "テスト実施",
    description: "TES環境での動作確認テスト",
    icon: "fa-vial",
  },
  {
    name: "UAT",
    description: "ユーザー受入テスト実施",
    icon: "fa-user-check",
  },
  {
    name: "PRD MR作成",
    description: "PRD反映MRの作成",
    icon: "fa-arrow-up",
    link: "./prd.html",
    linkLabel: "PRD",
  },
  {
    name: "クローズ",
    description: "リリース完了・クローズ処理",
    icon: "fa-flag-checkered",
  },
];

function renderTimeline(): void {
  const container = document.getElementById("flow-timeline");
  if (!container) return;

  container.innerHTML = FLOW_STEPS.map((step, index) => {
    const isLast = index === FLOW_STEPS.length - 1;

    return `
      <div class="release-flow-step">
        <div class="release-flow-step-indicator">
          <div class="release-flow-step-icon">
            <i class="fa-solid ${step.icon}"></i>
          </div>
          ${!isLast ? `<div class="release-flow-step-line"></div>` : ""}
        </div>
        <div class="release-flow-step-content">
          <div class="flex items-center justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-[10px] font-mono text-base-content/30">${String(index + 1).padStart(2, "0")}</span>
                <span class="text-sm font-medium text-base-content">${step.name}</span>
              </div>
              <p class="text-xs text-base-content/50 mt-0.5">${step.description}</p>
            </div>
            ${
              step.link
                ? `<a href="${step.link}" class="btn btn-ghost btn-xs rounded-lg text-primary/70 hover:text-primary gap-1" title="${step.linkLabel}">
                <i class="fa-solid fa-arrow-right text-[9px]"></i>
                <span class="text-[11px]">${step.linkLabel}</span>
              </a>`
                : ""
            }
          </div>
        </div>
      </div>
    `;
  }).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("theme-toggle-container");
  if (container) {
    render(<ThemeToggle />, container);
  }
  renderTimeline();
});
