import { useK8sData } from "~/hooks/use-k8s";
import type { K8sClient } from "~/lib/k8s-client";
import type { Pod } from "~/lib/types";
import { LogViewer } from "~/components/logs/LogViewer";
import { EmptyState } from "~/components/shared/EmptyState";
import { NamespaceSelector } from "~/components/shared/NamespaceSelector";
import { PageGuide } from "~/components/shared/PageGuide";
import { Term } from "~/components/shared/Term";
import { getQueryParams } from "~/lib/router";

interface Props {
  client: K8sClient;
  selectedNamespaces: string[];
  namespaces: string[];
  onNamespacesChange: (ns: string[]) => void;
}

export function LogsPage({
  client,
  selectedNamespaces,
  namespaces,
  onNamespacesChange,
}: Props) {
  const nsKey = selectedNamespaces.join(",");
  const { data: pods, error } = useK8sData(
    async () => {
      const results = await Promise.all(
        selectedNamespaces.map((ns) =>
          client.getPodsInNamespace(ns).catch(() => [] as Pod[]),
        ),
      );
      return results.flat();
    },
    0,
    [nsKey],
  );
  const query = getQueryParams();

  if (error) {
    return (
      <EmptyState
        icon="fa-plug-circle-exclamation"
        title="接続エラー"
        description={error}
      />
    );
  }

  return (
    <div>
      <div class="page-header">
        <div>
          <h1 class="page-title">ログ</h1>
          <div class="mt-2">
            <NamespaceSelector
              selectedNamespaces={selectedNamespaces}
              namespaces={namespaces}
              onChange={onNamespacesChange}
            />
          </div>
        </div>
      </div>

      <PageGuide id="logs">
        特定の<Term k="Container">コンテナ</Term>
        のログをリアルタイムで確認できます。 上のセレクターで
        <Term k="Pod">Pod</Term>とコンテナを選び、
        検索ボックスでキーワード絞り込みができます。トラブルシュート時に使います。
      </PageGuide>

      <LogViewer
        client={client}
        pods={pods ?? []}
        initialPod={query["pod"]}
        initialContainer={query["container"]}
      />
    </div>
  );
}
