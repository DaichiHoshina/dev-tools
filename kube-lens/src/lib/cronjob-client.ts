import { DEPLOY_SERVICES } from "~/lib/deploy-config";
import type { Project } from "~/lib/types";
import type { OverrideEnv } from "~/lib/image-override-client";

function baseUrl(project: Project, env: OverrideEnv): string {
  return `/k8s/${project}/${env}`;
}

export interface CronJobInfo {
  name: string;
  namespace: string;
  schedule: string;
  suspend: boolean;
  containers: Array<{ name: string; image: string }>;
  lastScheduleTime?: string;
  activeCount: number;
}

interface RawCronJob {
  metadata: { name: string; namespace: string };
  spec: {
    schedule: string;
    suspend?: boolean;
    jobTemplate: {
      spec: {
        template: {
          spec: {
            containers: Array<{ name: string; image: string }>;
          };
        };
      };
    };
  };
  status?: {
    lastScheduleTime?: string;
    active?: unknown[];
  };
}

interface RawCronJobList {
  items?: RawCronJob[];
}

/** 全 namespace から CronJob を取得 */
export async function fetchCronJobs(
  project: Project,
  env: OverrideEnv,
  signal?: AbortSignal,
): Promise<CronJobInfo[]> {
  const namespaces = [...new Set(DEPLOY_SERVICES.map((s) => s.namespace))];

  const results = await Promise.allSettled(
    namespaces.map(async (ns) => {
      const res = await fetch(
        `${baseUrl(project, env)}/apis/batch/v1/namespaces/${ns}/cronjobs`,
        signal ? { signal } : undefined,
      );
      if (!res.ok) return [];
      const data = (await res.json()) as RawCronJobList;
      return (data.items ?? []).map(
        (cj): CronJobInfo => ({
          name: cj.metadata.name,
          namespace: cj.metadata.namespace,
          schedule: cj.spec.schedule,
          suspend: cj.spec.suspend ?? false,
          containers: cj.spec.jobTemplate.spec.template.spec.containers.map(
            (c) => ({
              name: c.name,
              image: c.image,
            }),
          ),
          lastScheduleTime: cj.status?.lastScheduleTime,
          activeCount: cj.status?.active?.length ?? 0,
        }),
      );
    }),
  );

  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

/** CronJob のコンテナイメージを PATCH */
export async function setCronJobImage(
  project: Project,
  env: OverrideEnv,
  namespace: string,
  cronJobName: string,
  containerName: string,
  image: string,
): Promise<void> {
  const res = await fetch(
    `${baseUrl(project, env)}/apis/batch/v1/namespaces/${namespace}/cronjobs/${encodeURIComponent(cronJobName)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/strategic-merge-patch+json",
      },
      body: JSON.stringify({
        spec: {
          jobTemplate: {
            spec: {
              template: {
                spec: {
                  containers: [{ name: containerName, image }],
                },
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
      `CronJob image patch failed: ${res.status} ${res.statusText}${text ? ` - ${text.slice(0, 200)}` : ""}`,
    );
  }
}

/** CronJob の jobTemplate から手動 Job を作成 */
export async function triggerCronJob(
  project: Project,
  env: OverrideEnv,
  namespace: string,
  cronJobName: string,
): Promise<string> {
  // CronJob の jobTemplate を取得
  const getRes = await fetch(
    `${baseUrl(project, env)}/apis/batch/v1/namespaces/${namespace}/cronjobs/${encodeURIComponent(cronJobName)}`,
  );
  if (!getRes.ok) {
    throw new Error(`CronJob取得失敗: ${getRes.status} ${getRes.statusText}`);
  }
  const cronJob = (await getRes.json()) as RawCronJob;

  const now = new Date();
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const jobName = `manual-${cronJobName}-${ts}`;

  const jobBody = {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      name: jobName,
      namespace,
      labels: {
        "kube-lens/triggered-by": "manual",
        "kube-lens/cronjob": cronJobName,
      },
      annotations: {
        "kube-lens/triggered-by": "manual",
      },
    },
    spec: cronJob.spec.jobTemplate.spec,
  };

  const createRes = await fetch(
    `${baseUrl(project, env)}/apis/batch/v1/namespaces/${namespace}/jobs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobBody),
    },
  );
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => "");
    throw new Error(
      `Job作成失敗: ${createRes.status} ${createRes.statusText}${text ? ` - ${text.slice(0, 200)}` : ""}`,
    );
  }

  return jobName;
}
