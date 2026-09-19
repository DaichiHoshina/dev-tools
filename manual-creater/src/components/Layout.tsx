import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import {
  FileText,
  Menu,
  X,
  Hammer,
  Terminal,
  Database,
  UserCircle,
  Home,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { templates } from "../templates";

function NavItem({
  to,
  icon,
  label,
  active,
  onClick,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2 text-[14px] rounded-lg transition-colors ${
        active
          ? "text-foreground font-medium bg-accent"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
      }`}
    >
      {icon}
      {label}
    </NavLink>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  return (
    <nav className="px-4 py-6 space-y-1">
      <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        手順書
      </p>
      {templates.map((t) => (
        <NavItem
          key={t.id}
          to={`/template/${t.id}`}
          icon={<FileText className="h-4 w-4" />}
          label={t.name.replace(/手順書$/, "")}
          active={location.pathname === `/template/${t.id}`}
          onClick={onNavigate}
        />
      ))}

      <div className="my-5 border-t border-border" />

      <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        コマンドテンプレート
      </p>
      <NavItem
        to="/temp-node"
        icon={<Terminal className="h-4 w-4" />}
        label="temp-node"
        active={location.pathname === "/temp-node"}
        onClick={onNavigate}
      />
      <NavItem
        to="/sql-templates"
        icon={<Database className="h-4 w-4" />}
        label="SQLテンプレート"
        active={location.pathname === "/sql-templates"}
        onClick={onNavigate}
      />
      <NavItem
        to="/tools"
        icon={<Hammer className="h-4 w-4" />}
        label="運用ツール"
        active={location.pathname === "/tools"}
        onClick={onNavigate}
      />
      <NavItem
        to="/profile"
        icon={<UserCircle className="h-4 w-4" />}
        label="プロフィール"
        active={location.pathname === "/profile"}
        onClick={onNavigate}
      />
    </nav>
  );
}

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b border-border backdrop-blur-sm bg-card/80">
        <div className="h-14 px-6 flex items-center gap-4">
          <button
            className="md:hidden shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-md text-foreground hover:bg-accent transition-colors"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="メニュー"
          >
            {sidebarOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
          <NavLink
            to="/"
            className="flex items-center gap-2.5 text-foreground font-semibold"
          >
            <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <span className="text-[15px]">Manual Creater</span>
          </NavLink>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <a
              href="/application/tools/devtools/devtools-home/"
              className="inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="DevTools Home"
              aria-label="DevTools Home"
            >
              <Home className="h-4 w-4" />
            </a>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:block w-60 shrink-0 border-r border-border bg-sidebar min-h-[calc(100vh-3.5rem)]">
          <SidebarContent />
        </aside>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <>
            <div
              className="fixed inset-0 z-30 bg-black/50 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <aside className="fixed top-14 left-0 z-30 w-64 bg-card border-r border-border min-h-[calc(100vh-3.5rem)] shadow-md md:hidden">
              <SidebarContent onNavigate={() => setSidebarOpen(false)} />
            </aside>
          </>
        )}

        {/* Main content */}
        <main className="flex-1 py-10 px-10 max-w-5xl">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
