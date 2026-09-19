import type {} from "hono/jsx/dom";
import type { NodeGroupSummary } from "~/lib/cluster-resources";
import { formatCpu, formatMemoryGiB } from "~/lib/cluster-resources";
import { Term } from "~/components/shared/Term";

function percentColor(pct: number): string {
  if (pct >= 90) return "oklch(var(--er))";
  if (pct >= 80) return "oklch(var(--wa))";
  return "oklch(var(--su))";
}

interface Alert {
  group: string;
  resource: "CPU" | "Memory";
  pct: number;
  requested: string;
  allocatable: string;
  actual?: number;
  overProvision?: boolean;
}

function buildAlerts(groups: NodeGroupSummary[]): Alert[] {
  const alerts: Alert[] = [];
  for (const g of groups) {
    if (g.cpuPercent >= 80) {
      const overProvision =
        g.actualCpuPercent !== undefined &&
        g.cpuPercent - g.actualCpuPercent >= 40;
      alerts.push({
        group: g.group,
        resource: "CPU",
        pct: g.cpuPercent,
        requested: formatCpu(g.requestedCpu),
        allocatable: formatCpu(g.allocCpu),
        actual: g.actualCpuPercent,
        overProvision,
      });
    }
    if (g.memoryPercent >= 80) {
      const overProvision =
        g.actualMemoryPercent !== undefined &&
        g.memoryPercent - g.actualMemoryPercent >= 40;
      alerts.push({
        group: g.group,
        resource: "Memory",
        pct: g.memoryPercent,
        requested: formatMemoryGiB(g.requestedMemory),
        allocatable: formatMemoryGiB(g.allocMemory),
        actual: g.actualMemoryPercent,
        overProvision,
      });
    }
  }
  return alerts.sort((a, b) => b.pct - a.pct);
}

export function NodePressure({ groups }: { groups: NodeGroupSummary[] }) {
  const alerts = buildAlerts(groups);
  if (alerts.length === 0) return null;

  const hasCritical = alerts.some((a) => a.pct >= 90);

  return (
    <div
      class="card-modern overflow-hidden"
      style={`border-left: 3px solid ${hasCritical ? "oklch(var(--er))" : "oklch(var(--wa))"}`}
    >
      <div
        class="px-5 py-3 border-b flex items-center justify-between"
        style="border-color: var(--border-default)"
      >
        <h2
          class="text-sm font-semibold flex items-center gap-2"
          style="color: var(--text-heading)"
        >
          <i
            class={`fas fa-microchip ${hasCritical ? "text-error" : "text-warning"}`}
          />
          <Term k="Allocatable">ノードリソース</Term>逼迫 ({alerts.length}件)
        </h2>
        <a
          href="#/cluster"
          class="text-xs text-primary hover:underline cursor-pointer"
        >
          Cluster →
        </a>
      </div>
      <div class="divide-y" style="border-color: var(--border-default)">
        {alerts.map((a) => {
          const color = percentColor(a.pct);
          return (
            <div
              key={`${a.group}-${a.resource}`}
              class="px-5 py-3 flex items-center gap-3"
            >
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <p
                    class="text-sm font-medium truncate"
                    style="color: var(--text-heading)"
                  >
                    {a.group}
                  </p>
                  <span
                    class="badge badge-xs text-[10px]"
                    style={`background: ${color}; color: white`}
                  >
                    {a.resource}
                  </span>
                  {a.overProvision && (
                    <span
                      class="badge badge-xs badge-info text-[10px]"
                      title="Request量が実使用量より40%以上大きい。Request過大の可能性"
                    >
                      過大Request疑い
                    </span>
                  )}
                </div>
                <div class="flex items-center gap-3 mt-1">
                  <div
                    class="flex-1 h-1.5 rounded-full"
                    style="background: var(--border-default)"
                  >
                    <div
                      class="h-full rounded-full"
                      style={`width: ${Math.min(a.pct, 100)}%; background: ${color}`}
                    />
                  </div>
                  <span
                    class="text-xs font-mono w-9 text-right shrink-0"
                    style={`color: ${color}`}
                  >
                    {a.pct.toFixed(0)}%
                  </span>
                </div>
                <p class="text-[11px] mt-0.5" style="color: var(--text-muted)">
                  <Term k="Requests">Req</Term> {a.requested} /{" "}
                  <Term k="Allocatable">Alloc</Term> {a.allocatable}
                  {a.actual !== undefined && (
                    <span> · 実使用 {a.actual.toFixed(0)}%</span>
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
