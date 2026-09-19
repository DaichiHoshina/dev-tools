import { useRouter } from "~/hooks/use-router";

interface SidebarProps {
  isOpen: boolean;
  collapsed: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
}

interface NavItemDef {
  href: string;
  icon: string;
  label: string;
  path: string;
}

interface NavGroup {
  label: string;
  items: NavItemDef[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "#/", icon: "fa-gauge-high", label: "Dashboard", path: "/" },
    ],
  },
  {
    label: "Deploy",
    items: [
      {
        href: "#/deploy",
        icon: "fa-layer-group",
        label: "Deployments",
        path: "/deploy",
      },
      {
        href: "#/argocd",
        icon: "fa-rotate",
        label: "ArgoCD",
        path: "/argocd",
      },
      {
        href: "#/migration",
        icon: "fa-database",
        label: "Migration",
        path: "/migration",
      },
    ],
  },
  {
    label: "Monitoring",
    items: [
      {
        href: "#/error-logs",
        icon: "fa-stream",
        label: "Log Stream",
        path: "/error-logs",
      },
      { href: "#/logs", icon: "fa-terminal", label: "Logs", path: "/logs" },
      { href: "#/events", icon: "fa-bell", label: "Events", path: "/events" },
    ],
  },
  {
    label: "Workloads",
    items: [
      { href: "#/pods", icon: "fa-circle-nodes", label: "Pods", path: "/pods" },
      {
        href: "#/deployments",
        icon: "fa-layer-group",
        label: "Deployments",
        path: "/deployments",
      },
      { href: "#/jobs", icon: "fa-list-check", label: "Jobs", path: "/jobs" },
    ],
  },
  {
    label: "Cluster",
    items: [
      {
        href: "#/cluster",
        icon: "fa-server",
        label: "Cluster",
        path: "/cluster",
      },
      {
        href: "#/k8s-map",
        icon: "fa-diagram-project",
        label: "K8s Map",
        path: "/k8s-map",
      },
      {
        href: "#/configmaps",
        icon: "fa-file-code",
        label: "ConfigMaps",
        path: "/configmaps",
      },
      {
        href: "#/network",
        icon: "fa-network-wired",
        label: "Network",
        path: "/network",
      },
      {
        href: "#/storage",
        icon: "fa-hard-drive",
        label: "Storage",
        path: "/storage",
      },
      {
        href: "#/quotas",
        icon: "fa-scale-balanced",
        label: "Quotas",
        path: "/quotas",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        href: "#/settings",
        icon: "fa-gear",
        label: "Settings",
        path: "/settings",
      },
    ],
  },
];

export function Sidebar({
  isOpen,
  collapsed,
  onClose,
  onToggleCollapse,
}: SidebarProps) {
  const { pattern } = useRouter();

  const isActive = (target: string): boolean => {
    if (target === "/") {
      return pattern === "/" || pattern === "";
    }
    // "/deploy" が "/deployments" にマッチしないよう、
    // 完全一致またはサブパス（"/"続き）のみをアクティブとする
    return pattern === target || pattern.startsWith(`${target}/`);
  };

  return (
    <>
      {isOpen && <div class="overlay md:hidden" onClick={onClose} />}

      <aside
        class={`app-sidebar${collapsed ? " collapsed" : ""}`}
        style={
          isOpen ? "transform: translateX(0);" : "transform: translateX(-100%);"
        }
      >
        <nav class="py-2 flex flex-col" style="height: 100%">
          <div class="flex-1 overflow-y-auto">
            {NAV_GROUPS.map((group, gi) => (
              <div key={group.label}>
                {gi > 0 && (
                  <div class="sidebar-section-label">{group.label}</div>
                )}
                {group.items.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    class={`sidebar-nav-item${isActive(item.path) ? " active" : ""}`}
                    onClick={onClose}
                    title={collapsed ? item.label : undefined}
                  >
                    <i class={`fas ${item.icon} w-4 text-center shrink-0`} />
                    {!collapsed && <span>{item.label}</span>}
                  </a>
                ))}
              </div>
            ))}
          </div>

          {/* 折りたたみトグル（デスクトップのみ） */}
          <button
            type="button"
            class="sidebar-toggle-btn hidden md:flex"
            onClick={onToggleCollapse}
            title={collapsed ? "サイドバーを展開" : "サイドバーを折りたたむ"}
          >
            <i
              class={`fas ${collapsed ? "fa-angles-right" : "fa-angles-left"} text-[10px]`}
            />
            {!collapsed && <span class="ml-2 text-[11px]">折りたたむ</span>}
          </button>
        </nav>
      </aside>
    </>
  );
}
