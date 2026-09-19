export function AllHealthy() {
  return (
    <div
      class="card-modern p-6 flex items-center gap-4"
      style="border-left: 3px solid oklch(var(--su))"
    >
      <div
        class="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
        style="background: oklch(var(--su) / 0.1)"
      >
        <i class="fas fa-circle-check text-success text-lg" />
      </div>
      <div>
        <p class="text-sm font-semibold" style="color: var(--text-heading)">
          すべて正常に稼働しています
        </p>
        <p class="text-xs mt-0.5" style="color: var(--text-muted)">
          問題のある Pod や Deployment はありません
        </p>
      </div>
    </div>
  );
}
