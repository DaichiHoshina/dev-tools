import { ECR_REGISTRY, DEPLOY_SERVICES } from "~/lib/deploy-config";
import type { Project } from "~/lib/types";

export type OverrideEnv = "dev" | "staging" | "production";

export function isReadonlyEnv(_env: OverrideEnv): boolean {
  return true;
}

const CONFIGMAP_NAMESPACE = "default";

function baseUrl(project: Project, env: OverrideEnv): string {
  return `/k8s/${project}/${env}`;
}

function configMapName(env: OverrideEnv): string {
  return `${env}-image-overrides`;
}

export function buildEcrImage(ecrPath: string, tag: string): string {
  return `${ECR_REGISTRY}/${ecrPath}:${tag}`;
}

export function extractTag(image: string): string {
  const idx = image.lastIndexOf(":");
  return idx === -1 ? "unknown" : image.slice(idx + 1);
}

// ─── Deployment ──────────────────────────────────────────────────────────────

export async function setDeploymentImage(
  project: Project,
  env: OverrideEnv,
  namespace: string,
  deploymentName: string,
  image: string,
): Promise<void> {
  const res = await fetch(
    `${baseUrl(project, env)}/apis/apps/v1/namespaces/${namespace}/deployments/${encodeURIComponent(deploymentName)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/strategic-merge-patch+json",
      },
      body: JSON.stringify({
        spec: {
          template: {
            spec: { containers: [{ name: deploymentName, image }] },
          },
        },
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Deploy failed: ${res.status} ${res.statusText}${text ? ` - ${text.slice(0, 200)}` : ""}`,
    );
  }
}

export async function restartDeployment(
  project: Project,
  env: OverrideEnv,
  namespace: string,
  deploymentName: string,
): Promise<void> {
  const res = await fetch(
    `${baseUrl(project, env)}/apis/apps/v1/namespaces/${namespace}/deployments/${encodeURIComponent(deploymentName)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/strategic-merge-patch+json",
      },
      body: JSON.stringify({
        spec: {
          template: {
            metadata: {
              annotations: {
                "kubectl.kubernetes.io/restartedAt": new Date().toISOString(),
              },
            },
          },
        },
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Restart failed: ${res.status} ${res.statusText}${text ? ` - ${text.slice(0, 200)}` : ""}`,
    );
  }
}

// ─── ConfigMap（オーバーライド管理） ─────────────────────────────────────────

export interface OverrideEntry {
  ticket: string;
  namespace: string;
  ecr_repo: string;
  original_tag: string;
  override_tag: string;
  deployed_by: string;
  run_by: string;
  deployed_at: string;
  ttl_hours: number;
  mr_url: string;
}

export type OverrideMap = Record<string, OverrideEntry>;

/** kube-deploy 形式のラッパー */
interface VersionedOverrides {
  version: number;
  overrides: OverrideMap;
}

/** 旧 kube-lens 形式（後方互換用） */
interface LegacyOverrideEntry {
  tag: string;
  image: string;
  originalImage: string;
  deployedAt: string;
}

/** ConfigMap の生データを正規化して OverrideMap を返す */
function normalizeOverrides(raw: string): OverrideMap {
  const parsed = JSON.parse(raw) as
    | VersionedOverrides
    | Record<string, LegacyOverrideEntry>;

  // 新形式: { version: 1, overrides: {...} }
  if ("version" in parsed && "overrides" in parsed) {
    return (parsed as VersionedOverrides).overrides;
  }

  // 旧 kube-lens 形式: フラット Record<string, LegacyEntry>
  const legacy = parsed as Record<string, LegacyOverrideEntry>;
  const converted: OverrideMap = {};
  for (const [name, entry] of Object.entries(legacy)) {
    const tagFromImage = extractTag(entry.image);
    const originalTag = extractTag(entry.originalImage);
    // レジストリ部分を除いたパスを抽出
    const ecrRepo = entry.image
      .replace(`:${tagFromImage}`, "")
      .replace(`${ECR_REGISTRY}/`, "");
    converted[name] = {
      ticket: "",
      namespace: "",
      ecr_repo: ecrRepo,
      original_tag: originalTag,
      override_tag: tagFromImage,
      deployed_by: "kube-lens",
      run_by: "kube-lens",
      deployed_at: entry.deployedAt,
      ttl_hours: 0,
      mr_url: "",
    };
  }
  return converted;
}

interface RawConfigMap {
  data?: Record<string, string>;
}

