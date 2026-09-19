import { useState } from "hono/jsx/dom";
import { useK8sData } from "~/hooks/use-k8s";
import type { K8sClient } from "~/lib/k8s-client";
import type { CronJob, Job } from "~/lib/types";
import { RefreshButton } from "~/components/shared/RefreshButton";
import { EmptyState } from "~/components/shared/EmptyState";
import { NamespaceSelector } from "~/components/shared/NamespaceSelector";
import { PageGuide } from "~/components/shared/PageGuide";
import { Term } from "~/components/shared/Term";
import { navigate } from "~/lib/router";
import { formatRelativeTime } from "~/lib/format";
import { triggerCronJob } from "~/lib/cronjob-client";
import type { OverrideEnv } from "~/lib/image-override-client";

interface Props {
  client: K8sClient;
  selectedNamespaces: string[];
  namespaces: string[];
  onNamespacesChange: (ns: string[]) => void;
}

type TabKey = "cronjobs" | "jobs";

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m${s > 0 ? `${s}s` : ""}`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h${rm > 0 ? `${rm}m` : ""}`;
}

function CronJobRow({
  cj,
  env,
  onTrigger,
}: {
  cj: CronJob;
  env: OverrideEnv;
  onTrigger: (cj: CronJob) => void;
}) {
  const isActive = cj.activeCount > 0;

  return (
    <div
      class="card-modern px-5 py-3.5"
      style={
        cj.suspend
          ? "border-left: 3px dashed oklch(var(--wa) / 0.5)"
          : isActive
            ? "border-left: 3px solid oklch(var(--in))"
            : ""
      }
    >
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <i
              class={`fas ${
                cj.suspend
                  ? "fa-pause-circle text-base-content/40"
                  : isActive
                    ? "fa-spinner fa-spin text-info"
                    : "fa-clock text-success"
              } text-xs shrink-0`}
            />
            <p
              class="text-sm font-medium truncate"
              style="color: var(--text-heading)"
            >
              {cj.name}
            </p>
            {cj.suspend && (
              <span
                class="badge text-[11px] font-medium px-2.5 py-1"
                style="background: oklch(var(--wa) / 0.15); color: oklch(var(--wa))"
              >
                Suspended
              </span>
            )}
            {isActive && (
              <span class="badge badge-info text-[11px] font-medium px-2.5 py-1">
                実行中 {cj.activeCount}
              </span>
            )}
          </div>
          <div class="flex items-center gap-2.5 mt-1 ml-5">
            <span class="k8s-badge text-[10px] px-2.5 py-0.5">
              {cj.namespace}
            </span>
            <span class="text-xs font-mono" style="color: var(--text-muted)">
              {cj.schedule}
            </span>
          </div>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (!confirm(`${cj.name} を手動実行しますか？`)) return;
              onTrigger(cj);
            }}
            class="btn btn-sm rounded"
            style="background: oklch(var(--su) / 0.15); color: oklch(var(--su)); border: 1px solid oklch(var(--su) / 0.3)"
            title="手動で Job を作成して実行"
          >
            <i class="fas fa-play text-[10px]" />
            実行
          </button>
          <div class="text-right text-xs" style="color: var(--text-muted)">
            <div>
              最終実行:{" "}
              {cj.lastScheduleTime
                ? formatRelativeTime(cj.lastScheduleTime)
                : "なし"}
            </div>
            <div>
              最終成功:{" "}
              {cj.lastSuccessfulTime
                ? formatRelativeTime(cj.lastSuccessfulTime)
                : "なし"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function JobRow({ job }: { job: Job }) {
  const isRunning = job.status === "Active";
  const isFailed = job.status === "Failed";

  return (
    <div
      class="card-modern px-5 py-3.5"
      style={
        isFailed
          ? "border-left: 3px solid oklch(var(--er))"
          : isRunning
            ? "border-left: 3px solid oklch(var(--in))"
            : ""
      }
    >
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <i
              class={`fas ${
                isFailed
                  ? "fa-circle-xmark text-error"
                  : isRunning
                    ? "fa-spinner fa-spin text-info"
                    : "fa-circle-check text-success"
              } text-xs shrink-0`}
            />
            <p
              class="text-sm font-medium truncate"
              style="color: var(--text-heading)"
            >
              {job.name}
            </p>
            <span
              class={`badge text-[11px] font-medium px-2.5 py-1 ${
                isFailed
                  ? "badge-error"
                  : isRunning
                    ? "badge-info"
                    : "badge-success"
              }`}
            >
              {job.status}
            </span>
          </div>
          <div class="flex items-center gap-2.5 mt-1 ml-5">
            <span class="k8s-badge text-[10px] px-2.5 py-0.5">
              {job.namespace}
            </span>
            {job.cronJobName && (
              <span
                class="text-xs flex items-center gap-1"
                style="color: var(--text-muted)"
              >
                <i class="fas fa-clock text-[10px]" />
                {job.cronJobName}
              </span>
            )}
          </div>
        </div>
        <div
          class="text-right text-xs shrink-0 space-y-0.5"
          style="color: var(--text-muted)"
        >
          {job.startTime && (
            <div>開始: {formatRelativeTime(job.startTime)}</div>
          )}
          {job.durationSeconds !== undefined && (
            <div>実行時間: {formatDuration(job.durationSeconds)}</div>
          )}
          {job.failed > 0 && <div class="text-error">失敗: {job.failed}回</div>}
        </div>
      </div>
    </div>
  );
}

export function JobsPage({
  client,
  selectedNamespaces,
  namespaces,
  onNamespacesChange,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("cronjobs");
  const [triggerMsg, setTriggerMsg] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const env = client.config.environment as OverrideEnv;
  const nsKey = selectedNamespaces.join(",");

  const cronJobs = useK8sData(
    async () => {
      const results = await Promise.all(
        selectedNamespaces.map((ns) =>
          client.getCronJobsInNamespace(ns).catch(() => [] as CronJob[]),
        ),
      );
      return results.flat().sort((a, b) => a.name.localeCompare(b.name));
    },
    client.config.refreshInterval,
    [nsKey],
  );

  const jobs = useK8sData(
    async () => {
      const results = await Promise.all(
        selectedNamespaces.map((ns) =>
          client.getJobsInNamespace(ns).catch(() => [] as Job[]),
        ),
      );
      return results
        .flat()
        .sort(
          (a, b) =>
            new Date(b.startTime ?? 0).getTime() -
            new Date(a.startTime ?? 0).getTime(),
        );
    },
    client.config.refreshInterval,
    [nsKey],
  );

  const handleRefresh = () => {
    cronJobs.refresh();
    jobs.refresh();
  };

  const handleTrigger = async (cj: CronJob) => {
    try {
      const jobName = await triggerCronJob(
        client.config.project,
        env,
        cj.namespace,
        cj.name,
      );
      setTriggerMsg({
        text: `Job "${jobName}" を作成しました`,
        type: "success",
      });
      // 数秒後にジョブ一覧を更新
      setTimeout(() => jobs.refresh(), 2000);
    } catch (e) {
      setTriggerMsg({
        text: e instanceof Error ? e.message : `${cj.name}: 手動実行失敗`,
        type: "error",
      });
    }
    setTimeout(() => setTriggerMsg(null), 5000);
  };

  const failedJobs = (jobs.data ?? []).filter((j) => j.status === "Failed");
  const runningJobs = (jobs.data ?? []).filter((j) => j.status === "Active");
  const suspendedCronJobs = (cronJobs.data ?? []).filter((cj) => cj.suspend);

  const anyError = cronJobs.error ?? jobs.error;
  if (anyError) {
    return (
      <EmptyState
        icon="fa-plug-circle-exclamation"
        title="接続エラー"
        description={anyError}
        action={{ label: "再試行", onClick: handleRefresh }}
      />
    );
  }

  return (
    <div>
      <div class="page-header">
        <div>
          <h1 class="page-title">
            Jobs
            {failedJobs.length > 0 && (
              <span class="text-sm font-normal ml-2 text-error">
                ({failedJobs.length}件失敗)
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
        <RefreshButton
          onRefresh={handleRefresh}
          lastUpdated={cronJobs.lastUpdated}
        />
      </div>

      <PageGuide id="jobs">
        <Term k="CronJob">CronJob</Term>
        のスケジュール状態と実行履歴を確認できます。 赤いカードは失敗した Job
        です。エラーログは{" "}
        <a href="#/error-logs" class="text-primary hover:underline">
          Errors
        </a>{" "}
        ページで確認できます。
      </PageGuide>

      {/* サマリーバー */}
      {(failedJobs.length > 0 ||
        runningJobs.length > 0 ||
        suspendedCronJobs.length > 0) && (
        <div class="flex flex-wrap gap-2.5 mb-4">
          {failedJobs.length > 0 && (
            <button
              type="button"
              class="badge badge-error badge-lg gap-1.5 cursor-pointer px-3"
              onClick={() => setActiveTab("jobs")}
            >
              <i class="fas fa-circle-xmark text-xs" />
              失敗 {failedJobs.length}件
            </button>
          )}
          {runningJobs.length > 0 && (
            <span class="badge badge-info badge-lg gap-1.5 px-3">
              <i class="fas fa-spinner fa-spin text-xs" />
              実行中 {runningJobs.length}件
            </span>
          )}
          {suspendedCronJobs.length > 0 && (
            <span
              class="badge badge-lg gap-1.5 px-3"
              style="background: oklch(var(--wa) / 0.15); color: oklch(var(--wa))"
            >
              <i class="fas fa-pause text-xs" />
              停止中 {suspendedCronJobs.length}件
            </span>
          )}
        </div>
      )}

      {/* タブ */}
      <div class="tabs tabs-box mb-4" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "cronjobs"}
          class={`tab${activeTab === "cronjobs" ? " tab-active" : ""}`}
          onClick={() => setActiveTab("cronjobs")}
        >
          <i class="fas fa-clock mr-1.5" />
          CronJobs
          {cronJobs.data && (
            <span class="ml-1 text-xs opacity-70">{cronJobs.data.length}</span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "jobs"}
          class={`tab${activeTab === "jobs" ? " tab-active" : ""}`}
          onClick={() => setActiveTab("jobs")}
        >
          <i class="fas fa-list-check mr-1.5" />
          Jobs（実行履歴）
          {jobs.data && (
            <span class="ml-1 text-xs opacity-70">{jobs.data.length}</span>
          )}
          {failedJobs.length > 0 && (
            <span class="ml-1.5 badge badge-sm badge-error px-1.5">
              {failedJobs.length}
            </span>
          )}
        </button>
      </div>

      {/* トリガー結果メッセージ */}
      {triggerMsg && (
        <div
          class="px-3 py-2 rounded-lg text-xs mb-3 flex items-center gap-2"
          style={`background: ${triggerMsg.type === "success" ? "oklch(var(--su) / 0.1)" : "oklch(var(--er) / 0.1)"}; color: ${triggerMsg.type === "success" ? "oklch(var(--su))" : "oklch(var(--er))"}`}
        >
          <i
            class={`fas ${triggerMsg.type === "success" ? "fa-check-circle" : "fa-times-circle"}`}
          />
          {triggerMsg.text}
        </div>
      )}

      {/* CronJobs タブ */}
      {activeTab === "cronjobs" && (
        <>
          {cronJobs.loading && !cronJobs.data ? (
            <div class="flex items-center justify-center py-16">
              <i
                class="fas fa-spinner fa-spin text-2xl"
                style="color: var(--text-muted)"
              />
            </div>
          ) : (cronJobs.data ?? []).length === 0 ? (
            <EmptyState
              icon="fa-clock"
              title="CronJob がありません"
              description="選択中の Namespace に CronJob が見つかりません"
            />
          ) : (
            <div class="space-y-2">
              {(cronJobs.data ?? []).map((cj) => (
                <CronJobRow
                  key={`${cj.namespace}/${cj.name}`}
                  cj={cj}
                  env={env}
                  onTrigger={(c) => void handleTrigger(c)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Jobs タブ */}
      {activeTab === "jobs" && (
        <>
          {jobs.loading && !jobs.data ? (
            <div class="flex items-center justify-center py-16">
              <i
                class="fas fa-spinner fa-spin text-2xl"
                style="color: var(--text-muted)"
              />
            </div>
          ) : (jobs.data ?? []).length === 0 ? (
            <EmptyState
              icon="fa-list-check"
              title="Job がありません"
              description="選択中の Namespace に Job が見つかりません"
            />
          ) : (
            <div class="space-y-2">
              {(jobs.data ?? []).map((job) => (
                <JobRow key={`${job.namespace}/${job.name}`} job={job} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
