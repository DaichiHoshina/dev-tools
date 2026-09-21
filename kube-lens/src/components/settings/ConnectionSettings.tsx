import { useState } from "hono/jsx/dom";
import type { K8sConfig } from "~/lib/types";
import type { K8sClient } from "~/lib/k8s-client";
import { getReadToken, setReadToken } from "~/lib/gitlab-base";

interface Props {
  config: K8sConfig;
  client: K8sClient;
  onSave: (config: K8sConfig) => void;
}

// 環境ごとのデフォルトポート（scripts/dev.mjs と対応）
// コンテキスト名は環境変数 K8S_CONTEXT_DEV / K8S_CONTEXT_STAGING / K8S_CONTEXT_PRODUCTION で設定
const ENV_PORTS = [
  { env: "dev", port: 8001, context: "my-cluster-dev" },
  { env: "staging", port: 8002, context: "my-cluster-staging" },
  { env: "production", port: 8003, context: "my-cluster-production" },
] as const;

export function ConnectionSettings({ config, client, onSave }: Props) {
  const [namespacesText, setNamespacesText] = useState<string>(
    config.namespaces.join(", "),
  );
  const [refreshInterval, setRefreshInterval] = useState<number>(
    config.refreshInterval,
  );
  const [testStatus, setTestStatus] = useState<
    "idle" | "testing" | "ok" | "error"
  >("idle");
  const [saved, setSaved] = useState<boolean>(false);
  const [gitlabToken, setGitlabToken] = useState<string>(() => getReadToken());

  const handleTestConnection = async () => {
    setTestStatus("testing");
    try {
      const ok = await client.testConnection();
      setTestStatus(ok ? "ok" : "error");
    } catch {
      setTestStatus("error");
    }
  };

  const handleSave = () => {
    const newConfig: K8sConfig = {
      project: config.project,
      apiUrls: config.apiUrls,
      environment: config.environment,
      namespaces: namespacesText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      refreshInterval,
    };
    onSave(newConfig);
    setReadToken(gitlabToken);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div class="max-w-xl space-y-6">
      {/* kubectl proxy 説明 */}
      <div class="card-modern p-5">
        <h3
          class="text-sm font-semibold mb-2"
          style="color: var(--text-heading)"
        >
          <i class="fas fa-circle-info mr-2 text-primary" />
          接続設定
        </h3>
        <div class="text-sm space-y-2" style="color: var(--text-muted)">
          <p>
            各環境のクラスタに接続するには、それぞれのcontextで{" "}
            <code class="k8s-badge">kubectl proxy</code> を起動してください。
          </p>
          <div class="bg-base-200 rounded-lg p-3 font-mono text-xs mt-2 space-y-1">
            <p style="color: #7ee787"># 環境ごとに固定ポートで起動</p>
            {ENV_PORTS.map(({ env, port, context }) => (
              <div key={env} class="flex items-center gap-2">
                <span
                  class={
                    env === config.environment ? "text-primary font-bold" : ""
                  }
                >
                  kubectl proxy --port={port} --context={context}
                </span>
                {env === config.environment && (
                  <span class="text-primary text-[10px]">← 現在</span>
                )}
              </div>
            ))}
          </div>
          <p class="text-xs" style="color: var(--text-subtle)">
            コンテキスト名は環境変数 <code>K8S_CONTEXT_DEV</code> /{" "}
            <code>K8S_CONTEXT_STAGING</code> /{" "}
            <code>K8S_CONTEXT_PRODUCTION</code> で設定できます。
          </p>
        </div>

        {/* ポート対応表 */}
        <div class="mt-3">
          <table class="w-full text-xs">
            <thead>
              <tr style="color: var(--text-muted)">
                <th class="text-left py-1.5 font-medium">環境</th>
                <th class="text-left py-1.5 font-medium">ポート</th>
                <th class="text-left py-1.5 font-medium">状態</th>
              </tr>
            </thead>
            <tbody style="color: var(--text-default)">
              {ENV_PORTS.map(({ env, port }) => (
                <tr
                  key={env}
                  style={
                    env === config.environment
                      ? "color: var(--text-heading); font-weight: 500"
                      : ""
                  }
                >
                  <td class="py-1.5">{env}</td>
                  <td class="py-1.5 font-mono">localhost:{port}</td>
                  <td class="py-1.5">
                    {env === config.environment ? (
                      <span class="text-primary">選択中</span>
                    ) : (
                      <span style="color: var(--text-subtle)">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 接続テスト */}
        <div class="flex items-center gap-3 mt-4">
          <button
            type="button"
            onClick={() => void handleTestConnection()}
            disabled={testStatus === "testing"}
            class="btn btn-sm btn-ghost rounded-lg border"
            style="border-color: var(--border-default)"
          >
            <i
              class={`fas ${testStatus === "testing" ? "fa-spinner fa-spin" : "fa-plug"} mr-1.5`}
            />
            接続テスト ({config.environment})
          </button>
          {testStatus === "ok" && (
            <span class="text-sm text-success flex items-center gap-1">
              <i class="fas fa-circle-check" />
              接続成功
            </span>
          )}
          {testStatus === "error" && (
            <span class="text-sm text-error flex items-center gap-1">
              <i class="fas fa-circle-xmark" />
              接続失敗 — kubectl proxy が起動していない可能性があります
            </span>
          )}
        </div>
      </div>

      {/* デフォルト Namespaces */}
      <div class="card-modern p-5">
        <h3
          class="text-sm font-semibold mb-4"
          style="color: var(--text-heading)"
        >
          デフォルト Namespaces
        </h3>
        <div class="space-y-2">
          <input
            type="text"
            value={namespacesText}
            onInput={(e) =>
              setNamespacesText((e.target as HTMLInputElement).value)
            }
            class="search-input w-full"
            placeholder="default, kube-system"
          />
          <p class="text-xs" style="color: var(--text-subtle)">
            カンマ区切りで複数指定可。各ページのセレクターでも切り替えできます。
          </p>
        </div>
      </div>

      {/* GitLab トークン */}
      <div class="card-modern p-5">
        <h3
          class="text-sm font-semibold mb-4"
          style="color: var(--text-heading)"
        >
          GitLab トークン
        </h3>
        <div class="space-y-2">
          <input
            type="password"
            value={gitlabToken}
            onInput={(e) =>
              setGitlabToken((e.target as HTMLInputElement).value)
            }
            class="search-input w-full font-mono"
            placeholder="glpat-..."
            autocomplete="off"
            spellcheck={false}
          />
          <p class="text-xs" style="color: var(--text-subtle)">
            イメージ差し替えと MR
            参照で使う読み取り用トークンです。このブラウザにのみ保存します。共有端末では作業後に空欄で保存してください。
          </p>
        </div>
      </div>

      {/* 自動更新間隔 */}
      <div class="card-modern p-5">
        <h3
          class="text-sm font-semibold mb-4"
          style="color: var(--text-heading)"
        >
          自動更新間隔
        </h3>
        <div class="flex gap-3 flex-wrap">
          {([15000, 30000, 60000, 0] as const).map((interval) => {
            const label =
              interval === 0
                ? "無効"
                : interval === 15000
                  ? "15秒"
                  : interval === 30000
                    ? "30秒"
                    : "60秒";
            return (
              <label
                key={interval}
                class="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="radio"
                  name="refresh-interval"
                  value={String(interval)}
                  checked={refreshInterval === interval}
                  onChange={() => setRefreshInterval(interval)}
                  class="radio radio-sm radio-primary"
                />
                {label}
              </label>
            );
          })}
        </div>
      </div>

      {/* 保存ボタン */}
      <div class="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          class="btn btn-primary rounded-lg px-6"
        >
          <i class={`fas ${saved ? "fa-check" : "fa-floppy-disk"} mr-2`} />
          {saved ? "保存しました" : "設定を保存"}
        </button>
      </div>
    </div>
  );
}
