import type { ServiceVersionState } from "~/lib/migration-client";

export function MigrationSummarySection({
  services,
  loading,
}: {
  services: ServiceVersionState[];
  loading: boolean;
}) {
  if (loading && services.length === 0) {
    return (
      <div class="card-modern px-5 py-3 flex items-center gap-2">
        <i
          class="fas fa-spinner fa-spin text-sm"
          style="color: var(--text-muted)"
        />
        <span class="text-sm" style="color: var(--text-muted)">
          Migration バージョン取得中...
        </span>
      </div>
    );
  }

  const problematic = services.filter((s) => s.version?.dirty || !!s.error);
  const hasProblem = problematic.length > 0;

  return (
    <div
      class="card-modern overflow-hidden"
      style={`border-left: 3px solid ${hasProblem ? "oklch(var(--er))" : "oklch(var(--su))"}`}
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
            class={`fas fa-database ${hasProblem ? "text-error" : "text-success"}`}
          />
          Migration バージョン
          {hasProblem && (
            <span class="badge badge-sm badge-error">
              {problematic.length} 要確認
            </span>
          )}
        </h2>
        <a
          href="#/migration"
          class="text-xs text-primary hover:underline cursor-pointer"
        >
          Migration →
        </a>
      </div>
      <div class="px-5 py-3 flex flex-wrap gap-2">
        {services.map((svc) => {
          const isDirty = svc.version?.dirty;
          const isError = !!svc.error;
          const isProblem = isDirty || isError;
          return (
            <span
              key={svc.id}
              class={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${isProblem ? "text-error" : "text-success"}`}
              style={`background: ${isProblem ? "oklch(var(--er) / 0.1)" : "oklch(var(--su) / 0.1)"}`}
              title={
                svc.error ??
                (isDirty
                  ? "dirty"
                  : `version: ${svc.version?.version ?? "unknown"}`)
              }
            >
              <i
                class={`fas ${isProblem ? "fa-circle-xmark" : "fa-circle-check"} text-[10px]`}
              />
              {svc.id}
              {isDirty && <span class="ml-0.5 text-[10px]">dirty</span>}
              {isError && <span class="ml-0.5 text-[10px]">ERR</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}
