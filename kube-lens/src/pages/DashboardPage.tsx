import { useState, useEffect, useRef } from "hono/jsx/dom";
import { useK8sData } from "~/hooks/use-k8s";
import type { K8sClient } from "~/lib/k8s-client";
import type {
  Job,
  ConfigMap,
  Secret,
  Ingress,
  PVC,
  ResourceQuota,
} from "~/lib/types";
import { EmptyState } from "~/components/shared/EmptyState";
import { RefreshButton } from "~/components/shared/RefreshButton";
import { NamespaceSelector } from "~/components/shared/NamespaceSelector";
import { PageGuide } from "~/components/shared/PageGuide";
import { Term } from "~/components/shared/Term";
import { isHiddenApp } from "~/lib/argo-filters";
import { getOverrides } from "~/lib/image-override-client";
import type { OverrideEnv, OverrideMap } from "~/lib/image-override-client";
import { fetchClusterResources } from "~/lib/cluster-resources";
import { fetchMigrationVersion } from "~/lib/migration-client";
import type { ServiceVersionState } from "~/lib/migration-client";
import { MIGRATION_SERVICES } from "~/lib/migration-config";
import { ProblemPods } from "~/components/dashboard/ProblemPods";
import { UnhealthyDeployments } from "~/components/dashboard/UnhealthyDeployments";
import { WarningEvents } from "~/components/dashboard/WarningEvents";
import { HealthyOverview } from "~/components/dashboard/HealthyOverview";
import { ArgoCDSummary } from "~/components/dashboard/ArgoCDSummary";
import { AllHealthy } from "~/components/dashboard/AllHealthy";
import { ImageOverrideSection } from "~/components/dashboard/ImageOverrideSection";
import { MigrationSummarySection } from "~/components/dashboard/MigrationSummarySection";
import { ClusterSummarySection } from "~/components/dashboard/ClusterSummarySection";
import { FailedJobsSummary } from "~/components/dashboard/FailedJobsSummary";
import { ResourceSummaryCards } from "~/components/dashboard/ResourceSummaryCards";
import { PVCProblems } from "~/components/dashboard/PVCProblems";
import { QuotaPressure } from "~/components/dashboard/QuotaPressure";
import { IngressOverview } from "~/components/dashboard/IngressOverview";
import { NodePressure } from "~/components/dashboard/NodePressure";
import { NoRequestPods } from "~/components/dashboard/NoRequestPods";

interface Props {
  client: K8sClient;
  selectedNamespaces: string[];
  namespaces: string[];
  onNamespacesChange: (ns: string[]) => void;
}

async function fetchMultiNS<T>(
  namespaces: string[],
  fetcher: (ns: string) => Promise<T[]>,
): Promise<T[]> {
  const results = await Promise.all(
    namespaces.map((ns) => fetcher(ns).catch(() => [] as T[])),
  );
  return results.flat();
}

