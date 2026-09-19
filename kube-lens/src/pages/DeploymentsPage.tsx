import { useState } from "hono/jsx/dom";
import { useK8sData } from "~/hooks/use-k8s";
import { useToast } from "~/hooks/use-toast";
import type { K8sClient } from "~/lib/k8s-client";
import type { Deployment, Environment, HPA } from "~/lib/types";
import { RefreshButton } from "~/components/shared/RefreshButton";
import { EmptyState } from "~/components/shared/EmptyState";
import { NamespaceSelector } from "~/components/shared/NamespaceSelector";
import { PageGuide } from "~/components/shared/PageGuide";
import { Term } from "~/components/shared/Term";
import { ToastStack } from "~/components/shared/ToastStack";

interface Props {
  client: K8sClient;
  selectedNamespaces: string[];
  namespaces: string[];
  onNamespacesChange: (ns: string[]) => void;
}

function RestartConfirmModal({
  deployment,
  env,
  onConfirm,
  onCancel,
}: {
  deployment: Deployment;
  env: Environment;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isPrd = env === "production";
  const [confirmText, setConfirmText] = useState("");

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center"
      style="background: rgba(0,0,0,0.5)"
      onClick={onCancel}
    >
      <div
        class="card-modern p-6 w-full max-w-sm mx-4"
        onClick={(e: Event) => e.stopPropagation()}
      >
        <div class="flex items-center gap-3 mb-4">
          <div
            class="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={`background: ${isPrd ? "oklch(var(--er) / 0.1)" : "oklch(var(--in) / 0.12)"}`}
          >
            <i
              class="fas fa-arrows-rotate"
              style={`color: ${isPrd ? "oklch(var(--er))" : "oklch(var(--in))"}`}
            />
          </div>
          <div>
            <p class="text-sm font-semibold" style="color: var(--text-heading)">
              Rollout Restart の確認
            </p>
            <p class="text-xs mt-0.5" style="color: var(--text-muted)">
              <strong style="color: var(--text-heading)">
                {deployment.name}
              </strong>{" "}
              を再起動します
            </p>
          </div>
        </div>

        {isPrd && (
          <div
            class="flex items-start gap-2 px-3 py-2 rounded-lg text-xs mb-3"
            style="background: oklch(var(--er) / 0.08); border: 1px solid oklch(var(--er) / 0.3); color: oklch(var(--er))"
          >
            <i class="fas fa-triangle-exclamation shrink-0 mt-0.5" />
            <span>
              本番環境（PRD）の Deployment を再起動します。確認のため{" "}
              <strong>prd</strong> と入力してください。
            </span>
          </div>
        )}

        {isPrd && (
          <input
            type="text"
            class="input input-bordered input-sm w-full mb-4 rounded-lg"
            placeholder="prd と入力"
            value={confirmText}
            onInput={(e: Event) =>
              setConfirmText((e.target as HTMLInputElement).value)
            }
          />
        )}

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
            disabled={isPrd && confirmText !== "production"}
            class="btn btn-sm rounded-lg text-white"
            style={`background: ${isPrd ? "oklch(var(--er))" : "#0070f3"}`}
          >
            <i class="fas fa-arrows-rotate mr-1" />
            再起動
          </button>
        </div>
      </div>
    </div>
  );
}

