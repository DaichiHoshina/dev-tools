import type { PodPhase } from "~/lib/types";

interface StatusConfig {
  icon: string;
  colorClass: string;
  label: string;
}

const STATUS_MAP: Record<PodPhase, StatusConfig> = {
  Running: {
    icon: "fa-circle-check",
    colorClass: "text-success",
    label: "Running",
  },
  Pending: { icon: "fa-clock", colorClass: "text-warning", label: "Pending" },
  Failed: {
    icon: "fa-circle-xmark",
    colorClass: "text-error",
    label: "Failed",
  },
  CrashLoopBackOff: {
    icon: "fa-triangle-exclamation",
    colorClass: "text-error",
    label: "CrashLoop",
  },
  Succeeded: {
    icon: "fa-circle-check",
    colorClass: "text-info",
    label: "Succeeded",
  },
  Unknown: {
    icon: "fa-question",
    colorClass: "text-secondary",
    label: "Unknown",
  },
  Terminating: {
    icon: "fa-spinner fa-spin",
    colorClass: "text-warning",
    label: "Terminating",
  },
};

interface Props {
  status: PodPhase;
  showIcon?: boolean;
  compact?: boolean;
}

export function StatusBadge({
  status,
  showIcon = true,
  compact = false,
}: Props) {
  const config = STATUS_MAP[status] ?? STATUS_MAP["Unknown"];
  return (
    <span
      class={`inline-flex items-center gap-1.5 ${config.colorClass} ${compact ? "text-xs" : "text-sm"}`}
    >
      {showIcon && <i class={`fas ${config.icon} text-xs`} />}
      <span>{config.label}</span>
    </span>
  );
}
