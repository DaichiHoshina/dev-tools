import { useK8sData } from "~/hooks/use-k8s";
import type { K8sClient } from "~/lib/k8s-client";
import type { Deployment } from "~/lib/types";
import { RefreshButton } from "~/components/shared/RefreshButton";
import { EmptyState } from "~/components/shared/EmptyState";
import { NamespaceSelector } from "~/components/shared/NamespaceSelector";

interface Props {
  client: K8sClient;
  selectedNamespaces: string[];
  namespaces: string[];
  onNamespacesChange: (ns: string[]) => void;
}

// ─── Deployment カード ───────────────────────────────────────────────

function DeploymentRow({ d }: { d: Deployment }) {
  const isUnhealthy = d.readyReplicas < d.desiredReplicas;
  const allReady =
    d.readyReplicas === d.desiredReplicas && d.desiredReplicas > 0;

  return (
    <div
      class="card-modern px-4 py-3"
      style={isUnhealthy ? "border-left: 3px solid oklch(var(--er))" : ""}
    >
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <i
              class={`fas ${allReady ? "fa-circle-check text-success" : isUnhealthy ? "fa-circle-exclamation text-error" : "fa-circle text-base-content/30"} text-xs shrink-0`}
            />
            <span
              class="text-sm font-medium truncate"
              style="color: var(--text-heading)"
            >
              {d.name}
            </span>
            <span class="k8s-badge text-[10px]">{d.namespace}</span>
          </div>
          {d.images[0] && (
            <p
              class="text-[11px] font-mono truncate mt-0.5 ml-5"
              style="color: var(--text-subtle)"
            >
              {d.images[0]}
            </p>
          )}
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <span
            class={`text-sm font-semibold tabular-nums ${isUnhealthy ? "text-error" : "text-success"}`}
          >
            {d.readyReplicas}/{d.desiredReplicas}
          </span>
          <span
            class="text-xs w-10 text-right"
            style="color: var(--text-subtle)"
          >
            {d.age}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── メインページ ────────────────────────────────────────────────────

export function DeployPage({
  client,
  selectedNamespaces,
  namespaces,
  onNamespacesChange,
}: Props) {
  const nsKey = selectedNamespaces.join(",");

  const {
    data: deployments,
    loading,
    error,
    refresh,
    lastUpdated,
  } = useK8sData(
    async () => {
      const results = await Promise.all(
        selectedNamespaces.map((ns) =>
          client.getDeploymentsInNamespace(ns).catch(() => [] as Deployment[]),
        ),
      );
      return results.flat();
    },
    client.config.refreshInterval,
    [nsKey],
  );

  // Deployments: unhealthy を上に
  const sortedDeploys = [...(deployments ?? [])].sort(
    (a, b) =>
      (a.readyReplicas < a.desiredReplicas ? -1 : 1) -
      (b.readyReplicas < b.desiredReplicas ? -1 : 1),
  );

  const unhealthyCount = sortedDeploys.filter(
    (d) => d.readyReplicas < d.desiredReplicas,
  ).length;

  return (
    <div>
      <div class="page-header">
        <div>
          <h1 class="page-title">
            Deployments
            <span
              class="text-sm font-normal ml-2"
              style="color: var(--text-muted)"
            >
              {client.config.environment.toUpperCase()}
            </span>
          </h1>
          <div class="mt-2">
            <NamespaceSelector
              selectedNamespaces={selectedNamespaces}
              namespaces={namespaces}
              onChange={onNamespacesChange}
            />
          </div>
        </div>
        <RefreshButton onRefresh={refresh} lastUpdated={lastUpdated} />
      </div>

      {error ? (
        <EmptyState
          icon="fa-plug-circle-exclamation"
          title="接続エラー"
          description={error}
          action={{ label: "再試行", onClick: refresh }}
        />
      ) : loading && !deployments ? (
        <div class="flex items-center justify-center py-16">
          <i
            class="fas fa-spinner fa-spin text-2xl"
            style="color: var(--text-muted)"
          />
        </div>
      ) : sortedDeploys.length === 0 ? (
        <EmptyState
          icon="fa-layer-group"
          title="Deployments がありません"
          description="選択した namespace に Deployment が見つかりませんでした"
        />
      ) : (
        <div>
          <h2
            class="text-xs font-semibold uppercase tracking-wider mb-2"
            style="color: var(--text-muted)"
          >
            <i class="fas fa-layer-group mr-1.5" />
            Deployments
            <span class="ml-2 font-normal normal-case">
              {sortedDeploys.length}件
            </span>
            {unhealthyCount > 0 && (
              <span class="text-error ml-1">({unhealthyCount}件異常)</span>
            )}
          </h2>
          <div class="space-y-2">
            {sortedDeploys.map((d) => (
              <DeploymentRow key={`${d.namespace}/${d.name}`} d={d} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
