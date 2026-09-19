import { useK8sData } from "~/hooks/use-k8s";
import type { K8sClient } from "~/lib/k8s-client";
import type { PVC, StorageClass } from "~/lib/types";
import { RefreshButton } from "~/components/shared/RefreshButton";
import { EmptyState } from "~/components/shared/EmptyState";
import { NamespaceSelector } from "~/components/shared/NamespaceSelector";
import { PageGuide } from "~/components/shared/PageGuide";
import { Term } from "~/components/shared/Term";

interface Props {
  client: K8sClient;
  selectedNamespaces: string[];
  namespaces: string[];
  onNamespacesChange: (ns: string[]) => void;
}

const PVC_STATUS_BADGE: Record<string, string> = {
  Bound: "badge-success",
  Pending: "badge-warning",
  Lost: "badge-error",
  Released: "badge-ghost",
};

function PVCCard({ pvc }: { pvc: PVC }) {
  const badgeClass = PVC_STATUS_BADGE[pvc.status] ?? "badge-ghost";
  return (
    <div class="card-modern px-4 py-3">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <i
              class="fas fa-hdd text-xs shrink-0"
              style="color: var(--text-muted)"
            />
            <p
              class="text-sm font-medium truncate"
              style="color: var(--text-heading)"
            >
              {pvc.name}
            </p>
            <span class={`badge badge-xs ${badgeClass}`}>{pvc.status}</span>
          </div>
          <div
            class="flex items-center gap-3 mt-1 ml-5 text-[11px]"
            style="color: var(--text-muted)"
          >
            <span>{pvc.capacity || "—"}</span>
            <span style="color: var(--border-default)">|</span>
            <span>{pvc.accessModes.join(", ") || "—"}</span>
            {pvc.storageClass && (
              <>
                <span style="color: var(--border-default)">|</span>
                <span class="k8s-badge text-[10px]">{pvc.storageClass}</span>
              </>
            )}
          </div>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          {pvc.namespace && (
            <span class="text-xs" style="color: var(--text-muted)">
              {pvc.namespace}
            </span>
          )}
          <span
            class="text-xs w-10 text-right"
            style="color: var(--text-subtle)"
          >
            {pvc.age}
          </span>
        </div>
      </div>
    </div>
  );
}

function StorageClassCard({ sc }: { sc: StorageClass }) {
  return (
    <div class="card-modern px-4 py-3">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <i
              class="fas fa-database text-xs shrink-0"
              style="color: var(--text-muted)"
            />
            <p
              class="text-sm font-medium truncate"
              style="color: var(--text-heading)"
            >
              {sc.name}
            </p>
            {sc.isDefault && (
              <span class="badge badge-primary badge-xs">default</span>
            )}
          </div>
          <div
            class="flex items-center gap-3 mt-1 ml-5 text-[11px]"
            style="color: var(--text-muted)"
          >
            <span class="font-mono truncate max-w-48">{sc.provisioner}</span>
            <span style="color: var(--border-default)">|</span>
            <span>{sc.reclaimPolicy}</span>
            <span style="color: var(--border-default)">|</span>
            <span>{sc.volumeBindingMode}</span>
          </div>
        </div>
        <span
          class="text-xs w-10 text-right shrink-0"
          style="color: var(--text-subtle)"
        >
          {sc.age}
        </span>
      </div>
    </div>
  );
}

export function StoragePage({
  client,
  selectedNamespaces,
  namespaces,
  onNamespacesChange,
}: Props) {
  const nsKey = selectedNamespaces.join(",");

  const {
    data: pvcs,
    loading: pvcLoading,
    error: pvcError,
    refresh: pvcRefresh,
    lastUpdated: pvcUpdated,
  } = useK8sData(
    async () => {
      const results = await Promise.all(
        selectedNamespaces.map((ns) =>
          client.getPVCsInNamespace(ns).catch(() => [] as PVC[]),
        ),
      );
      return results.flat();
    },
    client.config.refreshInterval,
    [nsKey],
  );

  const {
    data: storageClasses,
    loading: scLoading,
    error: scError,
    refresh: scRefresh,
  } = useK8sData(
    () => client.getStorageClasses().catch(() => [] as StorageClass[]),
    client.config.refreshInterval,
    [],
  );

  const loading = pvcLoading || scLoading;
  const error = pvcError ?? scError;
  const refresh = () => {
    pvcRefresh();
    scRefresh();
  };
  const lastUpdated = pvcUpdated;

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

  const sortedPVCs = [...(pvcs ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const sortedSCs = [...(storageClasses ?? [])].sort(
    (a, b) =>
      (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) ||
      a.name.localeCompare(b.name),
  );

  return (
    <div>
      <div class="page-header">
        <div>
          <h1 class="page-title">
            Storage
            <span
              class="text-sm font-normal ml-2"
              style="color: var(--text-muted)"
            >
              PVC {pvcs?.length ?? 0}件 / SC {storageClasses?.length ?? 0}件
            </span>
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

      <PageGuide id="storage">
        <Term k="PVC">PVC</Term>
        はPodが使う永続ストレージの要求です。ステータスが{" "}
        <Term k="Bound">Bound</Term>
        なら正常に接続済み。Pendingはストレージ割り当て待ちです。
        <Term k="StorageClass">StorageClass</Term>
        はストレージの種類（EBS/EFSなど）を定義します。
        <Term k="AccessMode">アクセスモード</Term>と
        <Term k="ReclaimPolicy">回収ポリシー</Term>
        も確認できます。
      </PageGuide>

      {loading && !(pvcs && storageClasses) ? (
        <div class="flex items-center justify-center py-16">
          <i
            class="fas fa-spinner fa-spin text-2xl"
            style="color: var(--text-muted)"
          />
        </div>
      ) : (
        <>
          <section class="mb-6">
            <h2
              class="text-sm font-semibold mb-3"
              style="color: var(--text-heading)"
            >
              <i class="fas fa-hdd mr-1.5" />
              PersistentVolumeClaims
            </h2>
            {sortedPVCs.length === 0 ? (
              <EmptyState
                icon="fa-hdd"
                title="PVC がありません"
                description="選択中の Namespace に PVC が見つかりません"
              />
            ) : (
              <div class="space-y-2">
                {sortedPVCs.map((pvc) => (
                  <PVCCard
                    key={`${pvc.namespace}/${pvc.name}`}
                    pvc={pvc}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2
              class="text-sm font-semibold mb-3"
              style="color: var(--text-heading)"
            >
              <i class="fas fa-database mr-1.5" />
              StorageClasses
            </h2>
            {sortedSCs.length === 0 ? (
              <p class="text-sm" style="color: var(--text-muted)">
                StorageClass がありません
              </p>
            ) : (
              <div class="space-y-2">
                {sortedSCs.map((sc) => (
                  <StorageClassCard key={sc.name} sc={sc} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
