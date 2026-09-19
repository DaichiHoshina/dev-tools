import { useState, useEffect, useCallback, useRef } from "react";
import { VscRefresh, VscScreenFull, VscScreenNormal } from "react-icons/vsc";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type {
  DashboardCard as DashboardCardType,
  QueryResult,
  SavedQuery,
} from "../types";

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

type Props = {
  card: DashboardCardType;
  queries: SavedQuery[];
  refreshTrigger?: number;
  yAxisMax?: number;
  onDataMax?: (cardId: string, max: number) => void;
};

export default function DashboardCard({
  card,
  queries,
  refreshTrigger = 0,
  yAxisMax,
  onDataMax,
}: Props) {
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    if (isFullscreen) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  const query = card.queryId
    ? queries.find((q) => q.id === card.queryId)
    : null;

  const resolvedSql = card.sql ?? query?.sql;
  const resolvedDsId = card.dataSourceId ?? query?.dataSourceId;
  const hasParams = resolvedSql ? /\{\{.+?\}\}/.test(resolvedSql) : false;

  const reportDataMax = useCallback(
    (data: QueryResult) => {
      if (!onDataMax) return;
      let max = 0;
      for (const row of data.rows) {
        for (const col of data.columns.slice(1)) {
          const v = Number(row[col.name]);
          if (!isNaN(v) && v > max) max = v;
        }
      }
      onDataMax(card.id, max);
    },
    [onDataMax, card.id],
  );

  const executeQuery = useCallback(async () => {
    if (!resolvedSql || !resolvedDsId || hasParams) return;
    setLoading(true);
    setError(null);

    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }

    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataSourceId: resolvedDsId,
          query: resolvedSql,
        }),
      });
      let data: {
        status?: string;
        data?: QueryResult;
        jobId?: string;
        error?: string;
      };
      try {
        data = await res.json();
      } catch {
        if (mountedRef.current) {
          setError(`HTTP ${res.status}`);
          setLoading(false);
        }
        return;
      }

      if (!mountedRef.current) return;

      if (!res.ok || data.error) {
        setError(data.error ?? `HTTP ${res.status}`);
        setLoading(false);
        return;
      }

      if (data.status === "done" && data.data) {
        setResult(data.data);
        setLastUpdated(new Date());
        setLoading(false);
        if (onDataMax) reportDataMax(data.data);
      } else if (data.status === "pending" && data.jobId) {
        const poll = async (jobId: string) => {
          if (!mountedRef.current) return;
          try {
            const jobRes = await fetch(`/api/jobs/${jobId}`);
            if (!jobRes.ok || !mountedRef.current) return;
            const job = await jobRes.json();

            if (!mountedRef.current) return;

            if (job.status === 3 && job.query_result_id) {
              const resultRes = await fetch(
                `/api/results/${job.query_result_id}`,
              );
              if (!resultRes.ok || !mountedRef.current) return;
              const resultData = await resultRes.json();
              if (mountedRef.current) {
                setResult(resultData);
                setLastUpdated(new Date());
                setLoading(false);
                if (onDataMax && resultData) reportDataMax(resultData);
              }
            } else if (job.status === 4) {
              if (mountedRef.current) {
                setError(job.error || "Query failed");
                setLoading(false);
              }
            } else {
              pollingRef.current = setTimeout(() => poll(jobId), 1000);
            }
          } catch (e) {
            if (mountedRef.current) {
              setError(String(e));
              setLoading(false);
            }
          }
        };
        poll(data.jobId);
      } else {
        setLoading(false);
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(String(e));
        setLoading(false);
      }
    }
  }, [resolvedSql, resolvedDsId]);

  useEffect(() => {
    executeQuery();
  }, [executeQuery]);

  useEffect(() => {
    if (refreshTrigger > 0) executeQuery();
  }, [refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatLastUpdated = (date: Date) => {
    const diff = Date.now() - date.getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderSkeleton = () => (
    <div className="flex flex-col gap-3 p-4 h-full">
      <div className="h-2.5 bg-ctp-surface1 rounded-full animate-pulse w-2/3" />
      <div className="h-2.5 bg-ctp-surface1 rounded-full animate-pulse w-1/2 opacity-80" />
      <div className="flex-1 bg-ctp-surface1 rounded-lg animate-pulse opacity-60" />
      <div className="h-2 bg-ctp-surface0 rounded-full animate-pulse w-1/4" />
    </div>
  );

  const renderVisualization = () => {
    if (!result || result.rows.length === 0) {
      return (
        <div className="flex items-center justify-center h-full">
          <p className="text-ctp-surface2 text-xs">No data</p>
        </div>
      );
    }

    // ── stat: KPI ビッグナンバー ──────────────────────────────
    if (card.visualization === "stat") {
      const numericCol = result.columns.find((col) => {
        const sample = result.rows[0]?.[col.name];
        return typeof sample === "number" || !isNaN(Number(sample));
      });
      const valueCol = numericCol ?? result.columns[0];
      const raw = result.rows[0]?.[valueCol.name];

      if (raw === null || raw === undefined) {
        return (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-6">
            <div className="text-2xl text-ctp-surface2">-</div>
            <div className="text-xs text-ctp-overlay0 font-medium uppercase tracking-widest">
              {valueCol.name}
            </div>
          </div>
        );
      }

      const numValue = typeof raw === "number" ? raw : parseFloat(String(raw));
      const isAmount =
        card.title.includes("金額") || card.title.includes("売上");
      const formatted = isNaN(numValue)
        ? String(raw)
        : `${isAmount ? "¥" : ""}${numValue.toLocaleString("ja-JP")}`;

      return (
        <div className="flex flex-col items-center justify-center h-full gap-2 px-6">
          <div className="text-[2.8rem] font-bold text-ctp-text tabular-nums tracking-tight leading-none">
            {formatted}
          </div>
          <div className="text-xs text-ctp-overlay0 font-medium uppercase tracking-widest">
            {valueCol.name}
          </div>
        </div>
      );
    }

    if (card.visualization === "table") {
      return (
        <div className="overflow-auto text-xs h-full">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {result.columns.map((col) => (
                  <th
                    key={col.name}
                    className="bg-ctp-crust text-ctp-overlay0 px-3 py-1.5 text-left border-b border-ctp-surface0 sticky top-0 whitespace-nowrap font-medium text-[10px] uppercase tracking-wider"
                  >
                    {col.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.slice(0, 100).map((row, i) => (
                <tr
                  key={i}
                  className={`hover:bg-ctp-blue/[0.06] transition-colors ${
                    i % 2 === 1 ? "bg-ctp-surface0/25" : ""
                  }`}
                >
                  {result.columns.map((col) => (
                    <td
                      key={col.name}
                      className="px-3 py-1 border-b border-ctp-surface0/40 truncate max-w-40 text-ctp-subtext"
                    >
                      {row[col.name] === null ? (
                        <span className="text-ctp-surface2 italic">NULL</span>
                      ) : (
                        String(row[col.name])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // Chart data
    const chartData = result.rows.slice(0, 50).map((row) => {
      const entry: Record<string, unknown> = {};
      for (const col of result.columns) {
        const val = row[col.name];
        entry[col.name] =
          typeof val === "number"
            ? val
            : typeof val === "string" && !isNaN(Number(val))
              ? Number(val)
              : val;
      }
      return entry;
    });

    const xKey = result.columns[0]?.name;
    const yKeys = result.columns
      .slice(1)
      .filter((col) => {
        const sample = result.rows[0]?.[col.name];
        return typeof sample === "number" || !isNaN(Number(sample));
      })
      .map((col) => col.name);

    const envColorA = getCssVar("--env-color-a") || "#4f46e5";
    const colors = [
      envColorA,
      "#16a34a",
      "#d97706",
      "#dc2626",
      "#7c3aed",
      "#0d9488",
      "#ea580c",
    ];

    const grid = getCssVar("--chart-grid");
    const axis = getCssVar("--chart-axis");
    const tick = getCssVar("--chart-tick");
    const tipBg = getCssVar("--chart-tooltip-bg");
    const tipBorder = getCssVar("--chart-tooltip-border");
    const tipColor = getCssVar("--chart-tooltip-color");

    const sharedMargin = { top: 4, right: 8, left: -12, bottom: 0 };

    const commonElements = (
      <>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={grid}
          vertical={false}
          strokeOpacity={0.7}
        />
        <XAxis
          dataKey={xKey}
          tick={{ fill: tick, fontSize: 10 }}
          stroke={axis}
          tickLine={false}
          axisLine={{ stroke: axis }}
        />
        <YAxis
          tick={{ fill: tick, fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={38}
          allowDecimals={false}
          domain={yAxisMax != null ? [0, yAxisMax] : undefined}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: tipBg,
            border: `1px solid ${tipBorder}`,
            borderRadius: 8,
            color: tipColor,
            fontSize: 11,
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            padding: "6px 10px",
          }}
          cursor={{ fill: "rgba(99,102,241,0.04)" }}
        />
        {yKeys.length > 1 && (
          <Legend
            wrapperStyle={{ fontSize: 10, paddingTop: 2 }}
            iconSize={7}
            iconType="circle"
          />
        )}
      </>
    );

    if (card.visualization === "line") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={sharedMargin}>
            <defs>
              {yKeys.map((key, i) => (
                <linearGradient
                  key={key}
                  id={`grad-${card.id}-${i}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={colors[i % colors.length]}
                    stopOpacity={0.18}
                  />
                  <stop
                    offset="95%"
                    stopColor={colors[i % colors.length]}
                    stopOpacity={0}
                  />
                </linearGradient>
              ))}
            </defs>
            {commonElements}
            {yKeys.map((key, i) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colors[i % colors.length]}
                strokeWidth={2}
                fill={`url(#grad-${card.id}-${i})`}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    if (card.visualization === "bar") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={sharedMargin}>
            {commonElements}
            {yKeys.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                fill={colors[i % colors.length]}
                radius={[3, 3, 0, 0]}
                maxBarSize={48}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    }

    return null;
  };

  const isStat = card.visualization === "stat";

  return (
    <div className="group bg-ctp-base border border-ctp-surface0 rounded-xl flex flex-col h-full overflow-hidden shadow-sm transition-all hover:border-ctp-surface1 hover:shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-ctp-surface0/60 shrink-0">
        <h3 className="text-xs font-medium text-ctp-text truncate">
          {card.title}
        </h3>
        <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setIsFullscreen(true)}
            className="p-1 rounded-md transition-all text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0"
            title="フルスクリーン表示 (Esc で閉じる)"
          >
            <VscScreenFull size={12} />
          </button>
          <button
            onClick={executeQuery}
            disabled={loading}
            className={`p-1 rounded-md transition-all ${
              loading
                ? "text-ctp-blue"
                : "text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0"
            }`}
            title="Refresh"
          >
            <VscRefresh
              size={12}
              className={loading ? "animate-spin-slow" : ""}
            />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {hasParams ? (
          <div className="flex items-center justify-center h-full px-4">
            <p className="text-ctp-overlay0 text-xs text-center">
              パラメータ付きクエリ（自動実行不可）
            </p>
          </div>
        ) : loading && !result ? (
          renderSkeleton()
        ) : error ? (
          <div className="flex items-start gap-3 p-4 h-full">
            <div className="w-0.5 rounded-full bg-ctp-red/50 shrink-0 self-stretch min-h-[48px]" />
            <div className="min-w-0">
              <p className="text-ctp-red text-xs font-semibold mb-1">
                Query error
              </p>
              <p className="text-ctp-red/70 text-[11px] font-mono leading-relaxed line-clamp-5 break-all">
                {error}
              </p>
            </div>
          </div>
        ) : !result ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-ctp-surface2 text-xs">No data</p>
          </div>
        ) : (
          <div className={`h-full ${isStat ? "" : "p-2"}`}>
            {renderVisualization()}
          </div>
        )}
      </div>

      {/* Footer (hover only) */}
      {result && !isStat && (
        <div className="flex items-center justify-between px-4 py-1 border-t border-ctp-surface0/60 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity">
          <span className="text-[10px] text-ctp-surface2 tabular-nums">
            {card.visualization === "table" && result.rows.length > 100
              ? `100 / ${result.rows.length.toLocaleString()} rows`
              : `${result.rows.length.toLocaleString()} rows`}
          </span>
          {lastUpdated && (
            <span className="text-[10px] text-ctp-surface2">
              {formatLastUpdated(lastUpdated)}
            </span>
          )}
        </div>
      )}
      {result && isStat && lastUpdated && (
        <div className="flex items-center justify-center px-4 py-1 border-t border-ctp-surface0/40 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity">
          <span className="text-[10px] text-ctp-surface2">
            {formatLastUpdated(lastUpdated)}
          </span>
        </div>
      )}

      {/* Fullscreen Modal */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center animate-fade-in"
          onClick={() => setIsFullscreen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={card.title}
        >
          <div
            className="bg-ctp-base border border-ctp-surface0/50 rounded-xl flex flex-col overflow-hidden"
            style={{
              width: "85vw",
              height: "85vh",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-ctp-surface0/40 shrink-0">
              <h3 className="text-xs font-medium text-ctp-text">
                {card.title}
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-ctp-surface2">
                  Esc で閉じる
                </span>
                <button
                  onClick={() => setIsFullscreen(false)}
                  className="p-1.5 rounded-lg text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0 transition-all"
                  title="閉じる"
                >
                  <VscScreenNormal size={13} />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 p-4 overflow-hidden">
              {renderVisualization()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
