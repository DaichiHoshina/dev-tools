import { useState, useEffect, useMemo } from "hono/jsx/dom";
import type { K8sClient } from "~/lib/k8s-client";
import { RefreshButton } from "~/components/shared/RefreshButton";
import { EmptyState } from "~/components/shared/EmptyState";
import { NamespaceSelector } from "~/components/shared/NamespaceSelector";
import { PageGuide } from "~/components/shared/PageGuide";
import { isHiddenContainer } from "~/lib/k8s-filters";

interface Props {
  client: K8sClient;
  selectedNamespaces: string[];
  namespaces: string[];
  onNamespacesChange: (ns: string[]) => void;
}

interface ErrorLogEntry {
  namespace: string;
  pod: string;
  container: string;
  level: string;
  message: string;
  caller: string;
  time: string;
  raw: string;
}

type TimeRange = "5m" | "15m" | "30m" | "1h" | "2h" | "6h" | "all";

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "5m", label: "5分" },
  { value: "15m", label: "15分" },
  { value: "30m", label: "30分" },
  { value: "1h", label: "1時間" },
  { value: "2h", label: "2時間" },
  { value: "6h", label: "6時間" },
  { value: "all", label: "すべて" },
];

function getTimeThreshold(range: TimeRange): number {
  if (range === "all") return 0;
  const minutesMap: Record<Exclude<TimeRange, "all">, number> = {
    "5m": 5,
    "15m": 15,
    "30m": 30,
    "1h": 60,
    "2h": 120,
    "6h": 360,
  };
  return Date.now() - minutesMap[range] * 60 * 1000;
}

/**
 * kubectl logs --timestamps 形式の行からタイムスタンプとJSONを分離する。
 * 形式: "2026-02-23T09:30:03.607635964Z {\"level\":...}"
 * タイムスタンプがない場合は { prefix: "", json: line } を返す。
 */
