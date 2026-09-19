import type {
  K8sConfig,
  Pod,
  Deployment,
  K8sEvent,
  ArgoApplication,
  ArgoManagedResource,
  CronJob,
  Job,
  HPA,
  K8sList,
  ConfigMap,
  Secret,
  Ingress,
  ResourceQuota,
  LimitRange,
  PVC,
  StorageClass,
} from "~/lib/types";
import { DEFAULT_CONFIG } from "~/lib/types";
import {
  type RawPod,
  type RawDeployment,
  type RawEvent,
  type RawArgoApplication,
  type RawCronJob,
  type RawJob,
  type RawHPA,
  type RawConfigMap,
  type RawSecret,
  type RawIngress,
  type RawResourceQuota,
  type RawLimitRange,
  type RawPVC,
  type RawStorageClass,
  parsePod,
  parseDeployment,
  parseEvent,
  parseArgoApplication,
  parseCronJob,
  parseJob,
  parseHPA,
  parseConfigMap,
  parseSecret,
  parseIngress,
  parseResourceQuota,
  parseLimitRange,
  parsePVC,
  parseStorageClass,
} from "~/lib/k8s-parsers";

export function createK8sClient(config: K8sConfig = DEFAULT_CONFIG) {
  const baseUrl =
    config.apiUrls[config.environment] ||
    `/k8s/${config.project}/${config.environment}`;

  async function request<T>(path: string): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`);
    if (!response.ok) {
      throw new Error(
        `K8s API error: ${response.status} ${response.statusText} - ${path}`,
      );
    }
    return response.json() as Promise<T>;
  }

  async function requestDelete(path: string): Promise<void> {
    const response = await fetch(`${baseUrl}${path}`, { method: "DELETE" });
    if (!response.ok) {
      throw new Error(
        `K8s API error: ${response.status} ${response.statusText} - ${path}`,
      );
    }
  }

  async function requestText(path: string): Promise<string> {
    const response = await fetch(`${baseUrl}${path}`);
    if (!response.ok) {
      throw new Error(
        `K8s API error: ${response.status} ${response.statusText}`,
      );
    }
    return response.text();
  }

  // ArgoCD Server API（K8s Service Proxy 経由）
  const argoServerProxy = `${baseUrl}/api/v1/namespaces/argocd/services/argocd-server:http/proxy`;
  let argoTokenCache: { token: string; expiresAt: number } | null = null;

  async function getArgoToken(): Promise<string | null> {
    if (argoTokenCache && Date.now() < argoTokenCache.expiresAt - 300_000) {
      return argoTokenCache.token;
    }
    try {
      const secret = await request<{
        data?: { password?: string };
      }>("/api/v1/namespaces/argocd/secrets/argocd-initial-admin-secret");
      const encoded = secret.data?.password;
      if (!encoded) return null;
      const password = atob(encoded);

      const res = await fetch(`${argoServerProxy}/api/v1/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { token?: string };
      if (!data.token) return null;

      // トークンをキャッシュ（24時間有効と仮定）
      argoTokenCache = {
        token: data.token,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      return data.token;
    } catch {
      return null;
    }
  }

  return {
    config,

    async testConnection(): Promise<boolean> {
      try {
        await request<unknown>("/api/v1/namespaces");
        return true;
      } catch {
        return false;
      }
    },

    async getServerVersion(): Promise<string> {
      const info = await request<{
        gitVersion?: string;
        platform?: string;
      }>("/version");
      return info.gitVersion ?? "unknown";
    },

    async getNamespaces(): Promise<string[]> {
      const list =
        await request<K8sList<{ metadata: { name: string } }>>(
          "/api/v1/namespaces",
        );
      return list.items.map((item) => item.metadata.name).sort();
    },

    async getPodsInNamespace(namespace: string): Promise<Pod[]> {
      const list = await request<K8sList<RawPod>>(
        `/api/v1/namespaces/${namespace}/pods`,
      );
      return list.items.map(parsePod);
    },

    async getDeploymentsInNamespace(namespace: string): Promise<Deployment[]> {
      const list = await request<K8sList<RawDeployment>>(
        `/apis/apps/v1/namespaces/${namespace}/deployments`,
      );
      return list.items.map(parseDeployment);
    },

    async getEventsInNamespace(namespace: string): Promise<K8sEvent[]> {
      const list = await request<K8sList<RawEvent>>(
        `/api/v1/namespaces/${namespace}/events`,
      );
      return list.items
        .map(parseEvent)
        .sort(
          (a, b) =>
            new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime(),
        );
    },

    async deletePod(namespace: string, podName: string): Promise<void> {
      await requestDelete(
        `/api/v1/namespaces/${namespace}/pods/${encodeURIComponent(podName)}`,
      );
    },

    async getPodEvents(
      namespace: string,
      podName: string,
    ): Promise<K8sEvent[]> {
      const list = await request<K8sList<RawEvent>>(
        `/api/v1/namespaces/${namespace}/events?fieldSelector=involvedObject.name=${encodeURIComponent(podName)}`,
      );
      return list.items
        .map(parseEvent)
        .sort(
          (a, b) =>
            new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime(),
        );
    },

    getExecWebSocketUrl(
      namespace: string,
      podName: string,
      container?: string,
    ): string {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const containerParam = container
        ? `&container=${encodeURIComponent(container)}`
        : "";
      return `${proto}//${location.host}${baseUrl}/api/v1/namespaces/${namespace}/pods/${encodeURIComponent(podName)}/exec?command=/bin/sh&stdin=true&stdout=true&stderr=true&tty=true${containerParam}`;
    },

    async getPodLogs(
      namespace: string,
      podName: string,
      container?: string,
      tailLines = 500,
      timestamps = false,
    ): Promise<string> {
      const containerParam = container
        ? `&container=${encodeURIComponent(container)}`
        : "";
      const tsParam = timestamps ? "&timestamps=true" : "";
      return requestText(
        `/api/v1/namespaces/${namespace}/pods/${encodeURIComponent(podName)}/log?tailLines=${tailLines}${containerParam}${tsParam}`,
      );
    },

    async getArgoApplications(): Promise<ArgoApplication[]> {
      try {
        const list = await request<K8sList<RawArgoApplication>>(
          "/apis/argoproj.io/v1alpha1/namespaces/argocd/applications",
        );
        return list.items.map(parseArgoApplication);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("404") || msg.includes("403")) return [];
        throw e;
      }
    },

    async getArgoManagedResources(
      appName: string,
    ): Promise<ArgoManagedResource[]> {
      try {
        const token = await getArgoToken();
        if (!token) return [];

        const res = await fetch(
          `${argoServerProxy}/api/v1/applications/${encodeURIComponent(appName)}/managed-resources`,
          {
            headers: {
              Cookie: `argocd.token=${token}`,
            },
          },
        );
        if (!res.ok) return [];
        const data = (await res.json()) as {
          items?: ArgoManagedResource[];
        };
        return data.items ?? [];
      } catch {
        return [];
      }
    },

    async getCronJobsInNamespace(namespace: string): Promise<CronJob[]> {
      const list = await request<K8sList<RawCronJob>>(
        `/apis/batch/v1/namespaces/${namespace}/cronjobs`,
      );
      return list.items.map(parseCronJob);
    },

    async getJobsInNamespace(namespace: string): Promise<Job[]> {
      const list = await request<K8sList<RawJob>>(
        `/apis/batch/v1/namespaces/${namespace}/jobs`,
      );
      return list.items.map(parseJob);
    },

    async getHPAsInNamespace(namespace: string): Promise<HPA[]> {
      try {
        const list = await request<K8sList<RawHPA>>(
          `/apis/autoscaling/v2/namespaces/${namespace}/horizontalpodautoscalers`,
        );
        return list.items.map(parseHPA);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("404") || msg.includes("403")) return [];
        throw e;
      }
    },

    async rolloutRestart(
      namespace: string,
      deploymentName: string,
    ): Promise<void> {
      const response = await fetch(
        `${baseUrl}/apis/apps/v1/namespaces/${namespace}/deployments/${encodeURIComponent(deploymentName)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/strategic-merge-patch+json" },
          body: JSON.stringify({
            spec: {
              template: {
                metadata: {
                  annotations: {
                    "kubectl.kubernetes.io/restartedAt":
                      new Date().toISOString(),
                  },
                },
              },
            },
          }),
        },
      );
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Rollout restart failed: ${response.status} ${response.statusText}${text ? ` - ${text.slice(0, 200)}` : ""}`,
        );
      }
    },

    async getConfigMapsInNamespace(namespace: string): Promise<ConfigMap[]> {
      const ns = encodeURIComponent(namespace);
      const list = await request<K8sList<RawConfigMap>>(
        `/api/v1/namespaces/${ns}/configmaps`,
      );
      return list.items.map(parseConfigMap);
    },

    async getSecretsInNamespace(namespace: string): Promise<Secret[]> {
      const ns = encodeURIComponent(namespace);
      const list = await request<K8sList<RawSecret>>(
        `/api/v1/namespaces/${ns}/secrets`,
      );
      return list.items.map(parseSecret);
    },

    async getIngressesInNamespace(namespace: string): Promise<Ingress[]> {
      const ns = encodeURIComponent(namespace);
      try {
        const list = await request<K8sList<RawIngress>>(
          `/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses`,
        );
        return list.items.map(parseIngress);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("404") || msg.includes("403")) return [];
        throw e;
      }
    },

    async getResourceQuotasInNamespace(
      namespace: string,
    ): Promise<ResourceQuota[]> {
      const ns = encodeURIComponent(namespace);
      const list = await request<K8sList<RawResourceQuota>>(
        `/api/v1/namespaces/${ns}/resourcequotas`,
      );
      return list.items.map(parseResourceQuota);
    },

    async getLimitRangesInNamespace(namespace: string): Promise<LimitRange[]> {
      const ns = encodeURIComponent(namespace);
      const list = await request<K8sList<RawLimitRange>>(
        `/api/v1/namespaces/${ns}/limitranges`,
      );
      return list.items.map(parseLimitRange);
    },

    async getPVCsInNamespace(namespace: string): Promise<PVC[]> {
      const ns = encodeURIComponent(namespace);
      const list = await request<K8sList<RawPVC>>(
        `/api/v1/namespaces/${ns}/persistentvolumeclaims`,
      );
      return list.items.map(parsePVC);
    },

    async getStorageClasses(): Promise<StorageClass[]> {
      try {
        const list = await request<K8sList<RawStorageClass>>(
          `/apis/storage.k8s.io/v1/storageclasses`,
        );
        return list.items.map(parseStorageClass);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("404") || msg.includes("403")) return [];
        throw e;
      }
    },

    async syncArgoApplication(appName: string): Promise<void> {
      const response = await fetch(
        `${baseUrl}/apis/argoproj.io/v1alpha1/namespaces/argocd/applications/${encodeURIComponent(appName)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/merge-patch+json" },
          body: JSON.stringify({
            operation: {
              initiatedBy: { username: "kube-lens" },
              sync: {
                revision: "",
                prune: false,
              },
            },
          }),
        },
      );
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Sync failed: ${response.status} ${response.statusText}${text ? ` - ${text.slice(0, 200)}` : ""}`,
        );
      }
    },
  };
}

export type K8sClient = ReturnType<typeof createK8sClient>;

// テスト用エクスポート（後方互換性のため k8s-parsers から re-export）
export {
  calcAge,
  parsePod,
  parseDeployment,
  parseEvent,
  parseArgoApplication,
  parseJob,
  parseHPA,
} from "~/lib/k8s-parsers";
