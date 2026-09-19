import { useState, useEffect, useRef, useMemo } from "hono/jsx/dom";
import type { Project, Environment, K8sConfig } from "~/lib/types";
import { DEFAULT_CONFIG } from "~/lib/types";
import { createK8sClient } from "~/lib/k8s-client";
import { createMockK8sClient } from "~/data/mock";
import { useRouter } from "~/hooks/use-router";
import { Layout } from "~/components/layout/Layout";
import { DashboardPage } from "~/pages/DashboardPage";
import { PodsPage } from "~/pages/PodsPage";
import { DeploymentsPage } from "~/pages/DeploymentsPage";
import { EventsPage } from "~/pages/EventsPage";
import { LogsPage } from "~/pages/LogsPage";
import { SettingsPage } from "~/pages/SettingsPage";
import { ErrorLogsPage } from "~/pages/ErrorLogsPage";
import { DeployPage } from "~/pages/DeployPage";
import { ArgoCDPage } from "~/pages/ArgoCDPage";
import { ClusterPage } from "~/pages/ClusterPage";
import { MigrationPage } from "~/pages/MigrationPage";
import { JobsPage } from "~/pages/JobsPage";
import { ConfigMapsPage } from "~/pages/ConfigMapsPage";
import { NetworkPage } from "~/pages/NetworkPage";
import { StoragePage } from "~/pages/StoragePage";
import { QuotaPage } from "~/pages/QuotaPage";
import { K8sMapPage } from "~/pages/K8sMapPage";

const STORAGE_KEY_CONFIG = "kube-lens-config";
const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

const INFRA_NAMESPACES = new Set([
  "kube-system",
  "kube-public",
  "kube-node-lease",
  "default",
  "argocd",
  "istio-system",
  "istio-ingress",
  "istio-ingressgateway",
  "ingress-nginx",
  "ambassador",
  "fluentbit-cloudwatch",
  "opentelemetry",
  "prometheus",
]);

function loadConfig(): K8sConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, unknown>;
      const config = { ...DEFAULT_CONFIG, ...parsed } as K8sConfig;
      // Migration: old format had no project
      if (!config.project) {
        config.project = "default";
      }
      // Migration: old format had namespace (string)
      if (!Array.isArray(config.namespaces)) {
        config.namespaces =
          typeof parsed["namespace"] === "string"
            ? [parsed["namespace"] as string]
            : [...DEFAULT_CONFIG.namespaces];
      }
      return config;
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config: K8sConfig): void {
  localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
}

/**
 * Hono JSX は useEffect 内の非同期 setState が VDOM に反映されないバグがある。
 * 接続状態を単一 state にまとめ、useRef + click() workaround で更新する。
 */
interface ConnectionState {
  connected: boolean;
  clusterVersion: string;
  namespaces: string[];
  envLoading: boolean;
}

