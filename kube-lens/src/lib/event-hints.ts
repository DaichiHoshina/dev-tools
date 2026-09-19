import type { K8sEvent } from "~/lib/types";

interface EventHint {
  safe: boolean;
  hint: string;
}

const SAFE_PATTERNS: {
  reason: RegExp;
  message?: RegExp;
  maxCount?: number;
  hint: string;
}[] = [
  {
    reason: /^Unhealthy$/,
    message: /Readiness probe failed/,
    hint: "起動時の一時的なヘルスチェック失敗です。Podが起動完了すれば解消します",
  },
  {
    reason: /^Unhealthy$/,
    message: /Liveness probe failed/,
    maxCount: 3,
    hint: "起動時の一時的なヘルスチェック失敗です。少数回なら問題ありません",
  },
  {
    reason: /^Pulled$/,
    message: /Successfully pulled image/,
    hint: "コンテナイメージの取得に成功しました（正常動作）",
  },
  {
    reason: /^Scheduled$/,
    message: /Successfully assigned/,
    hint: "PodがNodeに正常に割り当てられました（正常動作）",
  },
  {
    reason: /^ScalingReplicaSet$/,
    hint: "Deploymentによる通常のスケーリング操作です（正常動作）",
  },
];

export function getEventHint(event: K8sEvent): EventHint {
  for (const pattern of SAFE_PATTERNS) {
    if (!pattern.reason.test(event.reason)) continue;
    if (pattern.message && !pattern.message.test(event.message)) continue;
    if (pattern.maxCount !== undefined && event.count > pattern.maxCount)
      continue;
    return { safe: true, hint: pattern.hint };
  }
  return { safe: false, hint: "" };
}
