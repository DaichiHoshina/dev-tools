import { useState, useEffect, useRef } from "hono/jsx/dom";
import { MIGRATION_SERVICES, isReadonlyEnv } from "~/lib/migration-config";
import {
  fetchMigrationVersion,
  executeMigration,
  type ServiceVersionState,
  type ActionResult,
  type MigrateAction,
} from "~/lib/migration-client";
import type { K8sClient } from "~/lib/k8s-client";
import { RefreshButton } from "~/components/shared/RefreshButton";
import { PageGuide } from "~/components/shared/PageGuide";

interface Props {
  client: K8sClient;
}

interface ConfirmAction {
  svcId: string;
  action: MigrateAction;
  version?: number;
}

// サーバーデータ（useEffect 非同期 → ref+click workaround 必須）
interface FetchState {
  loading: boolean;
  services: ServiceVersionState[];
  lastUpdated: Date | null;
}

// UI状態（クリックハンドラ経由 → 直接 setState で OK）
interface UIState {
  actionLoading: string | null;
  actionResults: Record<string, ActionResult>;
  confirmAction: ConfirmAction | null;
}

const ACTION_LABELS: Record<MigrateAction, string> = {
  up: "Up (1つ進める)",
  down: "Down (1つ戻す)",
  goto: "Goto (指定バージョンへ)",
  force: "Force (dirtyフラグ解除)",
};

function VersionCell({ state }: { state: ServiceVersionState }) {
  if (!state.version) {
    return <span style="color: var(--text-muted)">-</span>;
  }
  return (
    <span>
      <span class="font-mono text-sm" style="color: oklch(var(--in))">
        v{state.version.version}
      </span>
      {state.version.dirty && (
        <span
          class="ml-2 text-xs px-1.5 py-0.5 rounded font-medium"
          style="background: oklch(var(--er) / 0.15); color: oklch(var(--er))"
        >
          dirty
        </span>
      )}
    </span>
  );
}

function StatusCell({
  state,
  result,
  isLoading,
}: {
  state: ServiceVersionState;
  result?: ActionResult;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <span
        class="text-xs flex items-center gap-1"
        style="color: oklch(var(--wa))"
      >
        <i class="fas fa-spinner fa-spin" />
        実行中
      </span>
    );
  }
  if (state.error) {
    return (
      <span
        class="text-xs flex items-center gap-1"
        style="color: oklch(var(--er))"
        title={state.error}
      >
        <i class="fas fa-triangle-exclamation" />
        Error
      </span>
    );
  }
  if (result) {
    return result.success ? (
      <span
        class="text-xs flex items-center gap-1"
        style="color: oklch(var(--su))"
      >
        <i class="fas fa-check" />
        OK
      </span>
    ) : (
      <span
        class="text-xs flex items-center gap-1"
        style="color: oklch(var(--er))"
        title={result.error}
      >
        <i class="fas fa-xmark" />
        Failed
      </span>
    );
  }
  return null;
}

