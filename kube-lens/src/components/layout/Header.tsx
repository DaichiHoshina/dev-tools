import { ThemeToggle } from "~/components/shared/ThemeToggle";
import type { Project, Environment } from "~/lib/types";

interface HeaderProps {
  project: Project;
  onProjectChange: (p: Project) => void;
  env: Environment;
  onEnvChange: (env: Environment) => void;
  connected: boolean;
  clusterInfo: string;
  apiUrl: string;
  onSidebarToggle: () => void;
}

const ENV_LABELS: Record<Environment, string> = {
  dev: "dev",
  staging: "staging",
  production: "production",
};

export function Header({
  project,
  env,
  onEnvChange,
  connected,
  clusterInfo,
  apiUrl,
  onSidebarToggle,
}: HeaderProps) {
  const displayUrl = apiUrl.startsWith("/k8s/") ? apiUrl : apiUrl;

  return (
    <header
      class="navbar sticky top-0 z-50 px-5 app-header"
      style="height: 56px; min-height: 56px;"
    >
      {/* 左側: ブランド */}
      <div class="navbar-start gap-2">
        {/* モバイル用ハンバーガー */}
        <button
          type="button"
          class="btn btn-ghost btn-sm btn-square rounded-lg text-neutral/60 hover:text-neutral hover:bg-white/5 md:hidden"
          onClick={onSidebarToggle}
          aria-label="サイドバー切替"
        >
          <i class="fas fa-bars" />
        </button>
        <a href="#/" class="brand" style="text-decoration: none;">
          <span class="brand-icon">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              style="display:block"
            >
              <circle
                cx="10.5"
                cy="10.5"
                r="7"
                stroke="white"
                stroke-width="2.5"
              />
              <line
                x1="15.5"
                y1="15.5"
                x2="21"
                y2="21"
                stroke="white"
                stroke-width="2.5"
                stroke-linecap="round"
              />
            </svg>
          </span>
          <span class="brand-mark">Kube</span>
          <span class="brand-suffix">Lens</span>
        </a>
        {project && project !== "default" && (
          <span class="text-xs font-mono" style="color: var(--text-muted)">
            {project}
          </span>
        )}
      </div>

      {/* 中央: 環境タブ */}
      <div class="navbar-center gap-3">
        <div class="env-tabs">
          {(["dev", "staging", "production"] as Environment[]).map((e) => (
            <button
              key={e}
              type="button"
              class={
                e === "production"
                  ? `env-tab env-tab-prd${env === e ? " active" : ""}`
                  : `env-tab${env === e ? " active" : ""}`
              }
              onClick={() => onEnvChange(e)}
            >
              {ENV_LABELS[e]}
            </button>
          ))}
        </div>
        {env === "production" && (
          <span class="badge badge-error text-xs">本番環境</span>
        )}
      </div>

      {/* 右側: クラスタ情報・ステータス・テーマ */}
      <div class="navbar-end gap-1">
        {/* 接続ステータス + クラスタ情報 */}
        <span
          class="connection-status px-2"
          title={`${displayUrl}${clusterInfo ? ` (${clusterInfo})` : ""}`}
        >
          <i
            class={`fas fa-circle text-xs ${connected ? "text-success" : "text-error"}`}
          />
          <span class="text-xs" style="color: var(--text-muted)">
            {connected ? displayUrl : "未接続"}
          </span>
          {connected && clusterInfo && (
            <span
              class="text-[10px] font-mono"
              style="color: var(--text-subtle)"
            >
              {clusterInfo}
            </span>
          )}
        </span>

        <ThemeToggle />
      </div>
    </header>
  );
}
