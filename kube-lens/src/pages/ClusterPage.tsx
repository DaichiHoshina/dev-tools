import { useState } from "hono/jsx/dom";
import { useK8sData } from "~/hooks/use-k8s";
import type { K8sClient } from "~/lib/k8s-client";
import {
  fetchClusterResources,
  formatMemoryGiB,
  formatCpu,
  type NodeGroupSummary,
  type ClusterResourcesResult,
} from "~/lib/cluster-resources";
import { RefreshButton } from "~/components/shared/RefreshButton";
import { EmptyState } from "~/components/shared/EmptyState";
import { PageGuide } from "~/components/shared/PageGuide";
import { Term } from "~/components/shared/Term";
import { Tooltip } from "~/components/shared/Tooltip";

interface Props {
  client: K8sClient;
}

function percentColor(pct: number): string {
  if (pct >= 80) return "oklch(var(--er))";
  if (pct >= 60) return "oklch(var(--wa))";
  return "oklch(var(--su))";
}

function PercentBar({ value, actual }: { value: number; actual?: number }) {
  const color = percentColor(value);
  const actualColor = actual !== undefined ? percentColor(actual) : undefined;
  return (
    <div style="min-width: 100px">
      <div class="flex items-center gap-2">
        <div
          class="rounded-full overflow-hidden flex-1"
          style="height: 6px; background: var(--border-default)"
        >
          <div
            class="rounded-full"
            style={`height: 100%; width: ${Math.min(value, 100)}%; background: ${color}; transition: width 0.3s`}
          />
        </div>
        <span
          class="text-xs font-mono tabular-nums"
          style={`color: ${color}; min-width: 42px; text-align: right`}
        >
          {value.toFixed(1)}%
        </span>
      </div>
      {actual !== undefined && (
        <div class="flex items-center gap-2 mt-0.5">
          <div
            class="rounded-full overflow-hidden flex-1"
            style="height: 3px; background: var(--border-default)"
          >
            <div
              class="rounded-full"
              style={`height: 100%; width: ${Math.min(actual, 100)}%; background: ${actualColor}; transition: width 0.3s; opacity: 0.7`}
            />
          </div>
          <span
            class="text-[10px] font-mono tabular-nums"
            style={`color: ${actualColor}; min-width: 42px; text-align: right; opacity: 0.7`}
            title="実際の使用量 (metrics-server)"
          >
            {actual.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}

function computeTotals(rows: NodeGroupSummary[]): NodeGroupSummary {
  const t: NodeGroupSummary = {
    group: "Total",
    nodeCount: 0,
    allocCpu: 0,
    requestedCpu: 0,
    remainingCpu: 0,
    cpuPercent: 0,
    allocMemory: 0,
    requestedMemory: 0,
    remainingMemory: 0,
    memoryPercent: 0,
  };
  let hasActual = false;
  let totalActualCpu = 0;
  let totalActualMem = 0;

  for (const r of rows) {
    t.nodeCount += r.nodeCount;
    t.allocCpu += r.allocCpu;
    t.requestedCpu += r.requestedCpu;
    t.allocMemory += r.allocMemory;
    t.requestedMemory += r.requestedMemory;
    if (r.actualCpu !== undefined) {
      totalActualCpu += r.actualCpu;
      totalActualMem += r.actualMemory ?? 0;
      hasActual = true;
    }
  }
  t.remainingCpu = t.allocCpu - t.requestedCpu;
  t.remainingMemory = t.allocMemory - t.requestedMemory;
  t.cpuPercent = t.allocCpu > 0 ? (t.requestedCpu / t.allocCpu) * 100 : 0;
  t.memoryPercent =
    t.allocMemory > 0 ? (t.requestedMemory / t.allocMemory) * 100 : 0;

  if (hasActual) {
    t.actualCpu = totalActualCpu;
    t.actualMemory = totalActualMem;
    t.actualCpuPercent =
      t.allocCpu > 0 ? (totalActualCpu / t.allocCpu) * 100 : undefined;
    t.actualMemoryPercent =
      t.allocMemory > 0 ? (totalActualMem / t.allocMemory) * 100 : undefined;
  }
  return t;
}

const TH_CLASS = "px-4 py-2.5";

function GroupTable({ data }: { data: ClusterResourcesResult }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (group: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  return (
    <div
      class="overflow-x-auto rounded-xl border"
      style="background: var(--bg-surface); border-color: var(--border-default)"
    >
      <table class="w-full text-sm" style="border-collapse: collapse">
        <thead>
          <tr
            class="text-xs uppercase"
            style="color: var(--text-muted); border-bottom: 1px solid var(--border-default)"
          >
            <th class={`${TH_CLASS} text-left`}>
              <Tooltip text="Karpenter NodePool名。クリックでノード個別表示">
                <span class="term-text">Group</span>
              </Tooltip>
            </th>
            <th class={`${TH_CLASS} text-right`}>
              <Tooltip text="グループ内のノード台数">
                <span class="term-text">Nodes</span>
              </Tooltip>
            </th>
            <th class={`${TH_CLASS} text-right`}>
              <Tooltip text="ノードがPodに割り当てられるCPU総量（コア数）">
                <span class="term-text">Alloc CPU</span>
              </Tooltip>
            </th>
            <th class={`${TH_CLASS} text-right`}>
              <Tooltip text="Podが要求(requests)しているCPU合計">
                <span class="term-text">Req CPU</span>
              </Tooltip>
            </th>
            <th class={`${TH_CLASS} text-right`}>
              <Tooltip text="残りCPU = Alloc - Req。少ないと新Podが載らない">
                <span class="term-text">Rem CPU</span>
              </Tooltip>
            </th>
            <th class={`${TH_CLASS} text-left`}>
              <Tooltip text="CPU使用率 = Req ÷ Alloc。80%超は危険、60%超は注意">
                <span class="term-text">CPU %</span>
              </Tooltip>
            </th>
            <th class={`${TH_CLASS} text-right`}>
              <Tooltip text="ノードがPodに割り当てられるメモリ総量">
                <span class="term-text">Alloc Mem</span>
              </Tooltip>
            </th>
            <th class={`${TH_CLASS} text-right`}>
              <Tooltip text="Podが要求(requests)しているメモリ合計">
                <span class="term-text">Req Mem</span>
              </Tooltip>
            </th>
            <th class={`${TH_CLASS} text-right`}>
              <Tooltip text="残りメモリ = Alloc - Req。不足するとOOMKillの原因に">
                <span class="term-text">Rem Mem</span>
              </Tooltip>
            </th>
            <th class={`${TH_CLASS} text-left`}>
              <Tooltip text="メモリ使用率 = Req ÷ Alloc。80%超は危険、60%超は注意">
                <span class="term-text">Mem %</span>
              </Tooltip>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.groups.map((g) => {
            const isOpen = expanded.has(g.group);
            const groupNodes = data.nodesByGroup[g.group] ?? [];
            return (
              <>
                {/* グループ行 */}
                <tr
                  key={g.group}
                  style="cursor: pointer"
                  class="hover:bg-base-200"
                  onClick={() => toggle(g.group)}
                >
                  <td class="px-4 py-2.5 font-medium">
                    <i
                      class={`fas fa-chevron-right text-[10px] mr-2 transition-transform ${isOpen ? "rotate-90" : ""}`}
                      style="color: var(--text-muted)"
                    />
                    {g.group}
                  </td>
                  <td class="px-4 py-2.5 text-right font-mono">
                    {g.nodeCount}
                  </td>
                  <td class="px-4 py-2.5 text-right font-mono">
                    {formatCpu(g.allocCpu)}
                  </td>
                  <td class="px-4 py-2.5 text-right font-mono">
                    {formatCpu(g.requestedCpu)}
                  </td>
                  <td class="px-4 py-2.5 text-right font-mono">
                    {formatCpu(g.remainingCpu)}
                  </td>
                  <td class="px-4 py-2.5">
                    <PercentBar
                      value={g.cpuPercent}
                      actual={g.actualCpuPercent}
                    />
                  </td>
                  <td class="px-4 py-2.5 text-right font-mono">
                    {formatMemoryGiB(g.allocMemory)}
                  </td>
                  <td class="px-4 py-2.5 text-right font-mono">
                    {formatMemoryGiB(g.requestedMemory)}
                  </td>
                  <td class="px-4 py-2.5 text-right font-mono">
                    {formatMemoryGiB(g.remainingMemory)}
                  </td>
                  <td class="px-4 py-2.5">
                    <PercentBar
                      value={g.memoryPercent}
                      actual={g.actualMemoryPercent}
                    />
                  </td>
                </tr>
                {/* ノード展開行 */}
                {isOpen &&
                  groupNodes.map((n) => (
                    <tr
                      key={n.name}
                      style="background: var(--bg-surface); border-left: 3px solid var(--border-default)"
                    >
                      <td
                        class="px-4 py-2 text-xs"
                        style="padding-left: 2rem; color: var(--text-muted)"
                      >
                        <i class="fas fa-server text-[10px] mr-1.5" />
                        {n.name}
                        <span
                          class="ml-2 text-[10px]"
                          style="color: var(--text-subtle)"
                        >
                          ({n.podCount} pods)
                        </span>
                      </td>
                      <td class="px-4 py-2 text-right font-mono text-xs">1</td>
                      <td class="px-4 py-2 text-right font-mono text-xs">
                        {formatCpu(n.allocCpu)}
                      </td>
                      <td class="px-4 py-2 text-right font-mono text-xs">
                        {formatCpu(n.requestedCpu)}
                      </td>
                      <td class="px-4 py-2 text-right font-mono text-xs">
                        {formatCpu(Math.max(0, n.allocCpu - n.requestedCpu))}
                      </td>
                      <td class="px-4 py-2">
                        <PercentBar
                          value={n.cpuPercent}
                          actual={n.actualCpuPercent}
                        />
                      </td>
                      <td class="px-4 py-2 text-right font-mono text-xs">
                        {formatMemoryGiB(n.allocMemory)}
                      </td>
                      <td class="px-4 py-2 text-right font-mono text-xs">
                        {formatMemoryGiB(n.requestedMemory)}
                      </td>
                      <td class="px-4 py-2 text-right font-mono text-xs">
                        {formatMemoryGiB(
                          Math.max(0, n.allocMemory - n.requestedMemory),
                        )}
                      </td>
                      <td class="px-4 py-2">
                        <PercentBar
                          value={n.memoryPercent}
                          actual={n.actualMemoryPercent}
                        />
                      </td>
                    </tr>
                  ))}
              </>
            );
          })}
          {/* 合計行 */}
          {(() => {
            const total = computeTotals(data.groups);
            return (
              <tr style="border-top: 2px solid var(--border-default); background: var(--bg-surface)">
                <td class="px-4 py-2.5 font-semibold">{total.group}</td>
                <td class="px-4 py-2.5 text-right font-mono font-semibold">
                  {total.nodeCount}
                </td>
                <td class="px-4 py-2.5 text-right font-mono font-semibold">
                  {formatCpu(total.allocCpu)}
                </td>
                <td class="px-4 py-2.5 text-right font-mono font-semibold">
                  {formatCpu(total.requestedCpu)}
                </td>
                <td class="px-4 py-2.5 text-right font-mono font-semibold">
                  {formatCpu(total.remainingCpu)}
                </td>
                <td class="px-4 py-2.5 font-semibold">
                  <PercentBar
                    value={total.cpuPercent}
                    actual={total.actualCpuPercent}
                  />
                </td>
                <td class="px-4 py-2.5 text-right font-mono font-semibold">
                  {formatMemoryGiB(total.allocMemory)}
                </td>
                <td class="px-4 py-2.5 text-right font-mono font-semibold">
                  {formatMemoryGiB(total.requestedMemory)}
                </td>
                <td class="px-4 py-2.5 text-right font-mono font-semibold">
                  {formatMemoryGiB(total.remainingMemory)}
                </td>
                <td class="px-4 py-2.5 font-semibold">
                  <PercentBar
                    value={total.memoryPercent}
                    actual={total.actualMemoryPercent}
                  />
                </td>
              </tr>
            );
          })()}
        </tbody>
      </table>
    </div>
  );
}

function cpuRatioColor(req: number, actual: number | undefined): string {
  if (actual === undefined || req === 0) return "";
  const ratio = req / actual;
  if (ratio >= 20) return "oklch(var(--er))";
  if (ratio >= 5) return "oklch(var(--wa))";
  return "";
}

function TopPodsTable({ data }: { data: ClusterResourcesResult }) {
  if (data.topPods.length === 0) return null;
  const hasMetrics = data.topPods.some((p) => p.actualCpu !== undefined);
  return (
    <div
      class="overflow-x-auto rounded-xl border"
      style="background: var(--bg-surface); border-color: var(--border-default)"
    >
      <h2
        class="text-sm font-semibold px-4 pt-3 pb-2"
        style="color: var(--text-heading)"
      >
        Top Resource Consumers (CPU requests)
      </h2>
      <table class="w-full text-sm" style="border-collapse: collapse">
        <thead>
          <tr
            class="text-xs uppercase"
            style="color: var(--text-muted); border-bottom: 1px solid var(--border-default)"
          >
            <th class="px-4 py-2.5 text-right w-8">#</th>
            <th class="px-4 py-2.5 text-left">Pod</th>
            <th class="px-4 py-2.5 text-left">Namespace</th>
            <th class="px-4 py-2.5 text-left">Group</th>
            <th class="px-4 py-2.5 text-right">
              <Tooltip text="このPodが要求しているCPU量（コア数）">
                <span class="term-text">CPU Req</span>
              </Tooltip>
            </th>
            {hasMetrics && (
              <th class="px-4 py-2.5 text-right">
                <Tooltip text="実際のCPU使用量（metrics-server）。Reqとの乖離が大きいと過大Request">
                  <span class="term-text">CPU 実使用</span>
                </Tooltip>
              </th>
            )}
            <th class="px-4 py-2.5 text-right">
              <Tooltip text="このPodが要求しているメモリ量">
                <span class="term-text">Mem Req</span>
              </Tooltip>
            </th>
            {hasMetrics && (
              <th class="px-4 py-2.5 text-right">
                <Tooltip text="実際のメモリ使用量（metrics-server）">
                  <span class="term-text">Mem 実使用</span>
                </Tooltip>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {data.topPods.map((pod, i) => {
            const cpuColor = cpuRatioColor(pod.cpuRequest, pod.actualCpu);
            return (
              <tr
                key={`${pod.namespace}/${pod.name}`}
                class="hover:bg-base-200"
                style="border-bottom: 1px solid var(--border-subtle)"
              >
                <td
                  class="px-4 py-2 text-right font-mono text-xs"
                  style="color: var(--text-muted)"
                >
                  {i + 1}
                </td>
                <td class="px-4 py-2 font-mono text-xs truncate max-w-[300px]">
                  {pod.name}
                </td>
                <td class="px-4 py-2 text-xs" style="color: var(--text-muted)">
                  {pod.namespace}
                </td>
                <td class="px-4 py-2 text-xs" style="color: var(--text-muted)">
                  {pod.group}
                </td>
                <td
                  class="px-4 py-2 text-right font-mono text-xs font-medium"
                  style={cpuColor ? `color: ${cpuColor}` : ""}
                >
                  {formatCpu(pod.cpuRequest)}
                </td>
                {hasMetrics && (
                  <td
                    class="px-4 py-2 text-right font-mono text-xs"
                    style="color: var(--text-muted)"
                  >
                    {pod.actualCpu !== undefined
                      ? formatCpu(pod.actualCpu)
                      : "-"}
                  </td>
                )}
                <td class="px-4 py-2 text-right font-mono text-xs">
                  {formatMemoryGiB(pod.memoryRequest)}
                </td>
                {hasMetrics && (
                  <td
                    class="px-4 py-2 text-right font-mono text-xs"
                    style="color: var(--text-muted)"
                  >
                    {pod.actualMemory !== undefined
                      ? formatMemoryGiB(pod.actualMemory)
                      : "-"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NoRequestPodsTable({ data }: { data: ClusterResourcesResult }) {
  if (data.noRequestPods.length === 0) return null;
  return (
    <div
      class="overflow-x-auto rounded-xl border"
      style="background: var(--bg-surface); border-color: var(--border-default)"
    >
      <h2
        class="text-sm font-semibold px-4 pt-3 pb-2 flex items-center gap-2"
        style="color: var(--text-heading)"
      >
        <i class="fas fa-triangle-exclamation text-warning text-xs" />
        Request未設定 Pod ({data.noRequestPods.length}件)
      </h2>
      <table class="w-full text-sm" style="border-collapse: collapse">
        <thead>
          <tr
            class="text-xs uppercase"
            style="color: var(--text-muted); border-bottom: 1px solid var(--border-default)"
          >
            <th class="px-4 py-2.5 text-left">Pod</th>
            <th class="px-4 py-2.5 text-left">Namespace</th>
            <th class="px-4 py-2.5 text-left">Node</th>
            <th class="px-4 py-2.5 text-left">
              <Tooltip text="CPU requests が未設定のコンテナ">
                <span class="term-text">CPU未設定</span>
              </Tooltip>
            </th>
            <th class="px-4 py-2.5 text-left">
              <Tooltip text="Memory requests が未設定のコンテナ">
                <span class="term-text">Mem未設定</span>
              </Tooltip>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.noRequestPods.map((pod) => (
            <tr
              key={`${pod.namespace}/${pod.name}`}
              class="hover:bg-base-200"
              style="border-bottom: 1px solid var(--border-subtle)"
            >
              <td class="px-4 py-2 font-mono text-xs truncate max-w-[250px]">
                {pod.name}
              </td>
              <td class="px-4 py-2 text-xs" style="color: var(--text-muted)">
                {pod.namespace}
              </td>
              <td
                class="px-4 py-2 text-xs truncate max-w-[150px]"
                style="color: var(--text-muted)"
              >
                {pod.nodeName}
              </td>
              <td class="px-4 py-2 text-xs">
                {pod.missingCpu.length > 0 ? (
                  <span class="text-warning">{pod.missingCpu.join(", ")}</span>
                ) : (
                  <span style="color: var(--text-subtle)">-</span>
                )}
              </td>
              <td class="px-4 py-2 text-xs">
                {pod.missingMemory.length > 0 ? (
                  <span class="text-warning">
                    {pod.missingMemory.join(", ")}
                  </span>
                ) : (
                  <span style="color: var(--text-subtle)">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ClusterPage({ client }: Props) {
  const baseUrl =
    client.config.apiUrls[client.config.environment] ||
    `/k8s/${client.config.environment}`;

  const { data, loading, error, refresh, lastUpdated } = useK8sData(
    () => fetchClusterResources(baseUrl),
    client.config.refreshInterval,
    [client.config.environment],
  );

  return (
    <div>
      <div class="page-header">
        <div>
          <h1 class="page-title">Cluster Resources</h1>
          <p class="text-xs mt-1" style="color: var(--text-muted)">
            ノードグループ別リソース配分 (karpenter.sh/nodepool)
          </p>
        </div>
        <RefreshButton onRefresh={refresh} lastUpdated={lastUpdated} />
      </div>

      <PageGuide id="cluster">
        <Term k="NodePool">ノードグループ</Term>
        ごとのリソース配分を表示します。
        <Term k="CPUPercent">CPU%</Term>や<Term k="MemoryPercent">Mem%</Term>
        が80%を超えると新しい<Term k="Pod">Pod</Term>
        が起動できなくなるリスクがあります。 グループ行をクリックすると
        <Term k="Node">ノード</Term>
        個別の内訳を確認できます。 下部のランキングでは
        <Term k="Requests">Request</Term>
        量とmetrics-serverの実使用量を比較でき、過大Requestの特定に役立ちます。
        最下部では<Term k="Requests">Request</Term>
        未設定の<Term k="Pod">Pod</Term>を一覧表示します。
      </PageGuide>

      {error ? (
        <EmptyState
          icon="fa-plug-circle-exclamation"
          title="接続エラー"
          description={error}
          action={{ label: "再試行", onClick: refresh }}
        />
      ) : loading && !data ? (
        <div class="flex items-center justify-center py-24">
          <i
            class="fas fa-spinner fa-spin text-2xl"
            style="color: var(--text-muted)"
          />
        </div>
      ) : data && data.groups.length === 0 ? (
        <EmptyState
          icon="fa-server"
          title="ノードが見つかりません"
          description="クラスタにノードが存在しないか、APIへのアクセス権限がありません。"
          action={{ label: "再試行", onClick: refresh }}
        />
      ) : data ? (
        <div class="flex flex-col gap-4">
          <GroupTable data={data} />
          <TopPodsTable data={data} />
          <NoRequestPodsTable data={data} />
        </div>
      ) : null}
    </div>
  );
}
