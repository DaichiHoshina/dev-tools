import { useState, useEffect } from "hono/jsx/dom";
import { useK8sData } from "~/hooks/use-k8s";
import type { K8sClient } from "~/lib/k8s-client";
import type { Pod, PodPhase, K8sEvent } from "~/lib/types";
import { StatusBadge } from "~/components/shared/StatusBadge";
import { RefreshButton } from "~/components/shared/RefreshButton";
import { EmptyState } from "~/components/shared/EmptyState";
import { NamespaceSelector } from "~/components/shared/NamespaceSelector";
import { PageGuide } from "~/components/shared/PageGuide";
import { Term } from "~/components/shared/Term";
import { WebTerminal } from "~/components/terminal/WebTerminal";
import { formatRelativeTime } from "~/lib/format";
import { navigate } from "~/lib/router";

interface Props {
  client: K8sClient;
  selectedNamespaces: string[];
  namespaces: string[];
  onNamespacesChange: (ns: string[]) => void;
}

export function PodsPage({
  client,
  selectedNamespaces,
  namespaces,
  onNamespacesChange,
}: Props) {
  const nsKey = selectedNamespaces.join(",");
  const {
    data: pods,
    loading,
    error,
    refresh,
    lastUpdated,
  } = useK8sData(
    async () => {
      const results = await Promise.all(
        selectedNamespaces.map((ns) =>
          client.getPodsInNamespace(ns).catch(() => [] as Pod[]),
        ),
      );
      return results.flat();
    },
    client.config.refreshInterval,
    [nsKey],
  );
  const [deleteError, setDeleteError] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<PodPhase | "all">("all");
  const [searchText, setSearchText] = useState<string>("");
  const [selectedPod, setSelectedPod] = useState<Pod | null>(null);
  const [podEvents, setPodEvents] = useState<K8sEvent[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [terminalPod, setTerminalPod] = useState<{
    name: string;
    namespace: string;
    container?: string;
  } | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<boolean>(false);

  // Pod選択時にイベントを取得
  useEffect(() => {
    if (!selectedPod) {
      setPodEvents([]);
      return;
    }
    let cancelled = false;
    void client
      .getPodEvents(selectedPod.namespace, selectedPod.name)
      .then((events) => {
        if (!cancelled) setPodEvents(events);
      })
      .catch(() => {
        if (!cancelled) setPodEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPod?.name, selectedPod?.namespace]);

  const filtered = (pods ?? []).filter((p) => {
    const matchStatus = filterStatus === "all" || p.phase === filterStatus;
    const matchSearch =
      !searchText || p.name.toLowerCase().includes(searchText.toLowerCase());
    return matchStatus && matchSearch;
  });

  const statusOrder: PodPhase[] = [
    "Failed",
    "CrashLoopBackOff",
    "Pending",
    "Unknown",
    "Terminating",
    "Running",
    "Succeeded",
  ];
  const sorted = [...filtered].sort(
    (a, b) => statusOrder.indexOf(a.phase) - statusOrder.indexOf(b.phase),
  );

  const handleDelete = async () => {
    if (!selectedPod) return;
    setDeleting(true);
    try {
      await client.deletePod(selectedPod.namespace, selectedPod.name);
      setSelectedPod(null);
      setShowDeleteConfirm(false);
      refresh();
    } catch (err) {
      setDeleteError(
        `削除に失敗しました: ${err instanceof Error ? err.message : "不明なエラー"}`,
      );
      setTimeout(() => setDeleteError(""), 5000);
    } finally {
      setDeleting(false);
    }
  };

  const handleCopyExecCmd = (pod: Pod, container?: string) => {
    const cmd = `kubectl exec -it ${pod.name} -n ${pod.namespace}${container ? ` -c ${container}` : ""} -- /bin/sh`;
    void navigator.clipboard.writeText(cmd).then(() => {
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2000);
    });
  };

  const handleOpenTerminal = (pod: Pod, container?: string) => {
    setTerminalPod({ name: pod.name, namespace: pod.namespace, container });
    setSelectedPod(null);
  };

  if (error) {
    return (
      <EmptyState
        icon="fa-plug-circle-exclamation"
        title="kubectl proxy に接続できません"
        description={error}
        action={{ label: "再試行", onClick: refresh }}
      />
    );
  }

  // Web Terminal
  if (terminalPod) {
    const wsUrl = client.getExecWebSocketUrl(
      terminalPod.namespace,
      terminalPod.name,
      terminalPod.container,
    );
    return (
      <WebTerminal
        wsUrl={wsUrl}
        podName={terminalPod.name}
        containerName={terminalPod.container}
        onClose={() => setTerminalPod(null)}
      />
    );
  }

  return (
    <div>
      <div class="page-header">
        <div>
          <h1 class="page-title">Pods</h1>
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

      <PageGuide id="pods">
        動いている<Term k="Container">コンテナ</Term>の一覧です。 Statusが{" "}
        <Term k="Running">Running</Term> 以外のものは要確認。
        <Term k="Restart">再起動</Term>
        回数が多いものは不安定な可能性があります。
        行をクリックすると詳細を確認できます。
      </PageGuide>

      {/* フィルタバー */}
      <div class="filter-bar flex-wrap">
        {(
          ["all", "Running", "Pending", "Failed", "CrashLoopBackOff"] as const
        ).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilterStatus(s)}
            class={`filter-btn${filterStatus === s ? " active" : ""}`}
          >
            {s === "all" ? "すべて" : s}
            {s !== "all" && pods && (
              <span class="ml-1 opacity-60">
                ({pods.filter((p) => p.phase === s).length})
              </span>
            )}
          </button>
        ))}
        <input
          type="text"
          placeholder="Pod名で検索..."
          value={searchText}
          onInput={(e) => setSearchText((e.target as HTMLInputElement).value)}
          class="search-input ml-auto w-48"
        />
      </div>

      {loading && !pods ? (
        <div class="flex items-center justify-center py-16">
          <i
            class="fas fa-spinner fa-spin text-2xl"
            style="color: var(--text-muted)"
          />
        </div>
      ) : (
        <div class="data-table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Ready</th>
                <th>Restarts</th>
                <th>Age</th>
                <th>Node</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colspan={6}
                    class="text-center py-8"
                    style="color: var(--text-muted)"
                  >
                    Pod が見つかりません
                  </td>
                </tr>
              ) : (
                sorted.map((pod) => (
                  <tr
                    key={`${pod.namespace}/${pod.name}`}
                    onClick={() => setSelectedPod(pod)}
                  >
                    <td>
                      <span
                        class="font-medium text-sm"
                        style="color: var(--text-heading)"
                      >
                        {pod.name}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={pod.phase} />
                    </td>
                    <td class="text-sm" style="color: var(--text-muted)">
                      {pod.readyContainers}/{pod.totalContainers}
                    </td>
                    <td
                      class="text-sm"
                      style={`color: ${pod.restarts > 5 ? "var(--er)" : "var(--text-muted)"}`}
                    >
                      {pod.restarts}
                    </td>
                    <td class="text-sm" style="color: var(--text-muted)">
                      {pod.age}
                    </td>
                    <td
                      class="text-xs font-mono"
                      style="color: var(--text-subtle)"
                    >
                      {pod.node.split(".")[0]}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pod詳細パネル */}
      {selectedPod && (
        <>
          <div class="overlay" onClick={() => setSelectedPod(null)} />
          <div class="side-panel">
            <div class="side-panel-header">
              <div>
                <h2
                  class="text-sm font-semibold"
                  style="color: var(--text-heading)"
                >
                  {selectedPod.name}
                </h2>
                <p class="text-xs mt-0.5" style="color: var(--text-muted)">
                  {selectedPod.namespace}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPod(null)}
                class="btn btn-ghost btn-sm btn-square rounded-lg"
              >
                <i class="fas fa-xmark" />
              </button>
            </div>
            <div class="p-5 space-y-5">
              {/* アクションボタン群 */}
              <div class="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleOpenTerminal(
                      selectedPod,
                      selectedPod.containers[0]?.name,
                    )
                  }
                  class="btn btn-primary btn-sm rounded-lg flex-1"
                >
                  <i class="fas fa-terminal mr-1.5" />
                  Shell
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigate(
                      `/logs?pod=${encodeURIComponent(selectedPod.name)}&container=${encodeURIComponent(selectedPod.containers[0]?.name ?? "")}`,
                    );
                    setSelectedPod(null);
                  }}
                  class="btn btn-ghost btn-sm rounded-lg flex-1"
                  style="border: 1px solid var(--border-default)"
                >
                  <i class="fas fa-file-lines mr-1.5" />
                  ログ
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleCopyExecCmd(
                      selectedPod,
                      selectedPod.containers[0]?.name,
                    )
                  }
                  class="btn btn-ghost btn-sm btn-square rounded-lg"
                  style="border: 1px solid var(--border-default)"
                  title="kubectl exec コマンドをコピー"
                >
                  <i
                    class={`fas ${copiedCmd ? "fa-check text-success" : "fa-copy"}`}
                  />
                </button>
              </div>

              {/* 基本情報 */}
              <div>
                <h3
                  class="text-xs font-semibold uppercase tracking-wider mb-3"
                  style="color: var(--text-subtle)"
                >
                  基本情報
                </h3>
                <dl class="space-y-2 text-sm">
                  {[
                    {
                      label: "Status",
                      value: <StatusBadge status={selectedPod.phase} />,
                    },
                    { label: "Node", value: selectedPod.node },
                    { label: "IP", value: selectedPod.ip },
                    { label: "Age", value: selectedPod.age },
                    {
                      label: "Restarts",
                      value: String(selectedPod.restarts),
                    },
                  ].map(({ label, value }) => (
                    <div key={label} class="flex justify-between gap-2">
                      <dt style="color: var(--text-muted)">{label}</dt>
                      <dd style="color: var(--text-heading)" class="text-right">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* コンテナ */}
              <div>
                <h3
                  class="text-xs font-semibold uppercase tracking-wider mb-3"
                  style="color: var(--text-subtle)"
                >
                  コンテナ
                </h3>
                <div class="space-y-2">
                  {selectedPod.containers.map((c) => (
                    <div
                      key={c.name}
                      class="p-3 rounded-lg border"
                      style="border-color: var(--border-default)"
                    >
                      <div class="flex items-center justify-between mb-1">
                        <span
                          class="text-sm font-medium"
                          style="color: var(--text-heading)"
                        >
                          {c.name}
                        </span>
                        <div class="flex items-center gap-2">
                          <span
                            class={`text-xs ${c.ready ? "text-success" : "text-error"}`}
                          >
                            {c.ready ? "Ready" : "Not Ready"}
                          </span>
                          {selectedPod.containers.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenTerminal(selectedPod, c.name)
                              }
                              class="btn btn-ghost btn-xs btn-square rounded"
                              title={`${c.name} に Shell 接続`}
                            >
                              <i class="fas fa-terminal text-[10px]" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p class="text-xs k8s-badge truncate">{c.image}</p>
                      {c.stateReason && (
                        <p class="text-xs mt-1 text-warning">{c.stateReason}</p>
                      )}
                      {c.resources && (
                        <div
                          class="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-2 text-[11px] font-mono"
                          style="color: var(--text-muted)"
                        >
                          {c.resources.requests?.cpu && (
                            <span>CPU req: {c.resources.requests.cpu}</span>
                          )}
                          {c.resources.limits?.cpu && (
                            <span>CPU lim: {c.resources.limits.cpu}</span>
                          )}
                          {c.resources.requests?.memory && (
                            <span>Mem req: {c.resources.requests.memory}</span>
                          )}
                          {c.resources.limits?.memory && (
                            <span>Mem lim: {c.resources.limits.memory}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* イベント */}
              {podEvents.length > 0 && (
                <div>
                  <h3
                    class="text-xs font-semibold uppercase tracking-wider mb-3"
                    style="color: var(--text-subtle)"
                  >
                    イベント
                  </h3>
                  <div class="space-y-1.5">
                    {podEvents.slice(0, 5).map((ev, i) => (
                      <div
                        key={i}
                        class="flex items-start gap-2 text-xs p-2 rounded"
                        style="background: var(--bg-body)"
                      >
                        <i
                          class={`fas ${ev.type === "Warning" ? "fa-triangle-exclamation text-warning" : "fa-circle-info"} mt-0.5 shrink-0`}
                          style={
                            ev.type !== "Warning"
                              ? "color: var(--text-subtle)"
                              : ""
                          }
                        />
                        <div class="flex-1 min-w-0">
                          <span
                            class="font-medium"
                            style={`color: ${ev.type === "Warning" ? "oklch(var(--er))" : "var(--text-heading)"}`}
                          >
                            {ev.reason}
                          </span>
                          {ev.count > 1 && (
                            <span
                              class="ml-1"
                              style="color: var(--text-subtle)"
                            >
                              ({ev.count}回)
                            </span>
                          )}
                          <p
                            class="mt-0.5 line-clamp-1"
                            style="color: var(--text-muted)"
                          >
                            {ev.message}
                          </p>
                        </div>
                        <span
                          class="shrink-0"
                          style="color: var(--text-subtle)"
                        >
                          {formatRelativeTime(ev.lastTime)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ラベル */}
              {Object.keys(selectedPod.labels).length > 0 && (
                <div>
                  <h3
                    class="text-xs font-semibold uppercase tracking-wider mb-3"
                    style="color: var(--text-subtle)"
                  >
                    ラベル
                  </h3>
                  <div class="flex flex-wrap gap-1.5">
                    {Object.entries(selectedPod.labels).map(([k, v]) => (
                      <span key={k} class="k8s-badge">
                        {k}={v}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 削除ボタン */}
              <div
                class="pt-3 border-t"
                style="border-color: var(--border-default)"
              >
                {deleteError && (
                  <div
                    class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs mb-2"
                    style="background: oklch(var(--er) / 0.08); color: oklch(var(--er))"
                  >
                    <i class="fas fa-circle-xmark shrink-0" />
                    {deleteError}
                  </div>
                )}
                {showDeleteConfirm ? (
                  <div class="space-y-2">
                    <p class="text-xs text-error font-medium">
                      <i class="fas fa-triangle-exclamation mr-1" />
                      {selectedPod.name} を削除しますか？
                    </p>
                    <p class="text-xs" style="color: var(--text-muted)">
                      Deploymentが管理しているPodは自動的に再作成されます。
                    </p>
                    <div class="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleDelete()}
                        disabled={deleting}
                        class="btn btn-error btn-sm rounded-lg flex-1"
                      >
                        {deleting ? (
                          <i class="fas fa-spinner fa-spin" />
                        ) : (
                          <>
                            <i class="fas fa-trash mr-1.5" />
                            削除する
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        class="btn btn-ghost btn-sm rounded-lg flex-1"
                        style="border: 1px solid var(--border-default)"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    class="btn btn-ghost btn-sm rounded-lg w-full text-error"
                    style="border: 1px solid var(--border-default)"
                  >
                    <i class="fas fa-trash mr-1.5" />
                    Pod を削除
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
