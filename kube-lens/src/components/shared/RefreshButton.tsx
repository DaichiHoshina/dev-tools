import { useState, useEffect } from "hono/jsx/dom";

interface Props {
  onRefresh: () => void;
  lastUpdated: Date | null;
}

function formatRelativeTime(date: Date | null): string {
  if (!date) return "未取得";
  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 10) return "たった今";
  if (seconds < 60) return `${seconds}秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分前`;
  return `${Math.floor(minutes / 60)}時間前`;
}

export function RefreshButton({ onRefresh, lastUpdated }: Props) {
  const [spinning, setSpinning] = useState<boolean>(false);
  const [, setTick] = useState<number>(0);

  // 相対時刻の更新（10秒ごと）
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 10000);
    return () => clearInterval(id);
  }, []);

  const handleClick = () => {
    setSpinning(true);
    onRefresh();
    setTimeout(() => setSpinning(false), 1000);
  };

  return (
    <div class="flex items-center gap-2">
      <span class="text-xs" style={`color: var(--text-muted)`}>
        {formatRelativeTime(lastUpdated)}
      </span>
      <button
        type="button"
        onClick={handleClick}
        class="btn btn-ghost btn-sm btn-square rounded-lg"
        title="更新"
        aria-label="更新"
      >
        <i
          class={`fas fa-arrows-rotate text-sm ${spinning ? "fa-spin" : ""}`}
        />
      </button>
    </div>
  );
}