function splitTimestampPrefix(line: string): {
  prefix: string;
  json: string;
} {
  // RFC3339Nano + space + JSON
  const match = /^(\d{4}-\d{2}-\d{2}T\S+)\s+(\{.*)$/.exec(line);
  if (match) return { prefix: match[1], json: match[2] };
  return { prefix: "", json: line };
}

/** JSON構造のタイムスタンプフィールドを解決（time / ts / timestamp 対応） */
function resolveTime(parsed: Record<string, unknown>): string {
  const t = parsed["time"] ?? parsed["ts"] ?? parsed["timestamp"];
  if (typeof t === "string") return t;
  // zap の ts はUnix秒（float）
  if (typeof t === "number") return new Date(t * 1000).toISOString();
  return "";
}

function parseJsonLog(
  line: string,
): { level: string; message: string; caller: string; time: string } | null {
  const { prefix, json } = splitTimestampPrefix(line);
  if (!json.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const level = parsed["level"] ?? parsed["severity"];
    if (typeof level !== "string") return null;
    const l = level.toLowerCase();
    if (
      l !== "error" &&
      l !== "fatal" &&
      l !== "warn" &&
      l !== "warning" &&
      l !== "info"
    )
      return null;

    const time = resolveTime(parsed) || prefix;

    return {
      level: l,
      message:
        typeof (parsed["message"] ?? parsed["msg"]) === "string"
          ? ((parsed["message"] ?? parsed["msg"]) as string)
          : "",
      caller:
        typeof parsed["caller"] === "string"
          ? (parsed["caller"] as string).replace(/^.*\//, "")
          : "",
      time,
    };
  } catch {
    return null;
  }
}

function formatTime(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ErrorLogsPage({
  client,
  selectedNamespaces,
  namespaces,
  onNamespacesChange,
}: Props) {
  const [entries, setEntries] = useState<ErrorLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [levelFilter, setLevelFilter] = useState<
    "all" | "warn" | "error" | "info"
  >("warn");
  const [timeRange, setTimeRange] = useState<TimeRange>("1h");
  const [searchText, setSearchText] = useState<string>("");
  const [excludeText, setExcludeText] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const triggerRefresh = () => setRefreshKey((k) => k + 1);

  const namespacesKey = namespaces.join(",");
  useEffect(() => {
    let cancelled = false;

    const fetchLogs = async () => {
      setLoading(true);
      const allEntries: ErrorLogEntry[] = [];
      try {
        const podsByNs = await Promise.all(
          namespaces.map(async (ns) => {
            try {
              const pods = await client.getPodsInNamespace(ns);
              return { ns, pods };
            } catch {
              return { ns, pods: [] };
            }
          }),
        );

        const logPromises: Promise<void>[] = [];
        for (const { ns, pods } of podsByNs) {
          for (const pod of pods) {
            // Running/CrashLoopBackOff + Job/CronJob完了後のSucceeded/Failed も対象
            const hasLogs =
              pod.phase === "Running" ||
              pod.phase === "CrashLoopBackOff" ||
              pod.phase === "Succeeded" ||
              pod.phase === "Failed";
            if (!hasLogs) continue;
            const appContainers = pod.containers.filter(
              (c) => !isHiddenContainer(c.name),
            );
            const container = appContainers[0];
            if (!container) continue;

            logPromises.push(
              client
                .getPodLogs(ns, pod.name, container.name, 1000, true)
                .then((logText) => {
                  for (const line of logText.split("\n")) {
                    const parsed = parseJsonLog(line);
                    if (!parsed) continue;
                    allEntries.push({
                      namespace: ns,
                      pod: pod.name,
                      container: container.name,
                      level: parsed.level,
                      message: parsed.message,
                      caller: parsed.caller,
                      time: parsed.time,
                      raw: line,
                    });
                  }
                })
                .catch(() => {
                  /* skip */
                }),
            );
          }
        }

        await Promise.all(logPromises);

        allEntries.sort(
          (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
        );
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) {
          setEntries(allEntries);
          setLoading(false);
          setLastUpdated(new Date());
        }
      }
    };

    void fetchLogs();
    const id = setInterval(() => void fetchLogs(), 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [namespacesKey, refreshKey]);

  // フィルタ適用: namespace + レベル + 時間 + 検索ワード + 除外ワード
  const threshold = getTimeThreshold(timeRange);
  const filtered = useMemo(() => {
    const sWords = searchText
      .split(",")
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);
    const eWords = excludeText
      .split(",")
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);
    const allNsSelected = selectedNamespaces.length === namespaces.length;
    return entries.filter((e) => {
      if (!allNsSelected && !selectedNamespaces.includes(e.namespace))
        return false;
      if (levelFilter === "error" && e.level !== "error" && e.level !== "fatal")
        return false;
      if (
        levelFilter === "warn" &&
        e.level !== "error" &&
        e.level !== "fatal" &&
        e.level !== "warn" &&
        e.level !== "warning"
      )
        return false;
      if (levelFilter === "info" && e.level !== "info") return false;
      if (threshold > 0 && new Date(e.time).getTime() < threshold) return false;
      const text =
        `${e.message} ${e.namespace} ${e.pod} ${e.caller}`.toLowerCase();
      if (sWords.length > 0) {
        if (!sWords.some((w) => text.includes(w))) return false;
      }
      if (eWords.length > 0) {
        if (eWords.some((w) => text.includes(w))) return false;
      }
      return true;
    });
  }, [
    entries,
    levelFilter,
    threshold,
    selectedNamespaces,
    namespaces,
    searchText,
    excludeText,
  ]);

  const { errorCount, warnCount, infoCount } = useMemo(() => {
    let err = 0;
    let warn = 0;
    let info = 0;
    for (const e of filtered) {
      if (e.level === "error" || e.level === "fatal") err++;
      else if (e.level === "warn" || e.level === "warning") warn++;
      else if (e.level === "info") info++;
    }
    return { errorCount: err, warnCount: warn, infoCount: info };
  }, [filtered]);

  // コピー用テキスト生成
  const handleCopyAll = () => {
    const text = filtered
      .slice(0, 200)
      .map(
        (e) =>
          `[${e.level.toUpperCase()}] ${formatTime(e.time)} ${e.namespace}/${e.pod} ${e.caller ? e.caller + ": " : ""}${e.message}`,
      )
      .join("\n");
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!loading && namespaces.length === 0) {
    return (
      <EmptyState
        icon="fa-plug-circle-exclamation"
        title="Namespace が見つかりません"
        description="接続を確認してください"
        action={{ label: "再試行", onClick: triggerRefresh }}
      />
    );
  }

  return (
    <div>
      <div class="page-header">
        <div>
          <h1 class="page-title">ログストリーム</h1>
          <div class="mt-2">
            <NamespaceSelector
              selectedNamespaces={selectedNamespaces}
              namespaces={namespaces}
              onChange={onNamespacesChange}
            />
          </div>
        </div>
        <RefreshButton onRefresh={triggerRefresh} lastUpdated={lastUpdated} />
      </div>

      <PageGuide id="error-logs">
        全サービスの構造化ログを横断表示します（デフォルトはWARN以上）。
        レベルフィルタ（ALL/WARN+/ERROR）で表示範囲を切り替え、
        時間範囲や除外ワードで絞り込めます。行をクリックすると詳細を展開できます。
      </PageGuide>

      {/* サマリー + フィルタ */}
      <div class="filter-bar flex-wrap items-center gap-3">
        <div class="flex gap-3 text-sm">
          <span
            class="flex items-center gap-1.5"
            style="color: oklch(var(--er) / 0.7)"
          >
            <i class="fas fa-circle-xmark" />
            Error: {errorCount}
          </span>
          <span
            class="flex items-center gap-1.5"
            style="color: oklch(var(--wa) / 0.7)"
          >
            <i class="fas fa-triangle-exclamation" />
            Warn: {warnCount}
          </span>
          <span
            class="flex items-center gap-1.5"
            style="color: oklch(var(--in) / 0.7)"
          >
            <i class="fas fa-circle-info" />
            Info: {infoCount}
          </span>
          <span class="text-xs" style="color: var(--text-subtle)">
            ({selectedNamespaces.length} ns)
          </span>
        </div>

        {/* 時間フィルタ */}
        <div class="flex gap-1">
          {TIME_RANGES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTimeRange(value)}
              class={`btn btn-xs rounded ${
                timeRange === value ? "btn-neutral" : "btn-ghost"
              }`}
              style={
                timeRange !== value
                  ? "border: 1px solid var(--border-default)"
                  : ""
              }
            >
              {label}
            </button>
          ))}
        </div>

        {/* 検索ワード (grep) */}
        <div class="relative">
          <i
            class="fas fa-magnifying-glass absolute left-2 top-1/2 -translate-y-1/2 text-[10px]"
            style="color: var(--text-subtle)"
          />
          <input
            type="text"
            placeholder="grep (カンマ区切りでOR)"
            value={searchText}
            onInput={(e) => setSearchText((e.target as HTMLInputElement).value)}
            class="search-input text-xs w-48 pl-6"
          />
        </div>

        {/* 除外ワード */}
        <input
          type="text"
          placeholder="除外ワード (カンマ区切り)"
          value={excludeText}
          onInput={(e) => setExcludeText((e.target as HTMLInputElement).value)}
          class="search-input text-xs w-48"
        />

        {/* レベルフィルタ + コピー */}
        <div class="flex gap-1 ml-auto">
          {(
            [
              { value: "all", label: "ALL" },
              { value: "info", label: "INFO" },
              { value: "warn", label: "WARN+" },
              { value: "error", label: "ERROR" },
            ] as { value: "all" | "warn" | "error" | "info"; label: string }[]
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setLevelFilter(value)}
              class={`btn btn-xs rounded ${
                levelFilter === value
                  ? value === "error"
                    ? "btn-error"
                    : value === "warn"
                      ? "btn-warning"
                      : "btn-info"
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
          <button
            type="button"
            onClick={handleCopyAll}
            disabled={filtered.length === 0}
            class="btn btn-ghost btn-xs rounded"
            style="border: 1px solid var(--border-default)"
            title="表示中のログをコピー"
          >
            <i class={`fas ${copied ? "fa-check text-success" : "fa-copy"}`} />
          </button>
        </div>
      </div>

      {/* ログ一覧 */}
      {loading && entries.length === 0 ? (
        <div class="flex items-center justify-center py-16">
          <div class="text-center">
            <i
              class="fas fa-spinner fa-spin text-2xl mb-3"
              style="color: var(--text-muted)"
            />
            <p class="text-sm" style="color: var(--text-muted)">
              全namespaceのログを取得中...
            </p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div class="flex items-center justify-center py-16">
          <div class="text-center">
            <i class="fas fa-check-circle text-2xl mb-3 text-success" />
            <p class="text-sm" style="color: var(--text-muted)">
              該当するログはありません
            </p>
          </div>
        </div>
      ) : (
        <div class="space-y-1 mt-3">
          {filtered.slice(0, 200).map((entry, idx) => {
            const isError = entry.level === "error" || entry.level === "fatal";
            const isWarn = entry.level === "warn" || entry.level === "warning";
            // parseJsonLogがerror/fatal/warn/warning/infoのみ通すため、else=info
            const colorVar = isError ? "--er" : isWarn ? "--wa" : "--in";
            const levelLabel = isError ? "ERROR" : isWarn ? "WARN" : "INFO";
            const isExpanded = expandedIdx === idx;
            return (
              <div
                key={`${entry.time}-${entry.pod}-${idx}`}
                class="rounded-lg border px-3 py-2 cursor-pointer transition-colors"
                style={`border-color: var(--border-default); background: oklch(var(${colorVar}) / 0.03)`}
                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
              >
                <div class="flex items-start gap-2">
                  <span
                    class="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5"
                    style={`color: oklch(var(${colorVar}) / 0.8); background: oklch(var(${colorVar}) / 0.1)`}
                  >
                    {levelLabel}
                  </span>

                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span
                        class="text-xs font-medium px-1.5 py-0.5 rounded"
                        style="background: var(--bg-body); color: var(--text-heading)"
                      >
                        {entry.namespace}
                      </span>
                      <span
                        class="text-xs font-mono truncate"
                        style="color: var(--text-muted)"
                      >
                        {entry.pod.length > 40
                          ? `...${entry.pod.slice(-35)}`
                          : entry.pod}
                      </span>
                      {entry.caller && (
                        <span
                          class="text-[10px] font-mono"
                          style="color: var(--text-subtle)"
                        >
                          {entry.caller}
                        </span>
                      )}
                    </div>
                    <p
                      class={`text-xs mt-1 ${isExpanded ? "" : "line-clamp-2"}`}
                      style={`color: oklch(var(${colorVar}) / 0.7)`}
                    >
                      {entry.message}
                    </p>
                  </div>

                  <div class="flex items-center gap-1.5 shrink-0 mt-0.5">
                    <span
                      class="text-[10px] font-mono"
                      style="color: var(--text-subtle)"
                    >
                      {formatTime(entry.time)}
                    </span>
                    <button
                      type="button"
                      title="このログをコピー"
                      class="btn btn-ghost btn-xs px-1"
                      style="min-height: 0; height: auto;"
                      onClick={(e) => {
                        e.stopPropagation();
                        void navigator.clipboard
                          .writeText(entry.raw)
                          .then(() => {
                            setCopiedIdx(idx);
                            setTimeout(() => setCopiedIdx(null), 2000);
                          });
                      }}
                    >
                      <i
                        class={`fas text-[10px] ${copiedIdx === idx ? "fa-check text-success" : "fa-copy"}`}
                        style="color: var(--text-subtle)"
                      />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <pre
                    class="mt-2 p-2 rounded text-[10px] overflow-x-auto"
                    style="background: var(--bg-body); color: var(--text-muted); white-space: pre-wrap; word-break: break-all;"
                  >
                    {entry.raw}
                  </pre>
                )}
              </div>
            );
          })}
          {filtered.length > 200 && (
            <p
              class="text-xs text-center py-2"
              style="color: var(--text-subtle)"
            >
              他 {filtered.length - 200} 件は省略
            </p>
          )}
        </div>
      )}
    </div>
  );
}