function DeploymentCard({
  d,
  hpa,
  onRestart,
  restarting,
}: {
  d: Deployment;
  hpa?: HPA;
  onRestart: (d: Deployment) => void;
  restarting: boolean;
}) {
  const isUnhealthy = d.readyReplicas < d.desiredReplicas;
  const allReady =
    d.readyReplicas === d.desiredReplicas && d.desiredReplicas > 0;
  const isAtMax = hpa && hpa.currentReplicas >= hpa.maxReplicas;
  const cpuHigh =
    hpa?.cpuUtilization !== undefined &&
    hpa.cpuTarget !== undefined &&
    hpa.cpuUtilization >= hpa.cpuTarget;

  return (
    <div
      class="card-modern px-4 py-3"
      style={isUnhealthy ? "border-left: 3px solid oklch(var(--er))" : ""}
    >
      <div class="flex items-center justify-between gap-3">
        {/* 左: 名前・イメージ */}
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <i
              class={`fas ${allReady ? "fa-circle-check text-success" : isUnhealthy ? "fa-circle-exclamation text-error" : "fa-circle text-base-content/30"} text-xs shrink-0`}
            />
            <p
              class="text-sm font-medium truncate"
              style="color: var(--text-heading)"
            >
              {d.name}
            </p>
            {hpa && (
              <span
                class={`badge badge-xs text-[10px] ${isAtMax ? "badge-warning" : "badge-ghost"}`}
                title={`HPA: min=${hpa.minReplicas} max=${hpa.maxReplicas}`}
              >
                HPA {hpa.currentReplicas}/{hpa.maxReplicas}
              </span>
            )}
          </div>
          {d.images[0] && (
            <p
              class="text-[11px] font-mono truncate mt-0.5 ml-5"
              style="color: var(--text-subtle)"
            >
              {d.images[0]}
            </p>
          )}
        </div>

        {/* 右: レプリカ数 + Restart */}
        <div class="flex items-center gap-3 shrink-0">
          <span
            class={`text-sm font-semibold tabular-nums ${isUnhealthy ? "text-error" : "text-success"}`}
          >
            {d.readyReplicas}/{d.desiredReplicas}
          </span>
          <span
            class="text-xs w-10 text-right"
            style="color: var(--text-subtle)"
          >
            {d.age}
          </span>
          <button
            type="button"
            class="btn btn-ghost btn-xs rounded-lg"
            style="color: var(--text-muted)"
            title="Rollout Restart"
            onClick={() => onRestart(d)}
            disabled={restarting}
          >
            <i
              class={`fas ${restarting ? "fa-spinner fa-spin" : "fa-arrows-rotate"} text-xs`}
            />
          </button>
        </div>
      </div>

      {/* 詳細行: Up-to-date, Available, Strategy, HPA CPU */}
      <div
        class="flex items-center gap-3 mt-1.5 ml-5 text-[11px]"
        style="color: var(--text-muted)"
      >
        <span>updated {d.updatedReplicas}</span>
        <span style="color: var(--border-default)">|</span>
        <span>available {d.availableReplicas}</span>
        <span style="color: var(--border-default)">|</span>
        <span class="k8s-badge text-[10px]">{d.strategy}</span>
        {d.namespace && (
          <>
            <span style="color: var(--border-default)">|</span>
            <span>{d.namespace}</span>
          </>
        )}
        {hpa?.cpuUtilization !== undefined && (
          <>
            <span style="color: var(--border-default)">|</span>
            <span class={cpuHigh ? "text-warning" : ""}>
              CPU {hpa.cpuUtilization}%
              {hpa.cpuTarget !== undefined && `/${hpa.cpuTarget}%`}
            </span>
          </>
        )}
      </div>

      {/* コンテナリソース */}
      {d.containers.some((c) => c.resources) && (
        <div class="mt-1.5 ml-5 space-y-0.5">
          {d.containers
            .filter((c) => c.resources)
            .map((c) => (
              <div
                key={c.name}
                class="flex items-center gap-2 text-[11px] font-mono"
                style="color: var(--text-subtle)"
              >
                <span
                  class="w-28 truncate shrink-0"
                  style="color: var(--text-muted)"
                  title={c.name}
                >
                  {c.name}
                </span>
                {c.resources?.requests?.cpu && (
                  <span>CPU {c.resources.requests.cpu}</span>
                )}
                {c.resources?.requests?.memory && (
                  <>
                    <span style="color: var(--border-default)">|</span>
                    <span>Mem {c.resources.requests.memory}</span>
                  </>
                )}
                {c.resources?.limits?.cpu && (
                  <>
                    <span style="color: var(--border-default)">|</span>
                    <span>lim {c.resources.limits.cpu}</span>
                  </>
                )}
                {c.resources?.limits?.memory && (
                  <>
                    <span style="color: var(--border-default)">|</span>
                    <span>lim {c.resources.limits.memory}</span>
                  </>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export function DeploymentsPage({
  client,
  selectedNamespaces,
  namespaces,
  onNamespacesChange,
}: Props) {
  const nsKey = selectedNamespaces.join(",");
  const { toasts, addToast, removeToast } = useToast();
  const [restartTarget, setRestartTarget] = useState<Deployment | null>(null);
  const [restartingName, setRestartingName] = useState<string>("");

  const {
    data: deployments,
    loading,
    error,
    refresh,
    lastUpdated,
  } = useK8sData(
    async () => {
      const results = await Promise.all(
        selectedNamespaces.map((ns) =>
          client.getDeploymentsInNamespace(ns).catch(() => [] as Deployment[]),
        ),
      );
      return results.flat();
    },
    client.config.refreshInterval,
    [nsKey],
  );

  const handleRestart = async () => {
    if (!restartTarget) return;
    const { namespace, name } = restartTarget;
    setRestartingName(name);
    setRestartTarget(null);
    try {
      await client.rolloutRestart(namespace, name);
      addToast(`${name} を再起動しました`, "success");
      refresh();
    } catch (err) {
      addToast(
        `再起動に失敗: ${err instanceof Error ? err.message : "不明なエラー"}`,
        "error",
      );
    } finally {
      setRestartingName("");
    }
  };

  const { data: hpas } = useK8sData(
    async () => {
      const results = await Promise.all(
        selectedNamespaces.map((ns) =>
          client.getHPAsInNamespace(ns).catch(() => [] as HPA[]),
        ),
      );
      return results.flat();
    },
    client.config.refreshInterval,
    [nsKey],
  );

  // Deployment名 → HPA のマップ
  const hpaByDeployment = new Map<string, HPA>();
  for (const hpa of hpas ?? []) {
    if (hpa.targetKind === "Deployment") {
      hpaByDeployment.set(hpa.targetName, hpa);
    }
  }

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

  const sorted = [...(deployments ?? [])].sort(
    (a, b) =>
      (a.readyReplicas < a.desiredReplicas ? -1 : 1) -
      (b.readyReplicas < b.desiredReplicas ? -1 : 1),
  );

  const unhealthyCount = sorted.filter(
    (d) => d.readyReplicas < d.desiredReplicas,
  ).length;

  return (
    <div>
      <div class="page-header">
        <div>
          <h1 class="page-title">
            Deployments
            {deployments && (
              <span
                class="text-sm font-normal ml-2"
                style="color: var(--text-muted)"
              >
                {deployments.length}件
                {unhealthyCount > 0 && (
                  <span class="text-error ml-1">({unhealthyCount}件異常)</span>
                )}
              </span>
            )}
          </h1>
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

      <PageGuide id="deployments">
        サービスごとの<Term k="Deployment">デプロイ</Term>状態です。
        <Term k="Replica">Ready数</Term>がDesired数と一致していれば正常。
        赤い左線のカードは<Term k="Replica">レプリカ</Term>
        不足で対応が必要です。
      </PageGuide>

      {loading && !deployments ? (
        <div class="flex items-center justify-center py-16">
          <i
            class="fas fa-spinner fa-spin text-2xl"
            style="color: var(--text-muted)"
          />
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon="fa-layer-group"
          title="Deployment がありません"
          description="選択中の Namespace に Deployment が見つかりません"
        />
      ) : (
        <div class="space-y-2">
          {sorted.map((d) => (
            <DeploymentCard
              key={`${d.namespace}/${d.name}`}
              d={d}
              hpa={hpaByDeployment.get(d.name)}
              onRestart={setRestartTarget}
              restarting={restartingName === d.name}
            />
          ))}
        </div>
      )}

      {restartTarget && (
        <RestartConfirmModal
          deployment={restartTarget}
          env={client.config.environment}
          onConfirm={() => void handleRestart()}
          onCancel={() => setRestartTarget(null)}
        />
      )}

      <ToastStack toasts={toasts} onClose={removeToast} />
    </div>
  );
}
