import { useState, useEffect, useRef } from "hono/jsx/dom";
import type { K8sClient } from "~/lib/k8s-client";
import type {
  ArgoApplication,
  ArgoResource,
  ArgoManagedResource,
} from "~/lib/types";
import { computeJsonDiff } from "~/lib/json-diff";
import type { DiffLine } from "~/lib/json-diff";
import { PageGuide } from "~/components/shared/PageGuide";
import { Term } from "~/components/shared/Term";
import { EmptyState } from "~/components/shared/EmptyState";
import type { ToastType } from "~/components/shared/ToastStack";

// ─── 内部コンポーネント ──────────────────────────────────────────────────

function SyncBadge({ status }: { status: ArgoApplication["syncStatus"] }) {
  if (status === "Synced") {
    return (
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold text-success bg-success/10">
        <i class="fas fa-check text-[10px]" />
        <Term k="Synced">Synced</Term>
      </span>
    );
  }
  if (status === "OutOfSync") {
    return (
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold text-warning bg-warning/10">
        <i class="fas fa-arrow-rotate-left text-[10px]" />
        <Term k="OutOfSync">OutOfSync</Term>
      </span>
    );
  }
  return (
    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold text-muted bg-base-200">
      <i class="fas fa-circle-question text-[10px]" />
      Unknown
    </span>
  );
}

function HealthIcon({ status }: { status: ArgoApplication["healthStatus"] }) {
  if (status === "Healthy") {
    return <i class="fas fa-circle-check text-success" title="Healthy" />;
  }
  if (status === "Degraded") {
    return <i class="fas fa-circle-xmark text-error" title="Degraded" />;
  }
  if (status === "Progressing") {
    return (
      <i class="fas fa-spinner fa-spin text-warning" title="Progressing" />
    );
  }
  return (
    <i
      class="fas fa-circle-minus"
      style="color: var(--text-muted)"
      title={status}
    />
  );
}

function ImageTag({ image }: { image: string }) {
  const colonIdx = image.lastIndexOf(":");
  if (colonIdx === -1) {
    return (
      <span class="font-mono text-xs" style="color: var(--text-muted)">
        {image}
      </span>
    );
  }
  const registry = image.slice(0, colonIdx);
  const tag = image.slice(colonIdx + 1);
  return (
    <span class="font-mono text-xs">
      <span style="color: var(--text-muted)">{registry}</span>
      <span class="font-semibold" style="color: var(--text-heading)">
        :{tag}
      </span>
    </span>
  );
}

function ResourceSyncIcon({ status }: { status: ArgoResource["status"] }) {
  if (status === "Synced") {
    return <i class="fas fa-check text-[10px] text-success" title="Synced" />;
  }
  if (status === "OutOfSync") {
    return (
      <i
        class="fas fa-arrow-rotate-left text-[10px] text-warning"
        title="OutOfSync"
      />
    );
  }
  return (
    <i
      class="fas fa-circle-question text-[10px]"
      style="color: var(--text-muted)"
      title="Unknown"
    />
  );
}

function ResourceHealthIcon({ status }: { status: string }) {
  if (status === "Healthy") {
    return (
      <i class="fas fa-circle-check text-[10px] text-success" title="Healthy" />
    );
  }
  if (status === "Degraded") {
    return (
      <i class="fas fa-circle-xmark text-[10px] text-error" title="Degraded" />
    );
  }
  if (status === "Progressing") {
    return (
      <i
        class="fas fa-spinner fa-spin text-[10px] text-warning"
        title="Progressing"
      />
    );
  }
  if (!status) return null;
  return (
    <i
      class="fas fa-circle-minus text-[10px]"
      style="color: var(--text-muted)"
      title={status}
    />
  );
}

