import { NavLink } from "react-router-dom";
import { Bot, Zap, ClipboardList, BarChart2 } from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { to: "/", label: "起動中", Icon: Zap },
  { to: "/history", label: "履歴", Icon: ClipboardList },
  { to: "/analytics", label: "分析", Icon: BarChart2 },
];

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-base-100 flex flex-col">
      {/* Header */}
      <header className="bg-base-100 border-b border-base-300/40 sticky top-0 z-20">
        <div className="px-5 h-12 flex items-center gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary-content" />
            </div>
            <span className="font-semibold text-sm tracking-tight text-base-content">
              Claude Session Board
            </span>
          </div>

          {/* Nav */}
          <nav className="flex items-center gap-0.5">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 h-8 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-base-content/40 hover:text-base-content/70 hover:bg-base-300/40"
                  }`
                }
              >
                <item.Icon className="w-3.5 h-3.5" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 p-5 w-full max-w-screen-2xl mx-auto">
        {children}
      </main>
    </div>
  );
}
