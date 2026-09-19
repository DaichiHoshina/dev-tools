import type { NodeGroupSummary } from "~/lib/cluster-resources";

function PercentBar({ pct }: { pct: number }) {
  const color =
    pct >= 80
      ? "oklch(var(--er))"
      : pct >= 60
        ? "oklch(var(--wa))"
        : "oklch(var(--su))";
  return (
    <div class="flex items-center gap-2">
      <div
        class="flex-1 h-1.5 rounded-full"
        style="background: var(--border-default)"
      >
        <div
          class="h-full rounded-full"
          style={`width: ${Math.min(pct, 100).toFixed(0)}%; background: ${color}`}
        />
      </div>
      <span
        class="text-xs font-mono w-9 text-right shrink-0"
        style={`color: ${color}`}
      >
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

export function ClusterSummarySection({
  groups,
}: {
  groups: NodeGroupSummary[];
}) {
  const anyHigh = groups.some(
    (g) => g.cpuPercent >= 80 || g.memoryPercent >= 80,
  );

  return (
    <div
      class="card-modern overflow-hidden"
      style={`border-left: 3px solid ${anyHigh ? "oklch(var(--er))" : "oklch(var(--su))"}`}
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
            class={`fas fa-server ${anyHigh ? "text-error" : "text-success"}`}
          />
          クラスターリソース
        </h2>
        <a
          href="#/cluster"
          class="text-xs text-primary hover:underline cursor-pointer"
        >
          Cluster →
        </a>
      </div>
      <div class="px-5 py-3 space-y-3">
        {groups.map((g) => (
          <div key={g.group} class="flex items-center gap-4">
            <span
              class="text-xs font-medium w-16 shrink-0 truncate"
              style="color: var(--text-heading)"
              title={g.group}
            >
              {g.group}
            </span>
            <div class="flex-1 grid grid-cols-2 gap-3">
              <div>
                <span
                  class="text-[10px] uppercase tracking-wide"
                  style="color: var(--text-subtle)"
                >
                  CPU
                </span>
                <PercentBar pct={g.cpuPercent} />
              </div>
              <div>
                <span
                  class="text-[10px] uppercase tracking-wide"
                  style="color: var(--text-subtle)"
                >
                  MEM
                </span>
                <PercentBar pct={g.memoryPercent} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
