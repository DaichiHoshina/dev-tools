import { ThemeToggle } from "~/components/ThemeToggle";

export function Header() {
  return (
    <header
      class="navbar sticky top-0 z-50 px-5 app-header"
      style="height: 56px; min-height: 56px;"
    >
      <div class="navbar-start">
        <div class="brand">
          <span class="brand-icon">
            <i class="fa-solid fa-screwdriver-wrench"></i>
          </span>
          <span class="brand-mark text-base">Dev</span>
          <span class="brand-suffix">Tools</span>
        </div>
      </div>
      <div class="navbar-end gap-1">
        <ThemeToggle />
        <a
          href="https://gitlab.example.com/your-org/devtools"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn-ghost btn-sm btn-square rounded-lg text-neutral/60 hover:text-neutral hover:bg-white/5"
          title="リポジトリ"
          aria-label="リポジトリ"
        >
          <i class="fab fa-gitlab"></i>
        </a>
      </div>
    </header>
  );
}
