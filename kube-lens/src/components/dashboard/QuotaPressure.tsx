import type {} from "hono/jsx/dom";
import type { ResourceQuota } from "~/lib/types";
import { parseQuantity } from "~/lib/quantity";
import { Term } from "~/components/shared/Term";

interface QuotaRow {
  resource: string;
  used: string;
  hard: string;
  pct: number;
}

function getHighRows(quota: ResourceQuota): QuotaRow[] {
  const rows: QuotaRow[] = [];
  for (const key of Object.keys(quota.hard)) {
    const hardVal = parseQuantity(quota.hard[key]);
    if (hardVal === 0) continue;
    const usedStr = quota.used[key] ?? "0";
    const pct = Math.round((parseQuantity(usedStr) / hardVal) * 100);
    if (pct >= 70) {
      rows.push({ resource: key, used: usedStr, hard: quota.hard[key], pct });
    }
  }
  return rows.sort((a, b) => b.pct - a.pct);
}

export function QuotaPressure({ quotas }: { quotas: ResourceQuota[] }) {
  const pressured = quotas
    .map((q) => ({ quota: q, rows: getHighRows(q) }))
    .filter(({ rows }) => rows.length > 0);

  if (pressured.length === 0) return null;

  return (
    <div
      class="card-modern overflow-hidden"
      style="border-left: 3px solid oklch(var(--wa))"
    >
      <div
        class="px-5 py-3 border-b flex items-center justify-between"
        style="border-color: var(--border-default)"
      >
        <h2
          class="text-sm font-semibold flex items-center gap-2"
          style="color: var(--text-heading)"
        >
          <i class="fas fa-gauge-high text-warning" />
          <Term k="ResourceQuota">Quota</Term> 使用率が高い ({pressured.length}
          件)
        </h2>
        <a
          href="#/quotas"
          class="text-xs text-primary hover:underline cursor-pointer"
        >
          Quotas →
        </a>
      </div>
      <div class="divide-y" style="border-color: var(--border-default)">
        {pressured.map(({ quota, rows }) => (
          <div
            key={`${quota.namespace}/${quota.name}`}
            class="px-5 py-3 space-y-2"
          >
            <p class="text-xs font-medium" style="color: var(--text-heading)">
              {quota.namespace}/{quota.name}
            </p>
            {rows.map((r) => {
              const color =
                r.pct >= 90
                  ? "oklch(var(--er))"
                  : r.pct >= 70
                    ? "oklch(var(--wa))"
                    : "oklch(var(--su))";
              return (
                <div key={r.resource} class="flex items-center gap-3">
                  <span
                    class="text-[11px] w-28 shrink-0 truncate"
                    style="color: var(--text-muted)"
                    title={r.resource}
                  >
                    {r.resource}
                  </span>
                  <div
                    class="flex-1 h-1.5 rounded-full"
                    style="background: var(--border-default)"
                  >
                    <div
                      class="h-full rounded-full"
                      style={`width: ${Math.min(r.pct, 100)}%; background: ${color}`}
                    />
                  </div>
                  <span
                    class="text-xs font-mono w-16 text-right shrink-0"
                    style={`color: ${color}`}
                  >
                    {r.used}/{r.hard}
                  </span>
                  <span
                    class="text-xs font-mono w-9 text-right shrink-0"
                    style={`color: ${color}`}
                  >
                    {r.pct}%
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