function ServiceTable({
  services,
  readonly,
  ui,
  setUI,
  onExecute,
}: {
  services: ServiceVersionState[];
  readonly: boolean;
  ui: UIState;
  setUI: (updater: (prev: UIState) => UIState) => void;
  onExecute: (svcId: string, action: MigrateAction, version?: number) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [gotoVersions, setGotoVersions] = useState<Record<string, string>>({});

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      class="overflow-x-auto rounded-xl border"
      style="background: var(--bg-surface); border-color: var(--border-default)"
    >
      <table class="w-full text-sm" style="border-collapse: collapse">
        <thead>
          <tr
            class="text-xs uppercase"
            style="color: var(--text-muted); border-bottom: 1px solid var(--border-default)"
          >
            <th class="px-4 py-2 text-left" style="min-width: 200px">
              Service
            </th>
            <th class="px-4 py-2 text-left">Namespace</th>
            <th class="px-4 py-2 text-left">Version</th>
            <th class="px-4 py-2 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {services.map((svc) => {
            const def = MIGRATION_SERVICES.find((s) => s.id === svc.id);
            if (!def) return null;
            const isExpanded = expanded.has(svc.id);
            const isActionLoading = ui.actionLoading === svc.id;
            const result = ui.actionResults[svc.id];
            const gotoVersion = gotoVersions[svc.id] ?? "";

            return (
              <>
                {/* メイン行 */}
                <tr
                  key={svc.id}
                  onClick={() => toggle(svc.id)}
                  style="cursor: pointer; border-bottom: 1px solid var(--border-subtle)"
                  class="hover:bg-base-200"
                >
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                      <i
                        class={`fas fa-chevron-right text-[10px] transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        style="color: var(--text-muted)"
                      />
                      <div>
                        <div
                          class="font-medium"
                          style="color: var(--text-default)"
                        >
                          {def.id}
                        </div>
                        <div class="text-xs" style="color: var(--text-muted)">
                          {def.description}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <span class="k8s-badge">{def.namespace}</span>
                  </td>
                  <td class="px-4 py-3">
                    <VersionCell state={svc} />
                  </td>
                  <td class="px-4 py-3">
                    <StatusCell
                      state={svc}
                      result={result}
                      isLoading={isActionLoading}
                    />
                  </td>
                </tr>

                {/* 展開行 */}
                {isExpanded && (
                  <tr key={`${svc.id}-detail`}>
                    <td
                      colSpan={4}
                      style="background: var(--bg-surface); border-bottom: 1px solid var(--border-default); padding: 0"
                    >
                      <div class="px-6 py-4 space-y-3">
                        {/* エラー表示 */}
                        {svc.error && (
                          <div
                            class="text-xs p-3 rounded"
                            style="background: oklch(var(--er) / 0.08); color: oklch(var(--er)); border: 1px solid oklch(var(--er) / 0.2)"
                          >
                            <i class="fas fa-triangle-exclamation mr-1.5" />
                            {svc.error}
                          </div>
                        )}

                        {/* Raw output */}
                        {svc.rawOutput && (
                          <div>
                            <div
                              class="text-xs mb-1"
                              style="color: var(--text-muted)"
                            >
                              Raw Output:
                            </div>
                            <pre
                              class="text-xs font-mono p-2 rounded overflow-x-auto whitespace-pre"
                              style="background: var(--bg-base); color: var(--text-default); border: 1px solid var(--border-default)"
                            >
                              {svc.rawOutput}
                            </pre>
                          </div>
                        )}

                        {/* アクション結果 */}
                        {result && (
                          <div
                            class="text-xs p-2 rounded"
                            style={`background: ${result.success ? "oklch(var(--su) / 0.1)" : "oklch(var(--er) / 0.1)"}; color: ${result.success ? "oklch(var(--su))" : "oklch(var(--er))"}; border: 1px solid ${result.success ? "oklch(var(--su) / 0.3)" : "oklch(var(--er) / 0.3)"}`}
                          >
                            <i
                              class={`fas ${result.success ? "fa-check" : "fa-xmark"} mr-1.5`}
                            />
                            {result.error || result.output || "完了"}
                          </div>
                        )}

                        {/* 操作ボタン (readonly環境では非表示) */}
                        {!readonly && (
                          <div class="space-y-2">
                            <div class="flex gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onExecute(svc.id, "up");
                                }}
                                disabled={isActionLoading}
                                class="btn btn-sm rounded disabled:opacity-50"
                                style="background: oklch(var(--su)); color: white"
                              >
                                {isActionLoading ? (
                                  <i class="fas fa-spinner fa-spin text-xs" />
                                ) : null}
                                Up
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onExecute(svc.id, "down");
                                }}
                                disabled={isActionLoading}
                                class="btn btn-sm rounded disabled:opacity-50"
                                style="background: oklch(var(--wa)); color: white"
                              >
                                Down
                              </button>
                            </div>
                            <div class="flex items-center gap-2">
                              <input
                                type="number"
                                placeholder="version"
                                value={gotoVersion}
                                onInput={(e) => {
                                  const v = (e.target as HTMLInputElement)
                                    .value;
                                  setGotoVersions((prev) => ({
                                    ...prev,
                                    [svc.id]: v,
                                  }));
                                }}
                                onClick={(e) => e.stopPropagation()}
                                class="search-input text-xs font-mono"
                                style="width: 7rem"
                                min={0}
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onExecute(
                                    svc.id,
                                    "goto",
                                    parseInt(gotoVersion, 10),
                                  );
                                }}
                                disabled={isActionLoading || !gotoVersion}
                                class="btn btn-sm rounded disabled:opacity-50"
                                style="background: oklch(var(--in)); color: white"
                              >
                                Goto
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onExecute(
                                    svc.id,
                                    "force",
                                    parseInt(gotoVersion, 10),
                                  );
                                }}
                                disabled={isActionLoading || !gotoVersion}
                                class="btn btn-sm rounded disabled:opacity-50"
                                style="background: oklch(var(--er)); color: white"
                                title="dirtyフラグを強制解除"
                              >
                                Force
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ConfirmModal({
  action,
  onConfirm,
  onCancel,
}: {
  action: ConfirmAction;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const def = MIGRATION_SERVICES.find((s) => s.id === action.svcId);
  const isDestructive = action.action === "down" || action.action === "force";

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center"
      style="background: rgba(0,0,0,0.5)"
    >
      <div
        class="w-full max-w-md mx-4 rounded-lg shadow-xl"
        style="background: var(--bg-base); border: 1px solid var(--border-default)"
      >
        {/* ヘッダー */}
        <div
          class="flex items-center justify-between px-5 py-4"
          style="border-bottom: 1px solid var(--border-default)"
        >
          <h3 class="text-base font-bold" style="color: var(--text-heading)">
            操作の確認
          </h3>
          <button
            type="button"
            onClick={onCancel}
            class="btn btn-ghost btn-sm rounded"
            style="color: var(--text-muted)"
          >
            <i class="fas fa-xmark" />
          </button>
        </div>

        {/* 本文 */}
        <div class="px-5 py-5 space-y-3">
          <p class="text-sm" style="color: var(--text-default)">
            以下の操作を実行しますか？
          </p>
          <div
            class="rounded p-3 space-y-1"
            style="background: var(--bg-surface)"
          >
            <div class="text-sm" style="color: var(--text-muted)">
              サービス:{" "}
              <span class="font-medium" style="color: var(--text-default)">
                {def?.id ?? action.svcId}
                <span class="ml-2 text-xs" style="color: var(--text-subtle)">
                  ({def?.description})
                </span>
              </span>
            </div>
            <div class="text-sm" style="color: var(--text-muted)">
              アクション:{" "}
              <span class="font-medium" style="color: var(--text-default)">
                {ACTION_LABELS[action.action]}
              </span>
            </div>
            {action.version !== undefined && (
              <div class="text-sm" style="color: var(--text-muted)">
                バージョン:{" "}
                <span
                  class="font-mono font-medium"
                  style="color: oklch(var(--in))"
                >
                  {action.version}
                </span>
              </div>
            )}
          </div>

          {/* 危険操作の警告 */}
          {isDestructive && (
            <div
              class="flex items-start gap-2 text-xs p-3 rounded"
              style="background: oklch(var(--wa) / 0.1); color: oklch(var(--wa)); border: 1px solid oklch(var(--wa) / 0.3)"
            >
              <i class="fas fa-triangle-exclamation mt-0.5 shrink-0" />
              <span>
                {action.action === "force"
                  ? "dirtyフラグを強制解除します。データ不整合に注意してください。"
                  : "マイグレーションを1つ戻します。データが失われる可能性があります。"}
              </span>
            </div>
          )}
        </div>

        {/* フッター */}
        <div
          class="flex justify-end gap-3 px-5 py-4"
          style="border-top: 1px solid var(--border-default)"
        >
          <button
            type="button"
            onClick={onCancel}
            class="btn btn-sm rounded"
            style="background: var(--bg-surface); color: var(--text-default); border: 1px solid var(--border-default)"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            class="btn btn-sm rounded font-medium"
            style={`background: ${isDestructive ? "oklch(var(--er))" : "oklch(var(--in))"}; color: white`}
          >
            実行
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hono JSX は useEffect 内の非同期 setState が VDOM に反映されないバグがある。
 * FetchState は useRef + click workaround で更新する。
 * UIState はクリックハンドラ経由なので直接 setState で OK。
 */
export function MigrationPage({ client }: Props) {
  const env = client.config.environment;
  const project = client.config.project;
  const baseUrl = client.config.apiUrls[env] || `/k8s/${project}/${env}`;
  const readonly = isReadonlyEnv(env);

  // ── Fetch state（workaround） ────────────────────────────────────────
  const [fs, setFs] = useState<FetchState>({
    loading: true,
    services: [],
    lastUpdated: null,
  });
  const pendingRef = useRef<FetchState | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const applyPending = () => {
    const p = pendingRef.current;
    if (!p) return;
    pendingRef.current = null;
    setFs(p);
  };

  const doFetch = () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setFs((prev) => ({ ...prev, loading: true }));

    Promise.all(
      MIGRATION_SERVICES.map((svc) =>
        fetchMigrationVersion(baseUrl, svc, controller.signal),
      ),
    )
      .then((results) => {
        if (controller.signal.aborted) return;
        pendingRef.current = {
          loading: false,
          services: results,
          lastUpdated: new Date(),
        };
        triggerRef.current?.click();
      })
      .catch(() => {
        // fetchMigrationVersion は内部でエラーをキャッチするため、
        // ここに到達するのは AbortError のみ
        if (controller.signal.aborted) return;
        pendingRef.current = { ...fs, loading: false };
        triggerRef.current?.click();
      });
  };

  useEffect(() => {
    doFetch();
    return () => {
      abortRef.current?.abort();
    };
  }, [env, baseUrl]);

  // ── UI state（クリックハンドラ経由、直接 setState） ─────────────────
  const [ui, setUI] = useState<UIState>({
    actionLoading: null,
    actionResults: {},
    confirmAction: null,
  });

  const handleRefresh = () => {
    doFetch();
  };

  const handleExecute = (
    svcId: string,
    action: MigrateAction,
    version?: number,
  ) => {
    setUI((prev) => ({
      ...prev,
      confirmAction: { svcId, action, version },
    }));
  };

  const handleConfirmExecute = async () => {
    const { confirmAction } = ui;
    if (!confirmAction) return;
    const svc = MIGRATION_SERVICES.find((s) => s.id === confirmAction.svcId);
    if (!svc) return;

    setUI((prev) => ({
      ...prev,
      confirmAction: null,
      actionLoading: confirmAction.svcId,
      actionResults: (() => {
        const next = { ...prev.actionResults };
        delete next[confirmAction.svcId];
        return next;
      })(),
    }));

    const result = await executeMigration(
      baseUrl,
      svc,
      confirmAction.action,
      confirmAction.version,
    );

    setUI((prev) => ({
      ...prev,
      actionLoading: null,
      actionResults: { ...prev.actionResults, [svc.id]: result },
    }));

    if (result.success) {
      doFetch();
    }
  };

  const handleCancelConfirm = () => {
    setUI((prev) => ({ ...prev, confirmAction: null }));
  };

  return (
    <div>
      {/* Hono JSX workaround */}
      <span ref={triggerRef} onClick={applyPending} style="display:none" />

      <div class="page-header">
        <div>
          <h1 class="page-title">Migration</h1>
          <p class="text-xs mt-1" style="color: var(--text-muted)">
            マイクロサービスのDBマイグレーション管理
            {readonly && (
              <span
                class="ml-2 px-2 py-0.5 rounded text-xs font-medium"
                style="background: oklch(var(--wa) / 0.15); color: oklch(var(--wa))"
              >
                <i class="fas fa-lock mr-1" />
                Readonly
              </span>
            )}
          </p>
        </div>
        <RefreshButton onRefresh={handleRefresh} lastUpdated={fs.lastUpdated} />
      </div>

      <PageGuide id="migration">
        各マイクロサービスのDBマイグレーションバージョンを確認・操作できます。
        サービス行をクリックすると詳細とアクションを展開します。
        <strong> Up</strong>: 1つ進める /<strong> Down</strong>: 1つ戻す
        (データ損失の可能性あり) /<strong> Goto</strong>: 指定バージョンへ移動 /
        <strong> Force</strong>: dirtyフラグ解除。 事前に{" "}
        <code class="font-mono text-xs">
          kubectl proxy --disable-filter=true
        </code>{" "}
        の起動が必要です。
      </PageGuide>

      {fs.loading && fs.services.length === 0 ? (
        <div class="flex items-center justify-center py-24">
          <i
            class="fas fa-spinner fa-spin text-2xl"
            style="color: var(--text-muted)"
          />
        </div>
      ) : (
        <ServiceTable
          services={fs.services}
          readonly={readonly}
          ui={ui}
          setUI={setUI}
          onExecute={handleExecute}
        />
      )}

      {/* 確認モーダル */}
      {ui.confirmAction && (
        <ConfirmModal
          action={ui.confirmAction}
          onConfirm={() => void handleConfirmExecute()}
          onCancel={handleCancelConfirm}
        />
      )}
    </div>
  );
}
