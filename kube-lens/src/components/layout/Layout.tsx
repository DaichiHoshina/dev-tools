import { useState } from "hono/jsx/dom";
import type { Child } from "hono/jsx";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { AlertBanner } from "./AlertBanner";
import type { K8sClient } from "~/lib/k8s-client";
import type { Project, Environment } from "~/lib/types";

const STORAGE_KEY = "kube-lens-sidebar-collapsed";

interface LayoutProps {
  project: Project;
  onProjectChange: (p: Project) => void;
  env: Environment;
  onEnvChange: (env: Environment) => void;
  connected: boolean;
  clusterInfo: string;
  apiUrl: string;
  client: K8sClient;
  selectedNamespaces: string[];
  children: Child;
}

export function Layout({
  project,
  onProjectChange,
  env,
  onEnvChange,
  connected,
  clusterInfo,
  apiUrl,
  client,
  selectedNamespaces,
  children,
}: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(
    localStorage.getItem(STORAGE_KEY) === "1",
  );

  const toggleCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <div class="min-h-screen" style="background: var(--bg-body)">
      <Header
        project={project}
        onProjectChange={onProjectChange}
        env={env}
        onEnvChange={onEnvChange}
        connected={connected}
        clusterInfo={clusterInfo}
        apiUrl={apiUrl}
        onSidebarToggle={() => setSidebarOpen((prev) => !prev)}
      />
      {connected && (
        <AlertBanner client={client} selectedNamespaces={selectedNamespaces} />
      )}
      <Sidebar
        isOpen={sidebarOpen}
        collapsed={sidebarCollapsed}
        onClose={() => setSidebarOpen(false)}
        onToggleCollapse={toggleCollapse}
      />
      <main
        class={`main-with-sidebar p-6${sidebarCollapsed ? " sidebar-collapsed" : ""}`}
      >
        <div class="page-content-wrapper">{children}</div>
      </main>
    </div>
  );
}