function DiffView({ lines }: { lines: DiffLine[] }) {
  // 変更のある行とその前後のコンテキスト行のみ表示（最大3行）
  const CONTEXT = 3;
  const changed = new Set<number>();
  lines.forEach((l, i) => {
    if (l.type !== "same") changed.add(i);
  });
  const visible = new Set<number>();
  for (const idx of changed) {
    for (
      let c = Math.max(0, idx - CONTEXT);
      c <= Math.min(lines.length - 1, idx + CONTEXT);
      c++
    ) {
      visible.add(c);
    }
  }

  const rows: (DiffLine | "separator")[] = [];
  let lastIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!visible.has(i)) continue;
    if (lastIdx >= 0 && i - lastIdx > 1) rows.push("separator");
    rows.push(lines[i]);
    lastIdx = i;
  }

  return (
    <div
      class="rounded overflow-x-auto text-[11px] font-mono leading-relaxed"
      style="background: var(--bg-default); border: 1px solid var(--border-default); max-height: 250px"
    >
      <pre class="p-2 m-0 whitespace-pre">
        {rows.map((row, i) => {
          if (row === "separator") {
            return (
              <div
                key={`sep-${i}`}
                class="text-center py-0.5"
                style="color: var(--text-muted)"
              >
                ···
              </div>
            );
          }
          const color =
            row.type === "add"
              ? "oklch(var(--su))"
              : row.type === "remove"
                ? "oklch(var(--er))"
                : "var(--text-muted)";
          const bg =
            row.type === "add"
              ? "oklch(var(--su) / 0.1)"
              : row.type === "remove"
                ? "oklch(var(--er) / 0.1)"
                : "transparent";
          const prefix =
            row.type === "add" ? "+" : row.type === "remove" ? "-" : " ";
          return (
            <div key={i} style={`color: ${color}; background: ${bg}`}>
              {prefix} {row.line}
            </div>
          );
        })}
      </pre>
    </div>
  );
}