export function App() {
  const [config, setConfig] = useState<K8sConfig>(() => loadConfig());
  const [conn, setConn] = useState<ConnectionState>({
    connected: false,
    clusterVersion: "",
    namespaces: [],
    envLoading: false,
  });
  const { pattern } = useRouter();

  // Hono JSX workaround
  const pendingConnRef = useRef<ConnectionState | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const applyPendingConn = () => {
    const pending = pendingConnRef.current;
    if (!pending) return;
    pendingConnRef.current = null;
    setConn(pending);
  };

  const client = useMemo(
    () => (USE_MOCK ? createMockK8sClient() : createK8sClient(config)),
    [config.project, config.environment, config.refreshInterval],
  );

  // プロジェクト変更
  const handleProjectChange = (project: Project) => {
    if (project === config.project) return;
    setConn({
      connected: false,
      clusterVersion: "",
      namespaces: [],
      envLoading: true,
    });
    const newConfig = { ...config, project };
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  // 環境変更
  const handleEnvChange = (env: Environment) => {
    if (env === config.environment) return;
    setConn({
      connected: false,
      clusterVersion: "",
      namespaces: [],
      envLoading: true,
    });
    const newConfig = { ...config, environment: env };
    setConfig(newConfig);
    saveConfig(newConfig);
    localStorage.setItem("kube-lens-env", env);
  };

  // namespace選択変更（複数）
  const handleNamespacesChange = (nss: string[]) => {
    const newConfig = { ...config, namespaces: nss };
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  // 設定保存
  const handleConfigSave = (newConfig: K8sConfig) => {
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  // ブラウザタブにプロジェクト+環境名を表示
  useEffect(() => {
    document.title = `${config.project.toUpperCase()} ${config.environment.toUpperCase()}`;
  }, [config.project, config.environment]);

  // 接続確認 + クラスタ情報取得
  useEffect(() => {
    const load = () => {
      Promise.all([
        client.testConnection(),
        client.getNamespaces().catch(() => [] as string[]),
        client.getServerVersion().catch(() => ""),
      ]).then(([ok, nsList, ver]) => {
        pendingConnRef.current = {
          connected: ok,
          clusterVersion: ok ? ver : "",
          namespaces: ok
            ? nsList.filter((ns) => !INFRA_NAMESPACES.has(ns))
            : [],
          envLoading: false,
        };
        triggerRef.current?.click();
      });
    };

    load();
    const id = setInterval(load, config.refreshInterval);
    return () => clearInterval(id);
  }, [config.project, config.environment, config.refreshInterval]);

  const nsProps = {
    selectedNamespaces: config.namespaces,
    namespaces: conn.namespaces,
    onNamespacesChange: handleNamespacesChange,
  };

  // ページ選択
  const renderPage = () => {
    switch (pattern) {
      case "/pods/:name":
      case "/pods":
        return <PodsPage client={client} {...nsProps} />;
      case "/deployments":
        return <DeploymentsPage client={client} {...nsProps} />;
      case "/jobs":
        return <JobsPage client={client} {...nsProps} />;
      case "/events":
        return <EventsPage client={client} {...nsProps} />;
      case "/logs":
        return <LogsPage client={client} {...nsProps} />;
      case "/cluster":
        return <ClusterPage client={client} />;
      case "/migration":
        return <MigrationPage client={client} />;
      case "/deploy":
        return <DeployPage client={client} {...nsProps} />;
      case "/argocd":
        return <ArgoCDPage client={client} />;
      case "/configmaps":
        return <ConfigMapsPage client={client} {...nsProps} />;
      case "/network":
        return <NetworkPage client={client} {...nsProps} />;
      case "/storage":
        return <StoragePage client={client} {...nsProps} />;
      case "/quotas":
        return <QuotaPage client={client} {...nsProps} />;
      case "/k8s-map":
        return <K8sMapPage />;
      case "/error-logs":
        return <ErrorLogsPage client={client} {...nsProps} />;
      case "/settings":
        return <SettingsPage client={client} onConfigSave={handleConfigSave} />;
      default:
        return <DashboardPage client={client} {...nsProps} />;
    }
  };

  return (
    <Layout
      project={config.project}
      onProjectChange={handleProjectChange}
      env={config.environment}
      onEnvChange={handleEnvChange}
      connected={conn.connected}
      clusterInfo={conn.clusterVersion}
      apiUrl={`/k8s/${config.project}/${config.environment}`}
      client={client}
      selectedNamespaces={config.namespaces}
    >
      {/* Hono JSX workaround */}
      <span ref={triggerRef} onClick={applyPendingConn} style="display:none" />
      {conn.envLoading ? (
        <div class="flex flex-col items-center justify-center py-24 gap-3">
          <i
            class="fas fa-spinner fa-spin text-2xl"
            style="color: var(--text-muted)"
          />
          <p class="text-sm" style="color: var(--text-muted)">
            {config.environment} 環境に接続中...
          </p>
        </div>
      ) : (
        renderPage()
      )}
    </Layout>
  );
}