export async function getOverrides(
  project: Project,
  env: OverrideEnv,
  signal?: AbortSignal,
): Promise<OverrideMap> {
  try {
    const res = await fetch(
      `${baseUrl(project, env)}/api/v1/namespaces/${CONFIGMAP_NAMESPACE}/configmaps/${configMapName(env)}`,
      signal ? { signal } : undefined,
    );
    if (res.status === 404) return {};
    if (!res.ok) return {};
    const data = (await res.json()) as RawConfigMap;
    return normalizeOverrides(data.data?.["overrides"] ?? "{}");
  } catch {
    return {};
  }
}

async function saveOverrideMap(
  project: Project,
  env: OverrideEnv,
  overrides: OverrideMap,
): Promise<void> {
  const name = configMapName(env);
  const wrapped: VersionedOverrides = { version: 1, overrides };
  const payload = JSON.stringify(wrapped);
  const patchRes = await fetch(
    `${baseUrl(project, env)}/api/v1/namespaces/${CONFIGMAP_NAMESPACE}/configmaps/${name}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/merge-patch+json" },
      body: JSON.stringify({ data: { overrides: payload } }),
    },
  );
  if (!patchRes.ok && patchRes.status !== 404) {
    const text = await patchRes.text().catch(() => "");
    throw new Error(
      `ConfigMap更新失敗: ${patchRes.status}${text ? ` - ${text.slice(0, 200)}` : ""}`,
    );
  }
  if (patchRes.status === 404) {
    // ConfigMap未作成の場合は新規作成
    const createRes = await fetch(
      `${baseUrl(project, env)}/api/v1/namespaces/${CONFIGMAP_NAMESPACE}/configmaps`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiVersion: "v1",
          kind: "ConfigMap",
          metadata: { name, namespace: CONFIGMAP_NAMESPACE },
          data: { overrides: payload },
        }),
      },
    );
    if (!createRes.ok) {
      const text = await createRes.text().catch(() => "");
      throw new Error(
        `ConfigMap作成失敗: ${createRes.status}${text ? ` - ${text.slice(0, 200)}` : ""}`,
      );
    }
  }
}

export interface SaveOverrideParams {
  project: Project;
  env: OverrideEnv;
  serviceName: string;
  namespace: string;
  ecrRepo: string;
  originalTag: string;
  overrideTag: string;
  ticket?: string;
  deployedBy?: string;
  ttlHours?: number;
  mrUrl?: string;
}

export async function saveOverride(params: SaveOverrideParams): Promise<void> {
  const current = await getOverrides(params.project, params.env);
  current[params.serviceName] = {
    ticket: params.ticket ?? "",
    namespace: params.namespace,
    ecr_repo: params.ecrRepo,
    original_tag: params.originalTag,
    override_tag: params.overrideTag,
    deployed_by: params.deployedBy ?? "kube-lens",
    run_by: "kube-lens",
    deployed_at: new Date().toISOString(),
    ttl_hours: params.ttlHours ?? 0,
    mr_url: params.mrUrl ?? "",
  };
  await saveOverrideMap(params.project, params.env, current);
}

/** オーバーライドを削除し、復元先のフルイメージURIを返す */
export async function removeOverride(
  project: Project,
  env: OverrideEnv,
  serviceName: string,
): Promise<string | null> {
  const current = await getOverrides(project, env);
  const entry = current[serviceName];
  if (!entry) return null;
  const originalImage = buildEcrImage(entry.ecr_repo, entry.original_tag);
  delete current[serviceName];
  await saveOverrideMap(project, env, current);
  return originalImage;
}

// ─── イメージ取得 ────────────────────────────────────────────────────────────

/** svc.key → 現在のイメージURI */
export type ImageMap = Record<string, string>;

interface RawDeployment {
  spec?: {
    template?: {
      spec?: {
        containers?: Array<{ name: string; image: string }>;
      };
    };
  };
}

/** K8s Deployment API から直接イメージを取得。ArgoCD のラグなしで実際の状態を反映。 */
export async function fetchDeploymentImages(
  project: Project,
  env: OverrideEnv,
  signal: AbortSignal,
): Promise<ImageMap | null> {
  try {
    const results = await Promise.allSettled(
      DEPLOY_SERVICES.map(async (svc) => {
        const res = await fetch(
          `${baseUrl(project, env)}/apis/apps/v1/namespaces/${svc.namespace}/deployments/${encodeURIComponent(svc.name)}`,
          { signal },
        );
        if (!res.ok) return { key: svc.key, image: null };
        const data = (await res.json()) as RawDeployment;
        const containers = data.spec?.template?.spec?.containers ?? [];
        const matched = containers.find((c) => c.image.includes(svc.ecrPath));
        return { key: svc.key, image: matched?.image ?? null };
      }),
    );
    const map: ImageMap = {};
    for (const result of results) {
      if (result.status === "fulfilled" && result.value.image) {
        map[result.value.key] = result.value.image;
      }
    }
    return Object.keys(map).length > 0 ? map : null;
  } catch {
    return null;
  }
}
