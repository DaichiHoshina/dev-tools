import type { PipelineInfo, PipelineStatus } from "~/lib/types";

interface PipelineBadgeProps {
  pipeline: PipelineInfo | null | undefined;
  loading?: boolean;
}

const STATUS_CONFIG: Record<
  PipelineStatus,
  { icon: string; label: string; class: string }
> = {
  success: { icon: "fa-check-circle", label: "passed", class: "badge-success" },
  failed: { icon: "fa-times-circle", label: "failed", class: "badge-error" },
  running: {
    icon: "fa-spinner fa-spin",
    label: "running",
    class: "badge-info",
  },
  pending: { icon: "fa-clock", label: "pending", class: "badge-warning" },
  canceled: { icon: "fa-ban", label: "canceled", class: "badge-ghost" },
  skipped: { icon: "fa-forward", label: "skipped", class: "badge-ghost" },
  created: { icon: "fa-circle", label: "created", class: "badge-ghost" },
  manual: { icon: "fa-hand", label: "manual", class: "badge-ghost" },
  waiting_for_resource: {
    icon: "fa-hourglass",
    label: "waiting",
    class: "badge-warning",
  },
  preparing: { icon: "fa-gear", label: "preparing", class: "badge-info" },
};

export function PipelineBadge({ pipeline, loading }: PipelineBadgeProps) {
  if (loading) {
    return (
      <span class="badge badge-sm badge-ghost gap-1">
        <span
          class="loading loading-spinner"
          style="width: 10px; height: 10px;"
        />
      </span>
    );
  }

  if (!pipeline) {
    return (
      <span class="badge badge-sm badge-ghost gap-1">
        <i class="fas fa-minus text-[10px]" aria-hidden="true" />
        <span>no pipeline</span>
      </span>
    );
  }

  const config = STATUS_CONFIG[pipeline.status] ?? STATUS_CONFIG.created;

  const badge = (
    <span class={`badge badge-sm gap-1 ${config.class}`}>
      <i class={`fas ${config.icon} text-[10px]`} aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );

  if (pipeline.web_url) {
    return (
      <a
        href={pipeline.web_url}
        target="_blank"
        rel="noopener noreferrer"
        class="no-underline hover:opacity-80 transition-opacity"
        title="パイプラインを開く"
      >
        {badge}
      </a>
    );
  }

  return badge;
}
