import { useK8sData } from "~/hooks/use-k8s";
import type { K8sClient } from "~/lib/k8s-client";
import type { ResourceQuota, LimitRange } from "~/lib/types";
import { parseQuantity } from "~/lib/quantity";
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

function UsageBar({ used, hard }: { used?: string; hard?: string }) {
  if (!hard || !used) return null;
  const hardVal = parseQuantity(hard);
  if (hardVal === 0) return null;
  const pct = Math.min(100, Math.round((parseQuantity(used) / hardVal) * 100));
  const colorClass =
    pct >= 90 ? "bg-error" : pct >= 70 ? "bg-warning" : "bg-success";
  return (
    <div class="flex items-center gap-2">
      <div
        class="flex-1 h-1.5 rounded-full overflow-hidden"
        style="background: var(--border-default)"
      >
        <div
          class={`h-full rounded-full ${colorClass}`}
          style={`width: ${pct}%`}
        />
      </div>
      <span
        class="text-[10px] w-8 text-right tabular-nums"
        style="color: var(--text-muted)"
      >
        {pct}%
      </span>
    </div>
  );
}

function ResourceQuotaCard({ rq }: { rq: ResourceQuota }) {
  const keys = Object.keys(rq.hard);
  return (
    <div class="card-modern px-4 py-3">
      <div class="flex items-center justify-between gap-3 mb-2">
        <div class="flex items-center gap-2">
          <i
            class="fas fa-scale-balanced text-xs shrink-0"
            style="color: var(--text-muted)"
          />
          <p class="text-sm font-medium" style="color: var(--text-heading)">
            {rq.name}
          </p>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          {rq.namespace && (
            <span class="text-xs" style="color: var(--text-muted)">
              {rq.namespace}
            </span>
          )}
          <span class="text-xs" style="color: var(--text-subtle)">
            {rq.age}
          </span>
        </div>
      </div>
      <div class="ml-5 space-y-1.5">
        {keys.map((key) => (
          <div key={key} class="text-[11px]">
            <div class="flex justify-between mb-0.5">
              <span class="font-mono" style="color: var(--text-subtle)">
                {key}
              </span>
              <span class="tabular-nums" style="color: var(--text-muted)">
                {rq.used[key] ?? "0"} / {rq.hard[key]}
              </span>
            </div>
            <UsageBar used={rq.used[key]} hard={rq.hard[key]} />
          </div>
        ))}
      </div>
    </div>
  );
}

function LimitRangeCard({ lr }: { lr: LimitRange }) {
  return (
    <div class="card-modern px-4 py-3">
      <div class="flex items-center justify-between gap-3 mb-2">
        <div class="flex items-center gap-2">
          <i
            class="fas fa-sliders text-xs shrink-0"
            style="color: var(--text-muted)"
          />
          <p class="text-sm font-medium" style="color: var(--text-heading)">
            {lr.name}
          </p>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          {lr.namespace && (
            <span class="text-xs" style="color: var(--text-muted)">
              {lr.namespace}
            </span>
          )}
          <span class="text-xs" style="color: var(--text-subtle)">
            {lr.age}
          </span>
        </div>
      </div>
      <div class="ml-5 space-y-1">
        {lr.limits.map((lim, i) => (
          <div key={i} class="text-[11px] flex flex-wrap items-center gap-2">
            <span class="k8s-badge text-[10px]">{lim.type}</span>
            {lim.max &&
              Object.entries(lim.max).map(([k, v]) => (
                <span key={k} style="color: var(--text-muted)">
                  max.{k}={v}
                </span>
              ))}
            {lim.min &&
              Object.entries(lim.min).map(([k, v]) => (
                <span key={k} style="color: var(--text-muted)">
                  min.{k}={v}
                </span>
              ))}
            {lim.default &&
              Object.entries(lim.default).map(([k, v]) => (
                <span key={k} style="color: var(--text-muted)">
                  default.{k}={v}
                </span>
              ))}
            {lim.defaultRequest &&
              Object.entries(lim.defaultRequest).map(([k, v]) => (
                <span key={k} style="color: var(--text-muted)">
                  req.{k}={v}
                </span>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function QuotaPage({
  client,
  selectedNamespaces,
  namespaces,
  onNamespacesChange,
}: Props) {
  const nsKey = selectedNamespaces.join(",");

  const {
    data: quotas,
    loading: qLoading,
    error: qError,
    refresh: qRefresh,
    lastUpdated: qUpdated,
  } = useK8sData(
    async () => {
      const results = await Promise.all(
        selectedNamespaces.map((ns) =>
          client
            .getResourceQuotasInNamespace(ns)
            .catch(() => [] as ResourceQuota[]),
        ),
      );
      return results.flat();
    },
    client.config.refreshInterval,
    [nsKey],
  );

  const {
    data: limitRanges,
    loading: lrLoading,
    error: lrError,
    refresh: lrRefresh,
  } = useK8sData(
    async () => {
      const results = await Promise.all(
        selectedNamespaces.map((ns) =>
          client.getLimitRangesInNamespace(ns).catch(() => [] as LimitRange[]),
        ),
      );
      return results.flat();
    },
    client.config.refreshInterval,
    [nsKey],
  );

  const loading = qLoading || lrLoading;
  const error = qError ?? lrError;
  const refresh = () => {
    qRefresh();
    lrRefresh();
  };
  const lastUpdated = qUpdated;

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

  const sortedQuotas = [...(quotas ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const sortedLRs = [...(limitRanges ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <div>
      <div class="page-header">
        <div>
          <h1 class="page-title">
            Quotas
            <span
              class="text-sm font-normal ml-2"
              style="color: var(--text-muted)"
            >
              ResourceQuota {quotas?.length ?? 0}件 / LimitRange{" "}
              {limitRanges?.length ?? 0}件
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

      <PageGuide id="quotas">
        <Term k="ResourceQuota">ResourceQuota</Term>
        はNamespace全体のリソース使用上限です。
        バーが赤（90%超）なら枯渇寸前で新しいPodが作れなくなります。
        <Term k="LimitRange">LimitRange</Term>
        は個々のコンテナのリソース上限・下限を定義します。
        defaultはコンテナに明示指定がない場合の自動適用値です。
      </PageGuide>

      {loading && !quotas ? (
        <div class="flex items-center justify-center py-16">
          <i
            class="fas fa-spinner fa-spin text-2xl"
            style="color: var(--text-muted)"
          />
        </div>
      ) : (
        <>
          <section class="mb-6">
            <h2
              class="text-sm font-semibold mb-3"
              style="color: var(--text-heading)"
            >
              <i class="fas fa-scale-balanced mr-1.5" />
              ResourceQuotas
            </h2>
            {sortedQuotas.length === 0 ? (
              <p class="text-sm" style="color: var(--text-muted)">
                ResourceQuota がありません
              </p>
            ) : (
              <div class="space-y-2">
                {sortedQuotas.map((rq) => (
                  <ResourceQuotaCard
                    key={`${rq.namespace}/${rq.name}`}
                    rq={rq}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2
              class="text-sm font-semibold mb-3"
              style="color: var(--text-heading)"
            >
              <i class="fas fa-sliders mr-1.5" />
              LimitRanges
            </h2>
            {sortedLRs.length === 0 ? (
              <p class="text-sm" style="color: var(--text-muted)">
                LimitRange がありません
              </p>
            ) : (
              <div class="space-y-2">
                {sortedLRs.map((lr) => (
                  <LimitRangeCard key={`${lr.namespace}/${lr.name}`} lr={lr} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
