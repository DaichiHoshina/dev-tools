import type { ArgoApplication } from "~/lib/types";
import { Term } from "~/components/shared/Term";

export function ArgoCDSummary({ apps }: { apps: ArgoApplication[] }) {
  const outOfSync = apps.filter((a) => a.syncStatus === "OutOfSync");
  if (outOfSync.length === 0) return null;

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
          <i class="fas fa-rotate text-warning" />
          <Term k="OutOfSync">OutOfSync</Term> のアプリ ({outOfSync.length}件)
        </h2>
        <a
          href="#/argocd"
          class="text-xs text-primary hover:underline cursor-pointer"
        >
          すべて見る →
        </a>
      </div>
      <div class="divide-y" style="border-color: var(--border-default)">
        {outOfSync.map((app) => (
          <div key={app.name} class="flex items-center gap-3 px-5 py-3">
            <i class="fas fa-arrow-rotate-left text-warning w-4 text-center" />
            <div class="flex-1 min-w-0">
              <p
                class="text-sm font-medium truncate"
                style="color: var(--text-heading)"
              >
                {app.name}
              </p>
              <p class="text-xs" style="color: var(--text-muted)">
                {app.destinationNamespace || "-"}
              </p>
            </div>
            <span class="badge badge-sm badge-warning">OutOfSync</span>
          </div>
        ))}
      </div>
    </div>
  );
}
