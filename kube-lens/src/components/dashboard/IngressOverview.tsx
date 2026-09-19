import type {} from "hono/jsx/dom";
import type { Ingress } from "~/lib/types";
import { Term } from "~/components/shared/Term";

export function IngressOverview({ ingresses }: { ingresses: Ingress[] }) {
  if (ingresses.length === 0) return null;

  const hasTLS = ingresses.some((i) => i.tls.length > 0);

  return (
    <div
      class="card-modern overflow-hidden"
      style={`border-left: 3px solid oklch(var(--${hasTLS ? "su" : "in"}))`}
    >
      <div
        class="px-5 py-3 border-b flex items-center justify-between"
        style="border-color: var(--border-default)"
      >
        <h2
          class="text-sm font-semibold flex items-center gap-2"
          style="color: var(--text-heading)"
        >
          <i class="fas fa-network-wired text-info" />
          <Term k="Ingress">Ingress</Term> ({ingresses.length}件)
        </h2>
        <a
          href="#/network"
          class="text-xs text-primary hover:underline cursor-pointer"
        >
          Network →
        </a>
      </div>
      <div class="divide-y" style="border-color: var(--border-default)">
        {ingresses.map((ing) => (
          <div key={`${ing.namespace}/${ing.name}`} class="px-5 py-2.5">
            <div class="flex items-center gap-2 mb-1">
              <p
                class="text-xs font-medium truncate"
                style="color: var(--text-heading)"
              >
                {ing.name}
              </p>
              {ing.tls.length > 0 && (
                <span class="badge badge-xs badge-success text-[10px]">
                  <Term k="TLS">TLS</Term>
                </span>
              )}
              <span
                class="text-[10px] ml-auto shrink-0"
                style="color: var(--text-subtle)"
              >
                {ing.namespace}
              </span>
            </div>
            {ing.rules.map((rule) => (
              <div
                key={rule.host}
                class="flex items-center gap-2 text-[11px] ml-2"
                style="color: var(--text-muted)"
              >
                <span class="truncate font-mono" style="max-width: 220px">
                  {rule.host}
                </span>
                <i class="fas fa-arrow-right text-[8px]" />
                <span class="truncate">
                  {rule.paths
                    .map(
                      (p) =>
                        `${p.serviceName}:${p.servicePort}${p.path !== "/" ? p.path : ""}`,
                    )
                    .join(", ")}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
