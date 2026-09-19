import { useState, useEffect } from "hono/jsx/dom";
import type { Pod } from "~/lib/types";
import type { K8sClient } from "~/lib/k8s-client";
import { isHiddenContainer } from "~/lib/k8s-filters";

interface Props {
  client: K8sClient;
  pods: Pod[];
  initialPod?: string;
  initialContainer?: string;
}

type TailLines = 100 | 300 | 500 | 1000;
type LevelFilter = "all" | "warn+" | "error";

interface ParsedLog {
  level: string;
  message: string;
  caller?: string;
  raw: string;
}

// JSON構造化ログをパース
function parseLogLine(line: string): ParsedLog | null {
  if (!line.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const level = parsed["level"];
    const message = parsed["message"] ?? parsed["msg"];
    if (typeof level !== "string") return null;
    return {
      level: level.toLowerCase(),
      message: typeof message === "string" ? message : "",
      caller:
        typeof parsed["caller"] === "string" ? parsed["caller"] : undefined,
      raw: line,
    };
  } catch {
    return null;
  }
}

function matchesLevelFilter(line: string, filter: LevelFilter): boolean {
  if (filter === "all") return true;
  const parsed = parseLogLine(line);
  if (parsed === null) return true; // 非JSONは常に表示
  const level = parsed.level;
  if (filter === "error") return level === "error" || level === "fatal";
  if (filter === "warn+")
    return (
      level === "warn" ||
      level === "warning" ||
      level === "error" ||
      level === "fatal"
    );
  return true;
}

function getLevelLabel(level: string): string {
  switch (level) {
    case "error":
    case "fatal":
      return "ERROR";
    case "warn":
    case "warning":
      return "WARN";
    case "info":
      return "INFO";
    case "debug":
      return "DEBUG";
    default:
      return level.toUpperCase();
  }
}

function getLineClass(level: string): string {
  if (level === "error" || level === "fatal") return "log-line log-line-error";
  if (level === "warn" || level === "warning") return "log-line log-line-warn";
  return "log-line";
}

