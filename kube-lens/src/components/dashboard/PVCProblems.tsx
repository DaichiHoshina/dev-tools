import type {} from "hono/jsx/dom";
import type { PVC } from "~/lib/types";
import { Term } from "~/components/shared/Term";

export function PVCProblems({ pvcs }: { pvcs: PVC[] }) {
  const problems = pvcs.filter((p) => p.status !== "Bound");
  if (problems.length === 0) return null;

  return (
    <div
      class="card-modern overflow-hidden"
      style="border-left: 3px solid oklch(var(--er))"
    >
      <div
        class="px-5 py-3 border-b flex items-center justify-between"
        style="border-color: var(--border-default)"
      >
        <h2
          class="text-sm font-semibold flex items-center gap-2"
          style="color: var(--text-heading)"
        >
          <i class="fas fa-hard-drive text-error" />
          <Term k="PVC">PVC</Term> に問題あり ({problems.length}件)
        </h2>
        <a
          href="#/storage"
          class="text-xs text-primary hover:underline cursor-pointer"
        >
          Storage →
        </a>
      </div>
      <div class="divide-y" style="border-color: var(--border-default)">
        {problems.map((p) => (
          <div
            key={`${p.namespace}/${p.name}`}
            class="flex items-center gap-3 px-5 py-3"
          >
            <i
              class={`fas ${
                p.status === "Lost"
                  ? "fa-circle-xmark text-error"
                  : "fa-clock text-warning"
              } w-4 text-center`}
            />
            <div class="flex-1 min-w-0">
              <p
                class="text-sm font-medium truncate"
                style="color: var(--text-heading)"
              >
                {p.name}
              </p>
              <p class="text-xs" style="color: var(--text-muted)">
                {p.namespace} · {p.capacity} · {p.storageClass}
              </p>
            </div>
            <span
              class={`badge badge-sm ${
                p.status === "Lost" ? "badge-error" : "badge-warning"
              }`}
            >
              {p.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
