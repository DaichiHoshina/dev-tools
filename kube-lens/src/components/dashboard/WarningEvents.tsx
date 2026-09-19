import type { K8sEvent } from "~/lib/types";
import { formatRelativeTime } from "~/lib/format";
import { getEventHint } from "~/lib/event-hints";
import { Term } from "~/components/shared/Term";

export function WarningEvents({ events }: { events: K8sEvent[] }) {
  const warnings = events.filter((e) => e.type === "Warning").slice(0, 5);
  if (warnings.length === 0) return null;

  return (
    <div class="card-modern overflow-hidden">
      <div
        class="px-5 py-3 border-b flex items-center justify-between"
        style="border-color: var(--border-default)"
      >
        <h2
          class="text-sm font-semibold flex items-center gap-2"
          style="color: var(--text-heading)"
        >
          <i class="fas fa-bell text-warning" />
          最近の警告
        </h2>
        <a
          href="#/events"
          class="text-xs text-primary hover:underline cursor-pointer"
        >
          すべて見る →
        </a>
      </div>
      <div class="divide-y" style="border-color: var(--border-default)">
        {warnings.map((ev) => {
          const hint = getEventHint(ev);
          const isSafe = hint.safe;
          const evKey = `${ev.namespace}-${ev.involvedObjectName}-${ev.reason}-${ev.lastTime}`;
          return (
            <div
              key={evKey}
              class="flex items-start gap-3 px-5 py-3"
              style={isSafe ? "opacity: 0.55" : ""}
            >
              <i
                class={`fas ${isSafe ? "fa-circle-check text-success" : "fa-triangle-exclamation text-warning"} text-xs mt-1 shrink-0`}
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-2 flex-wrap">
                  <span
                    class={`text-xs font-semibold ${isSafe ? "" : "text-error"}`}
                    style={isSafe ? "color: var(--text-heading)" : ""}
                  >
                    <Term k={ev.reason}>{ev.reason}</Term>
                  </span>
                  {isSafe && (
                    <span class="event-safe-badge">
                      <i class="fas fa-shield-check text-[9px]" />
                      一時的
                    </span>
                  )}
                  <span class="k8s-badge">{ev.involvedObjectName}</span>
                  {ev.count > 1 && (
                    <span class="text-xs" style="color: var(--text-subtle)">
                      {ev.count}回
                    </span>
                  )}
                </div>
                <p
                  class="text-xs mt-0.5 line-clamp-1"
                  style="color: var(--text-muted)"
                >
                  {ev.message}
                </p>
                {isSafe && (
                  <p class="text-xs mt-0.5" style="color: oklch(var(--su))">
                    <i class="fas fa-info-circle mr-1" />
                    {hint.hint}
                  </p>
                )}
              </div>
              <span class="text-xs shrink-0" style="color: var(--text-subtle)">
                {formatRelativeTime(ev.lastTime)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
