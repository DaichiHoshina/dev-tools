import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  MessageSquare,
  FolderOpen,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { api } from "../lib/api";
import type { StatsResponse } from "../lib/types";

export function AnalyticsPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .stats()
      .then(setStats)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="alert alert-error">
        <span>{error ?? "読み込みエラー"}</span>
        <button className="btn btn-sm btn-ghost" onClick={loadStats}>
          再試行
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* サマリカード */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="総セッション数"
          value={stats.totalSessions}
          Icon={ClipboardList}
        />
        <StatCard
          label="総メッセージ数"
          value={stats.totalMessages}
          Icon={MessageSquare}
        />
        <StatCard
          label="プロジェクト数"
          value={stats.projectCount}
          Icon={FolderOpen}
        />
      </div>

      {/* 月別セッション数トレンド */}
      {stats.monthlyTrend.length > 0 && (
        <div className="bg-base-100 rounded-box p-4">
          <h2 className="font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" /> 月別セッション数
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#28282e" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: "#71717a" }}
                  axisLine={{ stroke: "#28282e" }}
                  tickLine={{ stroke: "#28282e" }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#71717a" }}
                  axisLine={{ stroke: "#28282e" }}
                  tickLine={{ stroke: "#28282e" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1c1c20",
                    border: "1px solid #28282e",
                    borderRadius: "8px",
                    color: "#dadadf",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "#a1a1aa" }}
                  cursor={{ fill: "rgba(139, 92, 246, 0.1)" }}
                />
                <Bar
                  dataKey="count"
                  fill="#8b5cf6"
                  radius={[4, 4, 0, 0]}
                  name="セッション数"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* プロジェクト別ランキング */}
      <div className="bg-base-100 rounded-box p-4">
        <h2 className="font-bold mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5" /> プロジェクト別セッション数（上位10件）
        </h2>
        <div className="space-y-2">
          {stats.topProjects.map((p, i) => {
            const max = stats.topProjects[0]?.count ?? 1;
            const pct = Math.round((p.count / max) * 100);
            return (
              <div key={p.dirName} className="flex items-center gap-3">
                <span className="text-base-content/40 text-sm w-6 text-right">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-mono truncate">
                      {p.displayName}
                    </span>
                    <span className="text-sm font-bold ml-2">{p.count}</span>
                  </div>
                  <div className="h-2 bg-base-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  Icon,
}: {
  label: string;
  value: number;
  Icon: LucideIcon;
}) {
  return (
    <div className="bg-base-100 rounded-box p-4 flex items-center gap-4">
      <Icon className="w-8 h-8 text-primary" />
      <div>
        <div className="text-2xl font-bold">{value.toLocaleString()}</div>
        <div className="text-sm text-base-content/60">{label}</div>
      </div>
    </div>
  );
}
