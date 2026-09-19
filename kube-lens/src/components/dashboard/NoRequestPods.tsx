import type {} from "hono/jsx/dom";
import type { NoRequestPod } from "~/lib/cluster-resources";
import { Term } from "~/components/shared/Term";

export function NoRequestPods({ pods }: { pods: NoRequestPod[] }) {
  if (pods.length === 0) return null;

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
          <Term k="Requests">Request</Term>未設定 Pod ({pods.length}件)
        </h2>
        <a
          href="#/cluster"
          class="text-xs text-primary hover:underline cursor-pointer"
        >
          Cluster →
        </a>
      </div>
      <div class="divide-y" style="border-color: var(--border-default)">
        {pods.slice(0, 10).map((p) => (
          <div
            key={`${p.namespace}/${p.name}`}
            class="px-5 py-2.5 flex items-center gap-3"
          >
            <i
              class="fas fa-cube text-warning w-4 text-center text-xs"
              style="opacity: 0.7"
            />
            <div class="flex-1 min-w-0">
              <p
                class="text-xs font-medium truncate"
                style="color: var(--text-heading)"
              >
                {p.name}
              </p>
              <p class="text-[11px]" style="color: var(--text-muted)">
                {p.namespace}
                {p.missingCpu.length > 0 && (
                  <span> · CPU未設定: {p.missingCpu.join(", ")}</span>
                )}
                {p.missingMemory.length > 0 && (
                  <span> · Mem未設定: {p.missingMemory.join(", ")}</span>
                )}
              </p>
            </div>
          </div>
        ))}
        {pods.length > 10 && (
          <div class="px-5 py-2 text-center">
            <span class="text-[11px]" style="color: var(--text-muted)">
              他 {pods.length - 10} 件
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
