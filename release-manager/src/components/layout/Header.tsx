import type { FC } from "hono/jsx";

export const Header: FC<{ title: string }> = ({ title }) => {
  return (
    <header
      class="navbar bg-base-100 sticky top-0 z-[999] px-5 app-header"
      style="height: 56px; min-height: 56px;"
    >
      <div class="navbar-start">
        <a href="/" class="brand">
          <span class="brand-icon">
            <i class="fas fa-rocket"></i>
          </span>
          <span class="brand-mark text-base">Release</span>
          <span class="brand-suffix">TES</span>
        </a>
      </div>
      <div class="navbar-center">
        <div
          id="branch-status-badge"
          class="branch-status-badge"
          style="display: none;"
        ></div>
      </div>
      <div class="navbar-end gap-1">
        <a
          href="/application/tools/devtools/devtools-home/"
          class="btn btn-ghost btn-sm btn-square rounded-lg text-base-content/60 hover:text-base-content hover:bg-white/5"
          title="DevTools Home"
          aria-label="DevTools Home"
        >
          <i class="fa-solid fa-house"></i>
        </a>
      </div>
    </header>
  );
};