export function DashboardPage({
  client,
  selectedNamespaces,
  namespaces,
  onNamespacesChange,
}: Props) {
  const nsKey = selectedNamespaces.join(",");
  const baseUrl = `/k8s/${client.config.environment}`;

  // --- K8s data ---
  const pods = useK8sData(
    () =>
      fetchMultiNS(selectedNamespaces, (ns) => client.getPodsInNamespace(ns)),
    client.config.refreshInterval,
    [nsKey],
  );
  const deployments = useK8sData(
    () =>
      fetchMultiNS(selectedNamespaces, (ns) =>
        client.getDeploymentsInNamespace(ns),
      ),
    client.config.refreshInterval,
    [nsKey],
  );
  const events = useK8sData(
    () =>
      fetchMultiNS(selectedNamespaces, (ns) =>
        client.getEventsInNamespace(ns),
      ).then((evs) =>
        evs.sort(
          (a, b) =>
            new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime(),
        ),
      ),
    client.config.refreshInterval,
    [nsKey],
  );
  const argoApps = useK8sData(
    () => client.getArgoApplications(),
    client.config.refreshInterval,
    [],
  );

  // --- Image overrides (dev/staging only) ---
  const isOverrideEnv =
    client.config.environment === "dev" ||
    client.config.environment === "staging";
  const overrides = useK8sData(
    () =>
      isOverrideEnv
        ? getOverrides(
            client.config.project,
            client.config.environment as OverrideEnv,
          )
        : Promise.resolve({} as OverrideMap),
    client.config.refreshInterval,
    [client.config.project, client.config.environment],
  );

  // --- Jobs (失敗Job検出) ---
  const jobsData = useK8sData(
    async () => {
      const results = await Promise.all(
        selectedNamespaces.map((ns) =>
          client.getJobsInNamespace(ns).catch(() => [] as Job[]),
        ),
      );
      return results.flat();
    },
    client.config.refreshInterval,
    [nsKey],
  );

  // --- Resource overview (ConfigMap, Secret, Ingress, PVC, Quota) ---
  const configMapsData = useK8sData(
    () =>
      fetchMultiNS(selectedNamespaces, (ns) =>
        client.getConfigMapsInNamespace(ns),
      ),
    client.config.refreshInterval,
    [nsKey],
  );
  const secretsData = useK8sData(
    () =>
      fetchMultiNS(selectedNamespaces, (ns) =>
        client.getSecretsInNamespace(ns),
      ),
    client.config.refreshInterval,
    [nsKey],
  );
  const ingressesData = useK8sData(
    () =>
      fetchMultiNS(selectedNamespaces, (ns) =>
        client.getIngressesInNamespace(ns),
      ),
    client.config.refreshInterval,
    [nsKey],
  );
  const pvcsData = useK8sData(
    () =>
      fetchMultiNS(selectedNamespaces, (ns) => client.getPVCsInNamespace(ns)),
    client.config.refreshInterval,
    [nsKey],
  );
  const quotasData = useK8sData(
    () =>
      fetchMultiNS(selectedNamespaces, (ns) =>
        client.getResourceQuotasInNamespace(ns),
      ),
    client.config.refreshInterval,
    [nsKey],
  );

  // --- Cluster resources ---
  const clusterData = useK8sData(
    () => fetchClusterResources(baseUrl),
    client.config.refreshInterval,
    [client.config.environment],
  );

  // --- Migration (WebSocket exec → ref+click workaround) ---
  const [migState, setMigState] = useState<{
    services: ServiceVersionState[];
    loading: boolean;
  }>({ services: [], loading: true });
  const pendingMigRef = useRef<{
    services: ServiceVersionState[];
    loading: boolean;
  } | null>(null);
  const migTriggerRef = useRef<HTMLSpanElement>(null);

  const applyPendingMig = () => {
    if (!pendingMigRef.current) return;
    setMigState(pendingMigRef.current);
    pendingMigRef.current = null;
  };

  const refreshMigration = () => {
    Promise.all(
      MIGRATION_SERVICES.map((svc) => fetchMigrationVersion(baseUrl, svc)),
    )
      .then((services) => {
        pendingMigRef.current = { services, loading: false };
        migTriggerRef.current?.click();
      })
      .catch((err) => {
        console.warn("Migration fetch failed:", err);
        pendingMigRef.current = { services: [], loading: false };
        migTriggerRef.current?.click();
      });
  };

  useEffect(() => {
    const ac = new AbortController();
    const doFetch = () => {
      Promise.all(
        MIGRATION_SERVICES.map((svc) =>
          fetchMigrationVersion(baseUrl, svc, ac.signal),
        ),
      )
        .then((services) => {
          pendingMigRef.current = { services, loading: false };
          migTriggerRef.current?.click();
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;
          console.warn("Migration fetch failed:", err);
          pendingMigRef.current = { services: [], loading: false };
          migTriggerRef.current?.click();
        });
    };
    doFetch();
    const id = setInterval(doFetch, client.config.refreshInterval);
    return () => {
      clearInterval(id);
      ac.abort();
    };
  }, [client.config.environment, client.config.refreshInterval]);

  // --- Render ---
  const anyError = pods.error ?? deployments.error ?? events.error;
  const anyLoading = pods.loading || deployments.loading || events.loading;

  if (anyError) {
    return (
      <EmptyState
        icon="fa-plug-circle-exclamation"
        title="kubectl proxy に接続できません"
        description={`${anyError}\n\nターミナルで「kubectl proxy」を実行してから再試行してください。`}
        action={{
          label: "再試行",
          onClick: () => {
            pods.refresh();
            deployments.refresh();
            events.refresh();
          },
        }}
      />
    );
  }

  const podData = pods.data ?? [];
  const deployData = deployments.data ?? [];
  const eventData = events.data ?? [];

  const hasProblems =
    podData.some(
      (p) =>
        p.phase === "Failed" ||
        p.phase === "CrashLoopBackOff" ||
        p.phase === "Pending",
    ) ||
    deployData.some((d) => d.readyReplicas < d.desiredReplicas) ||
    eventData.some((e) => e.type === "Warning");

  return (
    <div>
      {/* Hono JSX workaround: migration async setState */}
      <span
        ref={migTriggerRef}
        onClick={applyPendingMig}
        style="display:none"
      />

      <div class="page-header">
        <div>
          <h1 class="page-title">ダッシュボード</h1>
          <div class="mt-2">
            <NamespaceSelector
              selectedNamespaces={selectedNamespaces}
              namespaces={namespaces}
              onChange={onNamespacesChange}
            />
          </div>
        </div>
        <RefreshButton
          onRefresh={() => {
            pods.refresh();
            deployments.refresh();
            events.refresh();
            argoApps.refresh();
            overrides.refresh();
            jobsData.refresh();
            configMapsData.refresh();
            secretsData.refresh();
            ingressesData.refresh();
            pvcsData.refresh();
            quotasData.refresh();
            clusterData.refresh();
            refreshMigration();
          }}
          lastUpdated={pods.lastUpdated}
        />
      </div>

      <PageGuide id="dashboard">
        全体の健康状態をひと目で確認できます。赤いカードがあれば対応が必要です。
        1段目は <Term k="Pod">Pod</Term> 合計・正常稼働数・
        <Term k="Deployment">Deployment</Term> 正常数・
        <Term k="Restart">再起動</Term>合計。2段目は{" "}
        <Term k="Ingress">Ingress</Term> 数・
        <Term k="ConfigMap">CM</Term>/<Term k="Secret">Secret</Term> 数・
        <Term k="PVC">PVC</Term> 状態・
        <Term k="ResourceQuota">Quota</Term> 最大使用率です。
      </PageGuide>

      {anyLoading && !pods.data ? (
        <div class="flex items-center justify-center py-16">
          <i
            class="fas fa-spinner fa-spin text-2xl"
            style="color: var(--text-muted)"
          />
        </div>
      ) : (
        <div class="space-y-5">
          <HealthyOverview pods={podData} deployments={deployData} />
          <ResourceSummaryCards
            ingresses={ingressesData.data ?? []}
            configMaps={configMapsData.data ?? []}
            secrets={secretsData.data ?? []}
            pvcs={pvcsData.data ?? []}
            quotas={quotasData.data ?? []}
          />
          {!hasProblems && podData.length > 0 && <AllHealthy />}
          <ProblemPods pods={podData} />
          <PVCProblems pvcs={pvcsData.data ?? []} />
          <FailedJobsSummary jobs={jobsData.data ?? []} />
          <UnhealthyDeployments deployments={deployData} />
          <WarningEvents events={eventData} />
          {clusterData.data && (
            <NodePressure groups={clusterData.data.groups} />
          )}
          {clusterData.data && clusterData.data.noRequestPods.length > 0 && (
            <NoRequestPods pods={clusterData.data.noRequestPods} />
          )}
          <QuotaPressure quotas={quotasData.data ?? []} />
          <IngressOverview ingresses={ingressesData.data ?? []} />
          <ArgoCDSummary
            apps={(argoApps.data ?? []).filter((a) => !isHiddenApp(a.name))}
          />

          {/* Deploy image overrides (dev/tes only) */}
          {isOverrideEnv && overrides.data != null && (
            <ImageOverrideSection overrides={overrides.data} />
          )}

          {/* Migration version summary */}
          <MigrationSummarySection
            services={migState.services}
            loading={migState.loading}
          />

          {/* Cluster resource overview */}
          {clusterData.data && clusterData.data.groups.length > 0 && (
            <ClusterSummarySection groups={clusterData.data.groups} />
          )}
        </div>
      )}
    </div>
  );
}