// コンパクト表示: [LEVEL] caller: message
function formatCompact(parsed: ParsedLog): string {
  const label = getLevelLabel(parsed.level);
  const caller = parsed.caller ? parsed.caller.replace(/^.*\//, "") : "";
  return caller
    ? `[${label}] ${caller}: ${parsed.message}`
    : `[${label}] ${parsed.message}`;
}

export function LogViewer({
  client,
  pods,
  initialPod,
  initialContainer,
}: Props) {
  const [selectedPod, setSelectedPod] = useState<string>(initialPod ?? "");
  const [selectedContainer, setSelectedContainer] = useState<string>(
    initialContainer ?? "",
  );
  const [tailLines, setTailLines] = useState<TailLines>(500);
  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [searchText, setSearchText] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("warn+");
  const [rawMode, setRawMode] = useState<boolean>(false);

  // 選択中PodのContainers一覧（istio等を除外）
  const currentPod = pods.find((p) => p.name === selectedPod);
  const containers = (currentPod?.containers ?? []).filter(
    (c) => !isHiddenContainer(c.name),
  );

  // Pod選択変更時にコンテナをリセット（istio除外済みの先頭を選択）
  const handlePodChange = (podName: string) => {
    setSelectedPod(podName);
    const pod = pods.find((p) => p.name === podName);
    const appContainers = (pod?.containers ?? []).filter(
      (c) => !isHiddenContainer(c.name),
    );
    setSelectedContainer(appContainers[0]?.name ?? "");
  };

  const [refreshKey, setRefreshKey] = useState(0);

  // Pod/コンテナ/行数が変わったらログを再取得 + 5秒間隔で自動リロード
  useEffect(() => {
    if (!selectedPod) return;
    let cancelled = false;
    const fetchLogs = async () => {
      setLoading(true);
      setError(null);
      try {
        const logText = await client.getPodLogs(
          currentPod?.namespace ?? "",
          selectedPod,
          selectedContainer || undefined,
          tailLines,
        );
        if (!cancelled) setLogs(logText);
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "ログの取得に失敗しました",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchLogs();
    const id = setInterval(() => void fetchLogs(), 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selectedPod, selectedContainer, tailLines, refreshKey]);

  // 自動スクロール
  useEffect(() => {
    if (autoScroll && logs) {
      const el = document.getElementById("log-area");
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [logs, autoScroll]);

  // クリップボードコピー
  const handleCopy = () => {
    void navigator.clipboard.writeText(logs).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ログ行をレンダリング（レベルフィルタ + コンパクト表示 + 検索ハイライト）
  const renderLogLines = () => {
    if (!logs) return null;
    const lines = logs.split("\n");
    const filtered = lines.filter(
      (line) => line.trim() !== "" && matchesLevelFilter(line, levelFilter),
    );
    if (filtered.length === 0) {
      return (
        <span style="color: var(--text-subtle)">
          該当するログがありません（フィルタ: {levelFilter}）
        </span>
      );
    }
    return filtered.map((line, idx) => {
      const parsed = parseLogLine(line);
      const displayText = parsed && !rawMode ? formatCompact(parsed) : line;
      const level = parsed?.level ?? "";
      const isHighlight =
        searchText &&
        displayText.toLowerCase().includes(searchText.toLowerCase());
      const baseClass = parsed ? getLineClass(level) : "log-line";
      return (
        <span
          key={idx}
          class={`${baseClass}${isHighlight ? " highlight" : ""}`}
          title={parsed && !rawMode ? parsed.raw : undefined}
        >
          {displayText}
        </span>
      );
    });
  };

  return (
    <div>
      {/* コントロールバー */}
      <div class="flex flex-wrap items-center gap-3 mb-4">
        {/* Pod選択 */}
        <div class="flex flex-col gap-1">
          <label class="text-xs" style="color: var(--text-muted)">
            Pod
          </label>
          <select
            value={selectedPod}
            onChange={(e) =>
              handlePodChange((e.target as HTMLSelectElement).value)
            }
            class="search-input pr-8 min-w-48"
          >
            <option value="">Pod を選択...</option>
            {pods.map((pod) => (
              <option key={pod.name} value={pod.name}>
                {pod.name}
              </option>
            ))}
          </select>
        </div>

        {/* コンテナ選択 */}
        {containers.length > 1 && (
          <div class="flex flex-col gap-1">
            <label class="text-xs" style="color: var(--text-muted)">
              コンテナ
            </label>
            <select
              value={selectedContainer}
              onChange={(e) =>
                setSelectedContainer((e.target as HTMLSelectElement).value)
              }
              class="search-input pr-8"
            >
              {containers.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 行数 */}
        <div class="flex flex-col gap-1">
          <label class="text-xs" style="color: var(--text-muted)">
            表示行数
          </label>
          <select
            value={String(tailLines)}
            onChange={(e) =>
              setTailLines(
                Number((e.target as HTMLSelectElement).value) as TailLines,
              )
            }
            class="search-input pr-8"
          >
            {([100, 300, 500, 1000] as TailLines[]).map((n) => (
              <option key={n} value={String(n)}>
                {n}行
              </option>
            ))}
          </select>
        </div>

        {/* 検索 */}
        <div class="flex flex-col gap-1">
          <label class="text-xs" style="color: var(--text-muted)">
            検索
          </label>
          <input
            type="text"
            placeholder="ログを検索..."
            value={searchText}
            onInput={(e) => setSearchText((e.target as HTMLInputElement).value)}
            class="search-input w-48"
          />
        </div>

        {/* レベルフィルタ */}
        <div class="flex flex-col gap-1">
          <label class="text-xs" style="color: var(--text-muted)">
            レベル
          </label>
          <div class="flex gap-1">
            {(
              [
                { value: "all", label: "ALL" },
                { value: "warn+", label: "WARN+" },
                { value: "error", label: "ERROR" },
              ] as { value: LevelFilter; label: string }[]
            ).map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setLevelFilter(value)}
                class={`btn btn-xs rounded ${
                  levelFilter === value
                    ? value === "error"
                      ? "btn-error"
                      : value === "warn+"
                        ? "btn-warning"
                        : "btn-neutral"
                    : "btn-ghost"
                }`}
                style={
                  levelFilter !== value
                    ? "border: 1px solid var(--border-default)"
                    : ""
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* アクションボタン群 */}
        <div class="flex items-end gap-2 ml-auto">
          {/* RAW表示トグル */}
          <label
            class="flex items-center gap-1.5 text-xs cursor-pointer"
            style="color: var(--text-muted)"
          >
            <input
              type="checkbox"
              checked={rawMode}
              onChange={(e) =>
                setRawMode((e.target as HTMLInputElement).checked)
              }
              class="checkbox checkbox-xs"
            />
            RAW
          </label>

          {/* 自動スクロール */}
          <label
            class="flex items-center gap-1.5 text-xs cursor-pointer"
            style="color: var(--text-muted)"
          >
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) =>
                setAutoScroll((e.target as HTMLInputElement).checked)
              }
              class="checkbox checkbox-xs"
            />
            自動スクロール
          </label>

          {/* 更新ボタン */}
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={!selectedPod || loading}
            class="btn btn-ghost btn-sm rounded-lg"
            title="更新"
          >
            <i class={`fas fa-arrows-rotate ${loading ? "fa-spin" : ""}`} />
          </button>

          {/* コピーボタン */}
          <button
            type="button"
            onClick={handleCopy}
            disabled={!logs}
            class="btn btn-ghost btn-sm rounded-lg"
            title="クリップボードにコピー"
          >
            <i class={`fas ${copied ? "fa-check text-success" : "fa-copy"}`} />
          </button>
        </div>
      </div>

      {/* ログエリア */}
      {!selectedPod ? (
        <div class="log-viewer flex items-center justify-center">
          <p style="color: var(--text-subtle)">Pod を選択してください</p>
        </div>
      ) : error ? (
        <div class="log-viewer flex items-center justify-center">
          <p class="text-error">{error}</p>
        </div>
      ) : (
        <pre id="log-area" class="log-viewer">
          {loading && !logs ? (
            <span style="color: var(--text-subtle)">読み込み中...</span>
          ) : (
            renderLogLines()
          )}
        </pre>
      )}
    </div>
  );
}
