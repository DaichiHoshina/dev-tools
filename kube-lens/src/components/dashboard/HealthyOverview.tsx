import type { Pod, Deployment } from "~/lib/types";

export function HealthyOverview({
  pods,
  deployments,
}: {
  pods: Pod[];
  deployments: Deployment[];
}) {
  const running = pods.filter((p) => p.phase === "Running").length;
  const readyDeploys = deployments.filter(
    (d) => d.readyReplicas === d.desiredReplicas,
  ).length;

  return (
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <a href="#/pods" class="summary-card cursor-pointer no-underline">
        <div class="flex items-start justify-between">
          <div>
            <div class="summary-card-value">{pods.length}</div>
            <div class="summary-card-label">Pod 合計</div>
          </div>
          <div class="summary-card-icon">
            <i class="fas fa-circle-nodes" />
          </div>
        </div>
      </a>
      <a href="#/pods" class="summary-card cursor-pointer no-underline">
        <div class="flex items-start justify-between">
          <div>
            <div
              class={`summary-card-value ${running < pods.length ? "text-warning" : "text-success"}`}
            >
              {running}
              <span
                class="text-base font-normal"
                style="color: var(--text-muted)"
              >
                /{pods.length}
              </span>
            </div>
            <div class="summary-card-label">正常稼働中</div>
          </div>
          <div class="summary-card-icon">
            <i class="fas fa-circle-check" />
          </div>
        </div>
      </a>
      <a href="#/deployments" class="summary-card cursor-pointer no-underline">
        <div class="flex items-start justify-between">
          <div>
            <div
              class={`summary-card-value ${readyDeploys < deployments.length ? "text-warning" : "text-success"}`}
            >
              {readyDeploys}
              <span
                class="text-base font-normal"
                style="color: var(--text-muted)"
              >
                /{deployments.length}
              </span>
            </div>
            <div class="summary-card-label">Deployment 正常</div>
          </div>
          <div class="summary-card-icon">
            <i class="fas fa-layer-group" />
          </div>
        </div>
      </a>
      <a href="#/events" class="summary-card cursor-pointer no-underline">
        <div class="flex items-start justify-between">
          <div>
            <div class="summary-card-value">
              {pods.reduce((s, p) => s + p.restarts, 0)}
            </div>
            <div class="summary-card-label">再起動 合計</div>
          </div>
          <div class="summary-card-icon">
            <i class="fas fa-arrows-rotate" />
          </div>
        </div>
      </a>
    </div>
  );
}
