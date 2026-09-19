import type { OverrideMap } from "~/lib/image-override-client";
import { formatRelativeTime } from "~/lib/format";

export function ImageOverrideSection({
  overrides,
}: {
  overrides: OverrideMap;
}) {
  const entries = Object.entries(overrides);
  const hasOverrides = entries.length > 0;

  return (
    <div
      class="card-modern overflow-hidden"
      style={`border-left: 3px solid ${hasOverrides ? "oklch(var(--wa))" : "oklch(var(--su))"}`}
    >
      <div
        class="px-5 py-3 border-b flex items-center justify-between"
        style="border-color: var(--border-default)"
      >
        <h2
          class="text-sm font-semibold flex items-center gap-2"
          style="color: var(--text-heading)"
        >
          <i
            class={`fas fa-code-branch ${hasOverrides ? "text-warning" : "text-success"}`}
          />
          イメージオーバーライド
          {hasOverrides && (
            <span class="badge badge-sm badge-warning">{entries.length}件</span>
          )}
        </h2>
        <a
          href="#/deploy"
          class="text-xs text-primary hover:underline cursor-pointer"
        >
          Deploy →
        </a>
      </div>
      {!hasOverrides ? (
        <div
          class="px-5 py-3 flex items-center gap-2 text-xs"
          style="color: var(--text-muted)"
        >
          <i class="fas fa-check-circle text-success" />
          オーバーライドなし（通常イメージで動作中）
        </div>
      ) : (
        <div class="divide-y" style="border-color: var(--border-default)">
          {entries.map(([name, entry]) => (
            <div key={name} class="flex items-center gap-3 px-5 py-2.5">
              <i class="fas fa-image text-warning w-4 text-center" />
              <div class="flex-1 min-w-0">
                <p
                  class="text-sm font-medium truncate"
                  style="color: var(--text-heading)"
                >
                  {name}
                </p>
                <p class="text-xs truncate" style="color: var(--text-muted)">
                  {entry.override_tag}
                  {entry.ticket && ` · ${entry.ticket}`}
                  {entry.deployed_by && ` · by ${entry.deployed_by}`}
                </p>
              </div>
              <div
                class="flex items-center gap-2 shrink-0 text-xs"
                style="color: var(--text-subtle)"
              >
                {entry.ttl_hours > 0 && (
                  <span class="badge badge-sm badge-ghost">
                    {entry.ttl_hours}h
                  </span>
                )}
                {formatRelativeTime(entry.deployed_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