function SyncConfirmModal({
  app,
  client,
  onConfirm,
  onCancel,
}: {
  app: ArgoApplication;
  client: K8sClient;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const outOfSyncResources = app.resources.filter(
    (r) => r.status === "OutOfSync",
  );
  const syncedResources = app.resources.filter((r) => r.status !== "OutOfSync");

  // managed-resources の取得状態
  const [managedResources, setManagedResources] = useState<
    ArgoManagedResource[]
  >([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  // Hono JSX の非同期 setState ワークアラウンド
  const refreshRef = useRef<HTMLSpanElement>(null);
  const stateRef = useRef({
    managedResources: [] as ArgoManagedResource[],
    diffLoading: false,
    diffError: false,
  });

  useEffect(() => {
    if (outOfSyncResources.length === 0) return;
    let cancelled = false;
    setDiffLoading(true);
    stateRef.current!.diffLoading = true;
    client.getArgoManagedResources(app.name).then((items) => {
      if (cancelled) return;
      stateRef.current!.managedResources = items;
      stateRef.current!.diffLoading = false;
      stateRef.current!.diffError = items.length === 0;
      setManagedResources(items);
      setDiffLoading(false);
      setDiffError(items.length === 0);
      refreshRef.current?.click();
    });
    return () => {
      cancelled = true;
    };
  }, [app.name]);

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const diffCache = useRef<Map<string, DiffLine[] | null>>(new Map());
  // managedResources が変わったらキャッシュをクリア
  useEffect(() => {
    diffCache.current!.clear();
  }, [managedResources]);

  const getDiffForResource = (r: ArgoResource): DiffLine[] | null => {
    const cacheKey = `${r.kind}/${r.namespace}/${r.name}`;
    if (diffCache.current!.has(cacheKey)) {
      return diffCache.current!.get(cacheKey)!;
    }
    const managed = managedResources.find(
      (m) =>
        m.kind === r.kind && m.name === r.name && m.namespace === r.namespace,
    );
    if (!managed || (!managed.liveState && !managed.targetState)) {
      diffCache.current!.set(cacheKey, null);
      return null;
    }
    const result = computeJsonDiff(
      managed.liveState || "{}",
      managed.targetState || "{}",
    );
    diffCache.current!.set(cacheKey, result);
    return result;
  };

  return (
    <div
      class="fixed inset-0 z-[100] flex items-center justify-center"
      style="background: rgba(0,0,0,0.5)"
      onClick={onCancel}
    >
      <div
        class="card-modern p-6 w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col"
        onClick={(e: Event) => e.stopPropagation()}
      >
        <span
          ref={refreshRef}
          class="hidden"
          onClick={() => {
            setManagedResources(stateRef.current!.managedResources);
            setDiffLoading(stateRef.current!.diffLoading);
            setDiffError(stateRef.current!.diffError);
          }}
        />
        {/* Header */}
        <div class="flex items-center gap-3 mb-4">
          <div
            class="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style="background: oklch(var(--wa) / 0.1)"
          >
            <i class="fas fa-rotate text-warning" />
          </div>
          <div>
            <p class="text-sm font-semibold" style="color: var(--text-heading)">
              Sync を実行しますか？
            </p>
            <p class="text-xs mt-0.5" style="color: var(--text-muted)">
              <span class="font-semibold">{app.name}</span>{" "}
              をGitリポジトリの最新状態に同期します。
            </p>
          </div>
        </div>

        {/* Status summary */}
        <div
          class="flex gap-4 px-3 py-2 rounded-lg text-xs mb-3"
          style="background: var(--bg-subtle)"
        >
          <div class="flex items-center gap-1.5">
            <HealthIcon status={app.healthStatus} />
            <span style="color: var(--text-subtle)">{app.healthStatus}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <SyncBadge status={app.syncStatus} />
          </div>
          {app.resources.length > 0 && (
            <span style="color: var(--text-muted)">
              {app.resources.length} リソース
              {outOfSyncResources.length > 0 && (
                <span class="text-warning font-semibold ml-1">
                  ({outOfSyncResources.length} 差分あり)
                </span>
              )}
            </span>
          )}
        </div>

        {/* Resource diff list */}
        {app.resources.length > 0 && (
          <div
            class="flex-1 overflow-y-auto mb-4 rounded-lg"
            style="border: 1px solid var(--border-default); max-height: 400px"
          >
            {/* OutOfSync resources */}
            {outOfSyncResources.length > 0 && (
              <div>
                <div
                  class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider sticky top-0"
                  style="background: oklch(var(--wa) / 0.08); color: oklch(var(--wa)); border-bottom: 1px solid var(--border-default)"
                >
                  <i class="fas fa-arrow-rotate-left mr-1" />
                  OutOfSync ({outOfSyncResources.length})
                </div>
                {outOfSyncResources.map((r) => {
                  const key = `${r.kind}/${r.namespace}/${r.name}`;
                  const isExpanded = expandedKeys.has(key);
                  const diffLines = isExpanded ? getDiffForResource(r) : null;
                  const changedCount = diffLines
                    ? diffLines.filter((d) => d.type !== "same").length
                    : 0;
                  return (
                    <div key={key}>
                      <div
                        class="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-base-200/50"
                        style="border-bottom: 1px solid var(--border-default)"
                        onClick={() => toggleExpand(key)}
                      >
                        <i
                          class={`fas fa-chevron-right text-[8px] transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          style="color: var(--text-muted)"
                        />
                        <ResourceSyncIcon status={r.status} />
                        <ResourceHealthIcon status={r.healthStatus} />
                        <span
                          class="font-mono text-[10px] px-1 py-0.5 rounded shrink-0"
                          style="background: var(--bg-subtle); color: var(--text-muted)"
                        >
                          {r.kind}
                        </span>
                        <span
                          class="truncate"
                          style="color: var(--text-heading)"
                        >
                          {r.name}
                        </span>
                      </div>
                      {isExpanded && (
                        <div
                          class="px-3 py-2"
                          style="background: var(--bg-subtle); border-bottom: 1px solid var(--border-default)"
                        >
                          {diffLoading ? (
                            <div
                              class="flex items-center gap-2 text-xs py-2"
                              style="color: var(--text-muted)"
                            >
                              <i class="fas fa-spinner fa-spin text-[10px]" />
                              diff を取得中...
                            </div>
                          ) : diffError || !diffLines ? (
                            <div
                              class="text-xs py-2"
                              style="color: var(--text-muted)"
                            >
                              <i class="fas fa-info-circle mr-1" />
                              diff 情報を取得できません（ArgoCD Server
                              が応答していない可能性があります）
                            </div>
                          ) : changedCount === 0 ? (
                            <div
                              class="text-xs py-2"
                              style="color: var(--text-muted)"
                            >
                              差分なし（メタデータのみの変更の可能性があります）
                            </div>
                          ) : (
                            <DiffView lines={diffLines} />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Synced resources */}
            {syncedResources.length > 0 && (
              <div>
                <div
                  class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider sticky top-0"
                  style="background: var(--bg-subtle); color: var(--text-muted); border-bottom: 1px solid var(--border-default)"
                >
                  <i class="fas fa-check mr-1" />
                  Synced ({syncedResources.length})
                </div>
                {syncedResources.map((r) => (
                  <div
                    key={`${r.kind}/${r.name}`}
                    class="flex items-center gap-2 px-3 py-1.5 text-xs"
                    style="border-bottom: 1px solid var(--border-default)"
                  >
                    <ResourceSyncIcon status={r.status} />
                    <ResourceHealthIcon status={r.healthStatus} />
                    <span
                      class="font-mono text-[10px] px-1 py-0.5 rounded shrink-0"
                      style="background: var(--bg-subtle); color: var(--text-muted)"
                    >
                      {r.kind}
                    </span>
                    <span class="truncate" style="color: var(--text-subtle)">
                      {r.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div class="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            class="btn btn-ghost btn-sm rounded-lg"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            class="btn btn-sm rounded-lg text-white"
            style="background: #0070f3"
          >
            <i class="fas fa-rotate mr-1" />
            Sync 実行
          </button>
        </div>
      </div>
    </div>
  );
}

function SyncButton({
  app,
  syncing,
  onRequestSync,
}: {
  app: ArgoApplication;
  syncing: boolean;
  onRequestSync: (app: ArgoApplication) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onRequestSync(app)}
      disabled={syncing}
      class="btn btn-ghost btn-xs rounded-lg"
      title="Sync を実行"
      style="color: var(--text-muted)"
    >
      <i class={`fas fa-rotate ${syncing ? "fa-spin" : ""} mr-1`} />
      Sync
    </button>
  );
}

function ArgoAppCard({
  app,
  syncingApp,
  onRequestSync,
}: {
  app: ArgoApplication;
  syncingApp: string | null;
  onRequestSync: (app: ArgoApplication) => void;
}) {
  const shortRevision = app.revision ? app.revision.slice(0, 7) : "";

  return (
    <div class="card-modern overflow-hidden">
      <div
        class="px-5 py-3 border-b flex items-center justify-between gap-3"
        style="border-color: var(--border-default)"
      >
        <div class="flex items-center gap-2 min-w-0">
          <HealthIcon status={app.healthStatus} />
          <h3
            class="text-sm font-semibold truncate"
            style="color: var(--text-heading)"
          >
            {app.name}
          </h3>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <SyncButton
            app={app}
            syncing={syncingApp === app.name}
            onRequestSync={onRequestSync}
          />
          <SyncBadge status={app.syncStatus} />
          <span class="text-xs" style="color: var(--text-muted)">
            <Term k="Healthy">{app.healthStatus}</Term>
          </span>
        </div>
      </div>

      <div class="px-5 py-3 space-y-3">
        {/* Destination */}
        <div class="flex flex-wrap gap-x-6 gap-y-1 text-xs">
          <div>
            <span style="color: var(--text-muted)">Namespace: </span>
            <span class="k8s-badge">{app.destinationNamespace || "-"}</span>
          </div>
          {shortRevision && (
            <div>
              <span style="color: var(--text-muted)">Revision: </span>
              <span class="font-mono" style="color: var(--text-subtle)">
                {shortRevision}
              </span>
            </div>
          )}
        </div>

        {/* Repository */}
        <div class="text-xs space-y-0.5">
          {app.repoURL && (
            <div class="flex items-center gap-1.5 min-w-0">
              <i
                class="fas fa-code-branch shrink-0"
                style="color: var(--text-muted)"
              />
              <span
                class="truncate font-mono"
                style="color: var(--text-subtle)"
                title={app.repoURL}
              >
                {app.repoURL}
              </span>
              {app.targetRevision && (
                <span
                  class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                  style="background: var(--bg-subtle); color: var(--text-muted)"
                >
                  {app.targetRevision}
                </span>
              )}
            </div>
          )}
          {app.path && (
            <div class="flex items-center gap-1.5">
              <i
                class="fas fa-folder-open shrink-0"
                style="color: var(--text-muted)"
              />
              <span class="font-mono" style="color: var(--text-subtle)">
                {app.path}
              </span>
            </div>
          )}
        </div>

        {/* Images */}
        {app.images.length > 0 && (
          <div>
            <p
              class="text-xs font-semibold mb-1"
              style="color: var(--text-muted)"
            >
              デプロイ中イメージ
            </p>
            <ul class="space-y-1">
              {app.images.map((img) => (
                <li key={img} class="flex items-center gap-1.5">
                  <i
                    class="fas fa-box-open text-[10px] shrink-0"
                    style="color: var(--text-subtle)"
                  />
                  <ImageTag image={img} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ApplicationsTab ─────────────────────────────────────────────────────

interface Props {
  apps: ArgoApplication[] | null;
  loading: boolean;
  client: K8sClient;
  onRefresh: () => void;
  onToast: (message: string, type: ToastType) => void;
}

export function ApplicationsTab({
  apps,
  loading,
  client,
  onRefresh,
  onToast,
}: Props) {
  const [confirmApp, setConfirmApp] = useState<ArgoApplication | null>(null);
  const [syncingApp, setSyncingApp] = useState<string | null>(null);

  const handleSync = async (app: ArgoApplication) => {
    setConfirmApp(null);
    setSyncingApp(app.name);
    try {
      await client.syncArgoApplication(app.name);
      onToast(`${app.name} の Sync を開始しました`, "success");
      onRefresh();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Sync に失敗しました", "error");
    } finally {
      setSyncingApp(null);
    }
  };

  return (
    <>
      <PageGuide id="argocd">
        <Term k="ArgoCD">ArgoCD</Term> Application
        の同期状態とデプロイ中イメージを一覧表示します。
        <Term k="OutOfSync">OutOfSync</Term>{" "}
        のアプリはGitリポジトリと差異があります。
        <Term k="Degraded">Degraded</Term>{" "}
        のアプリは正常に動作していない可能性があります。
      </PageGuide>

      {loading && !apps ? (
        <div class="flex items-center justify-center py-16">
          <i
            class="fas fa-spinner fa-spin text-2xl"
            style="color: var(--text-muted)"
          />
        </div>
      ) : !apps || apps.length === 0 ? (
        <EmptyState
          icon="fa-rotate"
          title="ArgoCD が検出されませんでした"
          description="ArgoCD がインストールされていないか、argocd namespace にアクセスできません。"
        />
      ) : (
        (() => {
          const outOfSync = apps.filter((a) => a.syncStatus === "OutOfSync");
          const synced = apps.filter((a) => a.syncStatus !== "OutOfSync");
          return (
            <div class="space-y-4">
              <p class="text-xs" style="color: var(--text-muted)">
                {apps.length} 件のアプリケーション
                {outOfSync.length > 0 && (
                  <span class="ml-2 text-warning font-semibold">
                    · {outOfSync.length} 件 OutOfSync
                  </span>
                )}
              </p>

              {/* OutOfSync グループ（上部に強調表示） */}
              {outOfSync.length > 0 && (
                <div
                  class="rounded-xl overflow-hidden"
                  style="border: 1px solid oklch(var(--wa) / 0.4)"
                >
                  <div
                    class="px-4 py-2 flex items-center gap-2 text-xs font-semibold"
                    style="background: oklch(var(--wa) / 0.08); color: oklch(var(--wa)); border-bottom: 1px solid oklch(var(--wa) / 0.3)"
                  >
                    <i class="fas fa-triangle-exclamation" />
                    OutOfSync — Gitリポジトリと差異があります。Syncが必要です。
                  </div>
                  <div class="space-y-4 p-4">
                    {outOfSync.map((app) => (
                      <ArgoAppCard
                        key={app.name}
                        app={app}
                        syncingApp={syncingApp}
                        onRequestSync={setConfirmApp}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Synced / Unknown グループ */}
              {synced.length > 0 && (
                <div class="space-y-4">
                  {outOfSync.length > 0 && (
                    <p class="text-xs" style="color: var(--text-subtle)">
                      同期済み ({synced.length}件)
                    </p>
                  )}
                  {synced.map((app) => (
                    <ArgoAppCard
                      key={app.name}
                      app={app}
                      syncingApp={syncingApp}
                      onRequestSync={setConfirmApp}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })()
      )}

      {confirmApp && (
        <SyncConfirmModal
          app={confirmApp}
          client={client}
          onConfirm={() => void handleSync(confirmApp)}
          onCancel={() => setConfirmApp(null)}
        />
      )}
    </>
  );
}
