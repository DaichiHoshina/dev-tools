import type {
  ConfigMap,
  Secret,
  Ingress,
  PVC,
  ResourceQuota,
} from "~/lib/types";
import { parseQuantity } from "~/lib/quantity";
import { Term } from "~/components/shared/Term";

function maxQuotaPercent(quotas: ResourceQuota[]): number {
  let max = 0;
  for (const q of quotas) {
    for (const key of Object.keys(q.hard)) {
      const hardVal = parseQuantity(q.hard[key]);
      if (hardVal === 0) continue;
      const usedVal = parseQuantity(q.used[key] ?? "0");
      max = Math.max(max, Math.round((usedVal / hardVal) * 100));
    }
  }
  return max;
}

interface Props {
  ingresses: Ingress[];
  configMaps: ConfigMap[];
  secrets: Secret[];
  pvcs: PVC[];
  quotas: ResourceQuota[];
}

export function ResourceSummaryCards({
  ingresses,
  configMaps,
  secrets,
  pvcs,
  quotas,
}: Props) {
  const boundPVCs = pvcs.filter((p) => p.status === "Bound").length;
  const quotaPct = maxQuotaPercent(quotas);

  return (
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <a href="#/network" class="summary-card cursor-pointer no-underline">
        <div class="flex items-start justify-between">
          <div>
            <div class="summary-card-value">{ingresses.length}</div>
            <div class="summary-card-label">
              <Term k="Ingress">Ingress</Term>
            </div>
          </div>
          <div class="summary-card-icon">
            <i class="fas fa-network-wired" />
          </div>
        </div>
      </a>
      <a href="#/configmaps" class="summary-card cursor-pointer no-underline">
        <div class="flex items-start justify-between">
          <div>
            <div class="summary-card-value">
              {configMaps.length}
              <span
                class="text-base font-normal"
                style="color: var(--text-muted)"
              >
                +{secrets.length}
              </span>
            </div>
            <div class="summary-card-label">
              <Term k="ConfigMap">CM</Term> / <Term k="Secret">Secret</Term>
            </div>
          </div>
          <div class="summary-card-icon">
            <i class="fas fa-file-code" />
          </div>
        </div>
      </a>
      <a href="#/storage" class="summary-card cursor-pointer no-underline">
        <div class="flex items-start justify-between">
          <div>
            <div
              class={`summary-card-value ${boundPVCs < pvcs.length ? "text-warning" : pvcs.length > 0 ? "text-success" : ""}`}
            >
              {pvcs.length > 0 ? (
                <>
                  {boundPVCs}
                  <span
                    class="text-base font-normal"
                    style="color: var(--text-muted)"
                  >
                    /{pvcs.length}
                  </span>
                </>
              ) : (
                <span style="color: var(--text-muted)">-</span>
              )}
            </div>
            <div class="summary-card-label">
              <Term k="PVC">PVC</Term> <Term k="Bound">Bound</Term>
            </div>
          </div>
          <div class="summary-card-icon">
            <i class="fas fa-hard-drive" />
          </div>
        </div>
      </a>
      <a href="#/quotas" class="summary-card cursor-pointer no-underline">
        <div class="flex items-start justify-between">
          <div>
            <div
              class={`summary-card-value ${quotaPct >= 90 ? "text-error" : quotaPct >= 70 ? "text-warning" : quotaPct > 0 ? "text-success" : ""}`}
            >
              {quotas.length > 0 ? (
                <>
                  {quotaPct}
                  <span
                    class="text-base font-normal"
                    style="color: var(--text-muted)"
                  >
                    %
                  </span>
                </>
              ) : (
                <span style="color: var(--text-muted)">-</span>
              )}
            </div>
            <div class="summary-card-label">
              <Term k="ResourceQuota">Quota</Term> 最大
            </div>
          </div>
          <div class="summary-card-icon">
            <i class="fas fa-gauge-high" />
          </div>
        </div>
      </a>
    </div>
  );
}
