import { useK8sData } from "~/hooks/use-k8s";
import type { K8sClient } from "~/lib/k8s-client";
import type { Ingress } from "~/lib/types";
import { RefreshButton } from "~/components/shared/RefreshButton";
import { EmptyState } from "~/components/shared/EmptyState";
import { NamespaceSelector } from "~/components/shared/NamespaceSelector";
import { PageGuide } from "~/components/shared/PageGuide";
import { Term } from "~/components/shared/Term";

interface Props {
  client: K8sClient;
  selectedNamespaces: string[];
  namespaces: string[];
  onNamespacesChange: (ns: string[]) => void;
}

function IngressCard({ ing }: { ing: Ingress }) {
  const hasTLS = ing.tls.length > 0;
  return (
    <div class="card-modern px-4 py-3">
      <div class="flex items-center justify-between gap-3 mb-2">
        <div class="flex items-center gap-2 min-w-0">
          <i
            class="fas fa-route text-xs shrink-0"
            style="color: var(--text-muted)"
          />
          <p
            class="text-sm font-medium truncate"
            style="color: var(--text-heading)"
          >
            {ing.name}
          </p>
          {hasTLS && <span class="badge badge-success badge-xs">TLS</span>}
        </div>
        <div class="flex items-center gap-3 shrink-0">
          {ing.namespace && (
            <span class="text-xs" style="color: var(--text-muted)">
              {ing.namespace}
            </span>
          )}
          <span
            class="text-xs w-10 text-right"
            style="color: var(--text-subtle)"
          >
            {ing.age}
          </span>
        </div>
      </div>
      <div class="ml-5 space-y-1">
        {ing.rules.map((rule, i) => (
          <div key={i}>
            <p
              class="text-[11px] font-semibold"
              style="color: var(--text-subtle)"
            >
              {rule.host}
            </p>
            {rule.paths.map((p, j) => (
              <div
                key={j}
                class="flex items-center gap-2 text-[11px] font-mono ml-2 mt-0.5"
                style="color: var(--text-muted)"
              >
                <span>{p.path}</span>
                <span style="color: var(--border-default)">→</span>
                <span>
                  {p.serviceName}:{String(p.servicePort)}
                </span>
                <span class="k8s-badge text-[10px]">{p.pathType}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function NetworkPage({
  client,
  selectedNamespaces,
  namespaces,
  onNamespacesChange,
}: Props) {
  const nsKey = selectedNamespaces.join(",");

  const {
    data: ingresses,
    loading,
    error,
    refresh,
    lastUpdated,
  } = useK8sData(
    async () => {
      const results = await Promise.all(
        selectedNamespaces.map((ns) =>
          client.getIngressesInNamespace(ns).catch(() => [] as Ingress[]),
        ),
      );
      return results.flat();
    },
    client.config.refreshInterval,
    [nsKey],
  );

  if (error) {
    return (
      <EmptyState
        icon="fa-plug-circle-exclamation"
        title="接続エラー"
        description={error}
        action={{ label: "再試行", onClick: refresh }}
      />
    );
  }

  const sorted = [...(ingresses ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <div>
      <div class="page-header">
        <div>
          <h1 class="page-title">
            Network
            {ingresses && (
              <span
                class="text-sm font-normal ml-2"
                style="color: var(--text-muted)"
              >
                Ingress {ingresses.length}件
              </span>
            )}
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

      <PageGuide id="network">
        <Term k="Ingress">Ingress</Term>
        は外部からのHTTPリクエストをサービスに振り分けるルールです。
        ホスト名・パス → サービス:ポートの対応を確認できます。
        <Term k="TLS">TLS</Term>
        バッジが付いているものはHTTPS対応済みです。
      </PageGuide>

      {loading && !ingresses ? (
        <div class="flex items-center justify-center py-16">
          <i
            class="fas fa-spinner fa-spin text-2xl"
            style="color: var(--text-muted)"
          />
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon="fa-network-wired"
          title="Ingress がありません"
          description="選択中の Namespace に Ingress が見つかりません"
        />
      ) : (
        <div class="space-y-2">
          {sorted.map((ing) => (
            <IngressCard
              key={`${ing.namespace}/${ing.name}`}
              ing={ing}
            />
          ))}
        </div>
      )}
    </div>
  );
}
