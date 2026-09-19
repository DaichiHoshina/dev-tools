import { useState } from "hono/jsx/dom";
import { useK8sData } from "~/hooks/use-k8s";
import type { K8sClient } from "~/lib/k8s-client";
import type { ConfigMap, Secret } from "~/lib/types";
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

function ConfigMapCard({ cm }: { cm: ConfigMap }) {
  const keys = Object.keys(cm.data);
  return (
    <div class="card-modern px-4 py-3">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <i
              class="fas fa-file-lines text-xs shrink-0"
              style="color: var(--text-muted)"
            />
            <p
              class="text-sm font-medium truncate"
              style="color: var(--text-heading)"
            >
              {cm.name}
            </p>
            <span class="badge badge-ghost badge-xs">{keys.length} keys</span>
          </div>
          {keys.length > 0 && (
            <p
              class="text-[11px] font-mono truncate mt-0.5 ml-5"
              style="color: var(--text-subtle)"
            >
              {keys.slice(0, 5).join(", ")}
              {keys.length > 5 ? ` …+${keys.length - 5}` : ""}
            </p>
          )}
        </div>
        <div class="flex items-center gap-3 shrink-0">
          {cm.namespace && (
            <span class="text-xs" style="color: var(--text-muted)">
              {cm.namespace}
            </span>
          )}
          <span
            class="text-xs w-10 text-right"
            style="color: var(--text-subtle)"
          >
            {cm.age}
          </span>
        </div>
      </div>
    </div>
  );
}

function SecretCard({ secret }: { secret: Secret }) {
  return (
    <div class="card-modern px-4 py-3">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <i
              class="fas fa-key text-xs shrink-0"
              style="color: var(--text-muted)"
            />
            <p
              class="text-sm font-medium truncate"
              style="color: var(--text-heading)"
            >
              {secret.name}
            </p>
            <span class="badge badge-ghost badge-xs text-[10px]">
              {secret.type}
            </span>
            <span class="badge badge-ghost badge-xs">
              {secret.keys.length} keys
            </span>
          </div>
          {secret.keys.length > 0 && (
            <p
              class="text-[11px] font-mono truncate mt-0.5 ml-5"
              style="color: var(--text-subtle)"
            >
              {secret.keys.slice(0, 5).join(", ")}
              {secret.keys.length > 5 ? ` …+${secret.keys.length - 5}` : ""}
            </p>
          )}
        </div>
        <div class="flex items-center gap-3 shrink-0">
          {secret.namespace && (
            <span class="text-xs" style="color: var(--text-muted)">
              {secret.namespace}
            </span>
          )}
          <span
            class="text-xs w-10 text-right"
            style="color: var(--text-subtle)"
          >
            {secret.age}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ConfigMapsPage({
  client,
  selectedNamespaces,
  namespaces,
  onNamespacesChange,
}: Props) {
  const nsKey = selectedNamespaces.join(",");
  const [tab, setTab] = useState<"configmaps" | "secrets">("configmaps");

  const {
    data: configmaps,
    loading: cmLoading,
    error: cmError,
    refresh: cmRefresh,
    lastUpdated: cmUpdated,
  } = useK8sData(
    async () => {
      const results = await Promise.all(
        selectedNamespaces.map((ns) =>
          client.getConfigMapsInNamespace(ns).catch(() => [] as ConfigMap[]),
        ),
      );
      return results.flat();
    },
    client.config.refreshInterval,
    [nsKey],
  );

  const {
    data: secrets,
    loading: secLoading,
    error: secError,
    refresh: secRefresh,
    lastUpdated: secUpdated,
  } = useK8sData(
    async () => {
      const results = await Promise.all(
        selectedNamespaces.map((ns) =>
          client.getSecretsInNamespace(ns).catch(() => [] as Secret[]),
        ),
      );
      return results.flat();
    },
    client.config.refreshInterval,
    [nsKey],
  );

  const isLoading = tab === "configmaps" ? cmLoading : secLoading;
  const error = tab === "configmaps" ? cmError : secError;
  const refresh = tab === "configmaps" ? cmRefresh : secRefresh;
  const lastUpdated = tab === "configmaps" ? cmUpdated : secUpdated;

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

  const sortedCMs = [...(configmaps ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const sortedSecrets = [...(secrets ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <div>
      <div class="page-header">
        <div>
          <h1 class="page-title">
            Config
            <span
              class="text-sm font-normal ml-2"
              style="color: var(--text-muted)"
            >
              {tab === "configmaps"
                ? `ConfigMaps ${configmaps?.length ?? 0}件`
                : `Secrets ${secrets?.length ?? 0}件`}
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

      <PageGuide id="configmaps">
        <Term k="ConfigMap">ConfigMap</Term>
        はアプリの設定値、
        <Term k="Secret">Secret</Term>
        はパスワードやAPIキーなどの機密情報を管理します。
        タブで切り替えて確認できます。Secretの値はセキュリティのため非表示です（キー名のみ表示）。
      </PageGuide>

      <div class="flex gap-1 mb-4">
        {(["configmaps", "secrets"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            class={`btn btn-sm rounded-lg ${tab === t ? "btn-primary" : "btn-ghost"}`}
          >
            <i
              class={`fas ${t === "configmaps" ? "fa-file-code" : "fa-key"} mr-1.5`}
            />
            {t === "configmaps" ? "ConfigMaps" : "Secrets"}
          </button>
        ))}
      </div>

      {isLoading && !(tab === "configmaps" ? configmaps : secrets) ? (
        <div class="flex items-center justify-center py-16">
          <i
            class="fas fa-spinner fa-spin text-2xl"
            style="color: var(--text-muted)"
          />
        </div>
      ) : tab === "configmaps" ? (
        sortedCMs.length === 0 ? (
          <EmptyState
            icon="fa-file-code"
            title="ConfigMap がありません"
            description="選択中の Namespace に見つかりません"
          />
        ) : (
          <div class="space-y-2">
            {sortedCMs.map((cm) => (
              <ConfigMapCard
                key={`${cm.namespace}/${cm.name}`}
                cm={cm}
              />
            ))}
          </div>
        )
      ) : sortedSecrets.length === 0 ? (
        <EmptyState
          icon="fa-key"
          title="Secret がありません"
          description="選択中の Namespace に見つかりません"
        />
      ) : (
        <div class="space-y-2">
          {sortedSecrets.map((s) => (
            <SecretCard key={`${s.namespace}/${s.name}`} secret={s} />
          ))}
        </div>
      )}
    </div>
  );
}
