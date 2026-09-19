import type { Job } from "~/lib/types";
import { formatRelativeTime } from "~/lib/format";

const RECENT_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24時間

export function FailedJobsSummary({ jobs }: { jobs: Job[] }) {
  const now = Date.now();
  const failed = jobs.filter(
    (j) =>
      j.status === "Failed" &&
      (!j.startTime ||
        now - new Date(j.startTime).getTime() < RECENT_THRESHOLD_MS),
  );
  if (failed.length === 0) return null;

  return (
    <div
      class="card-modern overflow-hidden"
      style="border-left: 3px solid oklch(var(--er))"
    >
      <div
        class="px-5 py-3 border-b flex items-center justify-between"
        style="border-color: var(--border-default)"
      >
        <h2
          class="text-sm font-semibold flex items-center gap-2"
          style="color: var(--text-heading)"
        >
          <i class="fas fa-list-check text-error" />
          失敗した Job ({failed.length}件)
        </h2>
        <a
          href="#/jobs"
          class="text-xs text-primary hover:underline cursor-pointer"
        >
          すべて見る →
        </a>
      </div>
      <div class="divide-y" style="border-color: var(--border-default)">
        {failed.slice(0, 5).map((job) => (
          <div
            key={`${job.namespace}/${job.name}`}
            class="flex items-center gap-3 px-5 py-3"
          >
            <i class="fas fa-circle-xmark text-error w-4 text-center" />
            <div class="flex-1 min-w-0">
              <p
                class="text-sm font-medium truncate"
                style="color: var(--text-heading)"
              >
                {job.name}
              </p>
              <p class="text-xs" style="color: var(--text-muted)">
                {job.cronJobName && `${job.cronJobName} · `}
                {job.failed > 0 && `失敗 ${job.failed}回`}
                {job.startTime && ` · ${formatRelativeTime(job.startTime)}`}
              </p>
            </div>
            <span class="badge badge-sm badge-error">Failed</span>
          </div>
        ))}
      </div>
    </div>
  );
}
