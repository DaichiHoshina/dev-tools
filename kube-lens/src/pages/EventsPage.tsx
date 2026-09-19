import { useState } from "hono/jsx/dom";
import { useK8sData } from "~/hooks/use-k8s";
import type { K8sClient } from "~/lib/k8s-client";
import type { K8sEvent } from "~/lib/types";
import { RefreshButton } from "~/components/shared/RefreshButton";
import { EmptyState } from "~/components/shared/EmptyState";
import { NamespaceSelector } from "~/components/shared/NamespaceSelector";
import { PageGuide } from "~/components/shared/PageGuide";
import { Term } from "~/components/shared/Term";
import { formatRelativeTime } from "~/lib/format";
import { getEventHint } from "~/lib/event-hints";

interface Props {
  client: K8sClient;
  selectedNamespaces: string[];
  namespaces: string[];
  onNamespacesChange: (ns: string[]) => void;
}

export function EventsPage({
  client,
  selectedNamespaces,
  namespaces,
  onNamespacesChange,
}: Props) {
  const nsKey = selectedNamespaces.join(",");
  const {
    data: events,
    loading,
    error,
    refresh,
    lastUpdated,
  } = useK8sData(
    async () => {
      const results = await Promise.all(
        selectedNamespaces.map((ns) =>
          client.getEventsInNamespace(ns).catch(() => [] as K8sEvent[]),
        ),
      );
      return results
        .flat()
        .sort(
          (a, b) =>
            new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime(),
        );
    },
    client.config.refreshInterval,
    [nsKey],
  );
  const [filter, setFilter] = useState<"all" | "Normal" | "Warning">("all");
  const [hideSafe, setHideSafe] = useState(false);

  const filtered = (events ?? [])
    .filter((e) => filter === "all" || e.type === filter)
    .filter((e) => !hideSafe || !getEventHint(e).safe);

  if (error) {
    return (
      <EmptyState
        icon="fa-plug-circle-exclamation"
        title="接続エラー"
        description={error}
        action={{ label: "再試行", onClick: refresh }}
      />
    );
  }

  return (
    <div>
      <div class="page-header">
        <div>
          <h1 class="page-title">Events</h1>
          <div class="mt-2">
            <NamespaceSelector
              selectedNamespaces={selectedNamespaces}
              namespaces={namespaces}
              onChange={onNamespacesChange}
            />
          </div>
        </div>
        <RefreshButton onRefresh={refresh} lastUpdated={lastUpdated} />
      </div>

      <PageGuide id="events">
        クラスタ内で起きた<Term k="Event">イベント</Term>の履歴です。
        <Term k="Warning">Warning</Term>{" "}
        タイプは問題の兆候なので優先的に確認してください。
        <Term k="Normal">Normal</Term> は正常な動作記録です。
      </PageGuide>

      <div class="filter-bar">
        {(["all", "Warning", "Normal"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            class={`filter-btn${filter === f ? " active" : ""}`}
          >
            {f === "all" ? "すべて" : f}
            {f !== "all" && events && (
              <span class="ml-1 opacity-60">
                ({events.filter((e) => e.type === f).length})
              </span>
            )}
          </button>
        ))}
        <label
          class="flex items-center gap-1.5 ml-auto text-xs cursor-pointer"
          style={{ color: "var(--text-muted)" }}
        >
          <input
            type="checkbox"
            class="checkbox checkbox-xs"
            checked={hideSafe}
            onChange={() => setHideSafe((v) => !v)}
          />
          一時的を非表示
        </label>
      </div>

      {loading && !events ? (
        <div class="flex items-center justify-center py-16">
          <i
            class="fas fa-spinner fa-spin text-2xl"
            style="color: var(--text-muted)"
          />
        </div>
      ) : (
        <div class="space-y-2">
          {filtered.length === 0 ? (
            <EmptyState
              icon="fa-bell-slash"
              title="イベントなし"
              description="イベントはありません"
            />
          ) : (
            filtered.map((ev) => {
              const hint = getEventHint(ev);
              const isSafe = hint.safe;
              const itemClass = isSafe
                ? "event-item event-item-muted"
                : `event-item ${ev.type === "Warning" ? "event-item-warning" : "event-item-normal"}`;
              return (
                <div
                  key={`${ev.namespace}-${ev.involvedObjectName}-${ev.reason}-${ev.lastTime}`}
                  class={itemClass}
                >
                  <i
                    class={`fas ${
                      isSafe
                        ? "fa-circle-check text-success"
                        : ev.type === "Warning"
                          ? "fa-triangle-exclamation text-warning"
                          : "fa-circle-info"
                    } text-sm mt-0.5 shrink-0`}
                    style={
                      !isSafe && ev.type !== "Warning"
                        ? "color: var(--text-subtle)"
                        : ""
                    }
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-baseline gap-2 flex-wrap">
                      <span
                        class={`text-xs font-semibold ${!isSafe && ev.type === "Warning" ? "text-error" : ""}`}
                        style={
                          isSafe || ev.type !== "Warning"
                            ? "color: var(--text-heading)"
                            : ""
                        }
                      >
                        <Term k={ev.reason}>{ev.reason}</Term>
                      </span>
                      {isSafe && (
                        <span class="event-safe-badge">
                          <i class="fas fa-shield-check text-[9px]" />
                          一時的
                        </span>
                      )}
                      <span class="k8s-badge">
                        {ev.involvedObjectKind}/{ev.involvedObjectName}
                      </span>
                      {ev.count > 1 && (
                        <span class="text-xs" style="color: var(--text-subtle)">
                          {ev.count}回
                        </span>
                      )}
                    </div>
                    <p class="text-xs mt-0.5" style="color: var(--text-muted)">
                      {ev.message}
                    </p>
                    {isSafe && (
                      <p class="text-xs mt-0.5" style="color: oklch(var(--su))">
                        <i class="fas fa-info-circle mr-1" />
                        {hint.hint}
                      </p>
                    )}
                    {ev.lastTime && (
                      <p class="text-xs mt-1" style="color: var(--text-subtle)">
                        {formatRelativeTime(ev.lastTime)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
