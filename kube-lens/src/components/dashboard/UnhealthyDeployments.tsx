import type { Deployment } from "~/lib/types";

export function UnhealthyDeployments({
  deployments,
}: {
  deployments: Deployment[];
}) {
  const unhealthy = deployments.filter(
    (d) => d.readyReplicas < d.desiredReplicas,
  );
  if (unhealthy.length === 0) return null;

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
          <i class="fas fa-triangle-exclamation text-warning" />
          レプリカ不足の Deployment ({unhealthy.length}件)
        </h2>
        <a
          href="#/deployments"
          class="text-xs text-primary hover:underline cursor-pointer"
        >
          すべて見る →
        </a>
      </div>
      <div class="divide-y" style="border-color: var(--border-default)">
        {unhealthy.map((d) => (
          <div key={d.name} class="flex items-center justify-between px-5 py-3">
            <div>
              <p class="text-sm font-medium" style="color: var(--text-heading)">
                {d.name}
              </p>
              <p class="text-xs" style="color: var(--text-muted)">
                Ready {d.readyReplicas}/{d.desiredReplicas} · {d.age}
              </p>
            </div>
            <span class="text-error text-sm font-semibold">
              {d.readyReplicas}/{d.desiredReplicas}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
