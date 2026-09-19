import { useK8sData } from "~/hooks/use-k8s";
import { useToast } from "~/hooks/use-toast";
import type { K8sClient } from "~/lib/k8s-client";
import { RefreshButton } from "~/components/shared/RefreshButton";
import { EmptyState } from "~/components/shared/EmptyState";
import { ToastStack } from "~/components/shared/ToastStack";
import { isHiddenApp } from "~/lib/argo-filters";
import { ApplicationsTab } from "~/pages/argocd/ApplicationsTab";

interface Props {
  client: K8sClient;
}

export function ArgoCDPage({ client }: Props) {
  const { toasts, addToast, removeToast } = useToast();

  const {
    data: rawApps,
    loading,
    error,
    refresh,
    lastUpdated,
  } = useK8sData(
    () => client.getArgoApplications(),
    client.config.refreshInterval,
    [client.config.environment],
  );

  const apps = rawApps?.filter((a) => !isHiddenApp(a.name)) ?? null;

  return (
    <div>
      <div class="page-header">
        <div>
          <h1 class="page-title">ArgoCD</h1>
        </div>
        <RefreshButton onRefresh={refresh} lastUpdated={lastUpdated} />
      </div>

      {error ? (
        <EmptyState
          icon="fa-plug-circle-exclamation"
          title="接続エラー"
          description={error}
          action={{ label: "再試行", onClick: refresh }}
        />
      ) : (
        <ApplicationsTab
          apps={apps}
          loading={loading}
          client={client}
          onRefresh={refresh}
          onToast={addToast}
        />
      )}

      <ToastStack toasts={toasts} onClose={removeToast} />
    </div>
  );
}
