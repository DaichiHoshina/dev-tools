import type {} from "hono/jsx/dom";
import type { Pod } from "~/lib/types";
import { navigate } from "~/lib/router";

const RECENT_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24時間

export function ProblemPods({ pods }: { pods: Pod[] }) {
  const now = Date.now();
  const problems = pods.filter(
    (p) =>
      (p.phase === "Failed" ||
        p.phase === "CrashLoopBackOff" ||
        p.phase === "Pending") &&
      (!p.startTime ||
        now - new Date(p.startTime).getTime() < RECENT_THRESHOLD_MS),
  );
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
          <i class="fas fa-circle-exclamation text-error" />
          注意が必要な Pod ({problems.length}件)
        </h2>
        <a
          href="#/pods"
          class="text-xs text-primary hover:underline cursor-pointer"
        >
          すべて見る →
        </a>
      </div>
      <div class="divide-y" style="border-color: var(--border-default)">
        {problems.map((p) => (
          <div
            key={p.name}
            class="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-base-200/50 transition-colors"
            onClick={() => navigate(`/pods/${p.name}`)}
          >
            <i
              class={`fas ${
                p.phase === "CrashLoopBackOff"
                  ? "fa-arrows-rotate text-error"
                  : p.phase === "Failed"
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
                {p.phase}
                {p.restarts > 0 && ` · 再起動 ${p.restarts}回`}
                {p.containers[0]?.stateReason &&
                  ` · ${p.containers[0].stateReason}`}
              </p>
            </div>
            <span
              class={`badge badge-sm ${
                p.phase === "Pending" ? "badge-warning" : "badge-error"
              }`}
            >
              {p.phase}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
