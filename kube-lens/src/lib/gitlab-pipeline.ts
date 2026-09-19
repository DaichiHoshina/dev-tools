import {
  GITLAB_BASE,
  RELEASE_TES_PROJECT,
  getReadToken,
} from "~/lib/gitlab-base";

export interface PipelineJob {
  id: number;
  name: string;
  status: "pending" | "running" | "success" | "failed" | "canceled" | "skipped";
  stage: string;
  webUrl: string;
}

export interface PipelineStatus {
  status: string;
  webUrl: string;
  jobs: PipelineJob[];
}

export interface TriggeredPipeline {
  id: number;
  webUrl: string;
}

// GitLab Pipeline API レスポンス（最低限）
interface GitLabPipelineResponse {
  id: number;
  web_url: string;
  status: string;
}

// GitLab Jobs API レスポンス（最低限）
interface GitLabJobResponse {
  id: number;
  name: string;
  status: string;
  stage: string;
  web_url: string;
}

// ─── パイプライントリガー（PRIVATE-TOKEN + JSON） ──

export async function triggerPipeline(
  serviceName: string,
  target: "staging" | "production",
  version: string,
): Promise<TriggeredPipeline> {
  const token = getReadToken();
  if (!token) {
    throw new Error("GitLab Read Token が設定されていません");
  }

  const res = await fetch(
    `${GITLAB_BASE}/projects/${RELEASE_TES_PROJECT}/pipeline`,
    {
      method: "POST",
      headers: {
        "PRIVATE-TOKEN": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "master",
        variables: [
          { key: "SERVICE_NAME", value: serviceName },
          { key: "TARGET", value: target },
          { key: "VERSION", value: version },
        ],
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Pipeline trigger failed: ${res.status} ${res.statusText}${text ? ` - ${text.slice(0, 200)}` : ""}`,
    );
  }

  const data = (await res.json()) as GitLabPipelineResponse;
  return { id: data.id, webUrl: data.web_url };
}

export function isValidJobStatus(
  status: string,
): status is PipelineJob["status"] {
  return [
    "pending",
    "running",
    "success",
    "failed",
    "canceled",
    "skipped",
  ].includes(status);
}

export async function getPipelineStatus(
  pipelineId: number,
): Promise<PipelineStatus> {
  const token = getReadToken();
  const headers: Record<string, string> = token
    ? { "PRIVATE-TOKEN": token }
    : {};

  const [pipelineRes, jobsRes] = await Promise.all([
    fetch(
      `${GITLAB_BASE}/projects/${RELEASE_TES_PROJECT}/pipelines/${pipelineId}`,
      { headers },
    ),
    fetch(
      `${GITLAB_BASE}/projects/${RELEASE_TES_PROJECT}/pipelines/${pipelineId}/jobs`,
      { headers },
    ),
  ]);

  if (!pipelineRes.ok) {
    throw new Error(
      `Pipeline status fetch failed: ${pipelineRes.status} ${pipelineRes.statusText}`,
    );
  }

  const pipeline = (await pipelineRes.json()) as GitLabPipelineResponse;

  let jobs: PipelineJob[] = [];
  if (jobsRes.ok) {
    const rawJobs = (await jobsRes.json()) as GitLabJobResponse[];
    jobs = rawJobs.map((j) => ({
      id: j.id,
      name: j.name,
      status: isValidJobStatus(j.status) ? j.status : "pending",
      stage: j.stage,
      webUrl: j.web_url,
    }));
  }

  return {
    status: pipeline.status,
    webUrl: pipeline.web_url,
    jobs,
  };
}
