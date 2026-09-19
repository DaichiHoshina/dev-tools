import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Terminal, X, Search } from "lucide-react";
import { api } from "../lib/api";
import { formatDate, truncate } from "../lib/utils";
import type { SessionEntry, ProjectInfo, SearchResult } from "../lib/types";

function SnippetText({ text, keyword }: { text: string; keyword: string }) {
  if (!keyword) return <>{text}</>;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === keyword.toLowerCase() ? (
          <mark
            key={i}
            className="bg-yellow-500/20 text-yellow-300 rounded px-0.5"
          >
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

type RangePreset = "1w" | "1m" | "3m" | "all";

const RANGE_LABELS: Record<RangePreset, string> = {
  "1w": "1週間",
  "1m": "1ヶ月",
  "3m": "3ヶ月",
  all: "全期間",
};

function rangeToFrom(range: RangePreset): string | undefined {
  if (range === "all") return undefined;
  const d = new Date();
  if (range === "1w") d.setDate(d.getDate() - 7);
  else if (range === "1m") d.setMonth(d.getMonth() - 1);
  else if (range === "3m") d.setMonth(d.getMonth() - 3);
  return d.toISOString();
}

export function SessionListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingSessionId, setOpeningSessionId] = useState<string | null>(null);

  // 検索
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(
    null,
  );
  const [searchLoading, setSearchLoading] = useState(false);

  const selectedProject = searchParams.get("project") ?? "";
  const page = Number(searchParams.get("page") ?? 1);
  const rawRange = searchParams.get("range");
  const range: RangePreset =
    rawRange && rawRange in RANGE_LABELS ? (rawRange as RangePreset) : "1w";
  const LIMIT = 50;
  const offset = (page - 1) * LIMIT;

  const buildParams = (overrides: Record<string, string | undefined>) => {
    const next: Record<string, string> = {};
    if (selectedProject) next.project = selectedProject;
    next.range = range;
    next.page = String(page);
    for (const [k, v] of Object.entries(overrides)) {
      if (v) next[k] = v;
      else delete next[k];
    }
    return next;
  };

  const loadProjects = useCallback(async () => {
    try {
      const data = await api.projects();
      setProjects(data);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.sessions({
        project: selectedProject || undefined,
        limit: LIMIT,
        offset,
        from: rangeToFrom(range),
      });
      setSessions(data.sessions);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みエラー");
    } finally {
      setLoading(false);
    }
  }, [selectedProject, offset, range]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // 検索デバウンス（cancelledフラグで古いリクエスト結果の上書きを防止）
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await api.search(q, selectedProject || undefined);
        if (!cancelled) setSearchResults(data.results);
      } catch (e) {
        console.warn(e);
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, selectedProject]);

  const totalPages = Math.ceil(total / LIMIT);
  // 1文字では検索APIを呼ばず通常一覧を表示（誤入力防止）
  const isSearchMode = searchQuery.trim().length >= 2;

  const setProject = (project: string) => {
    setSearchParams(buildParams({ project: project || undefined, page: "1" }));
  };

  const setRange = (r: RangePreset) => {
    setSearchParams(buildParams({ range: r, page: "1" }));
  };

  const setPage = (p: number) => {
    setSearchParams(buildParams({ page: String(p) }));
  };

  return (
    <div className="space-y-4">
      {/* フィルターバー */}
      <div className="bg-base-100 rounded-xl border border-base-300 px-4 py-3 flex flex-wrap items-center gap-3">
        {/* 検索入力 */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-base-content/40 pointer-events-none" />
          <input
            type="text"
            className="input input-sm input-bordered bg-base-100 pl-8 pr-8 text-sm w-64"
            placeholder="キーワード検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content"
              onClick={() => setSearchQuery("")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <select
          className="select select-sm select-bordered bg-base-100 text-sm min-w-[200px]"
          value={selectedProject}
          onChange={(e) => setProject(e.target.value)}
        >
          <option value="">すべてのプロジェクト</option>
          {projects.map((p) => (
            <option key={p.dirName} value={p.dirName}>
              {p.displayName} ({p.sessionCount})
            </option>
          ))}
        </select>
        {selectedProject && (
          <button
            className="btn btn-xs btn-ghost gap-1"
            onClick={() => setProject("")}
          >
            <X className="w-3 h-3" />
            クリア
          </button>
        )}

        {/* 期間プリセット */}
        <div className="flex items-center gap-0.5 bg-base-200 rounded-lg p-0.5">
          {(Object.keys(RANGE_LABELS) as RangePreset[]).map((r) => (
            <button
              key={r}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                range === r
                  ? "bg-base-100 text-base-content shadow-sm"
                  : "text-base-content/50 hover:text-base-content/70"
              }`}
              onClick={() => setRange(r)}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>

        <span className="ml-auto text-xs text-base-content/40">
          {isSearchMode
            ? searchResults != null
              ? `${searchResults.length.toLocaleString()} 件ヒット`
              : ""
            : `${total.toLocaleString()} セッション`}
        </span>
      </div>

      {/* 検索モード */}
      {isSearchMode ? (
        searchLoading ? (
          <div className="flex justify-center py-16">
            <span className="loading loading-spinner loading-lg text-primary" />
          </div>
        ) : !searchResults || searchResults.length === 0 ? (
          <div className="bg-base-100 rounded-xl border border-base-300 p-12 text-center text-sm text-base-content/40">
            「{searchQuery}」に一致するセッションが見つかりません
          </div>
        ) : (
          <div className="bg-base-100 rounded-xl border border-base-300 overflow-x-auto">
            <table className="table table-sm w-full">
              <thead>
                <tr className="bg-base-200 text-xs text-base-content/50 uppercase tracking-wide">
                  <th className="font-medium">サマリ / 一致箇所</th>
                  <th className="font-medium w-44">プロジェクト</th>
                  <th className="font-medium w-36 text-right">更新日時</th>
                  <th className="w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-200">
                {searchResults.map((r) => (
                  <tr
                    key={r.sessionId}
                    className="hover:bg-base-50 cursor-pointer transition-colors group"
                    onClick={() =>
                      navigate(
                        `/sessions/${r.sessionId}?project=${encodeURIComponent(r.projectDirName)}`,
                      )
                    }
                  >
                    <td className="py-3">
                      <div className="text-sm font-medium leading-snug group-hover:text-primary transition-colors">
                        {r.summary || (
                          <span className="text-base-content/30 italic">
                            サマリなし
                          </span>
                        )}
                      </div>
                      {r.snippets.slice(0, 2).map((s, i) => (
                        <div
                          key={i}
                          className="text-xs text-base-content/50 mt-1 bg-yellow-500/10 border border-yellow-500/20 rounded px-2 py-1"
                        >
                          <SnippetText
                            text={truncate(s.snippet, 120)}
                            keyword={searchQuery.trim()}
                          />
                        </div>
                      ))}
                    </td>
                    <td>
                      <span className="text-xs font-mono text-base-content/60 bg-base-200 px-1.5 py-0.5 rounded">
                        {r.projectDisplayName.split("/").slice(-2).join("/")}
                      </span>
                    </td>
                    <td className="text-right text-xs text-base-content/40 tabular-nums">
                      {formatDate(r.modified)}
                    </td>
                    <td>
                      <button
                        className={`btn btn-xs gap-1 ${
                          openingSessionId === r.sessionId
                            ? "btn-success"
                            : "btn-ghost opacity-0 group-hover:opacity-100"
                        } transition-opacity`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpeningSessionId(r.sessionId);
                          api
                            .openTerminal(r.sessionId, r.projectPath)
                            .finally(() => {
                              setTimeout(() => setOpeningSessionId(null), 2000);
                            });
                        }}
                        disabled={openingSessionId === r.sessionId}
                      >
                        {openingSessionId === r.sessionId ? (
                          "開いた"
                        ) : (
                          <>
                            <Terminal className="w-3 h-3" />
                            再開
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* 通常モード */
        <>
          {loading ? (
            <div className="flex justify-center py-16">
              <span className="loading loading-spinner loading-lg text-primary" />
            </div>
          ) : error ? (
            <div className="alert alert-error">
              <span>{error}</span>
              <button className="btn btn-sm" onClick={loadSessions}>
                再試行
              </button>
            </div>
          ) : sessions.length === 0 ? (
            <div className="bg-base-100 rounded-xl border border-base-300 p-12 text-center text-sm text-base-content/40">
              セッションが見つかりません
            </div>
          ) : (
            <div className="bg-base-100 rounded-xl border border-base-300 overflow-x-auto">
              <table className="table table-sm w-full">
                <thead>
                  <tr className="bg-base-200 text-xs text-base-content/50 uppercase tracking-wide">
                    <th className="font-medium">サマリ / プロンプト</th>
                    <th className="font-medium w-44">プロジェクト</th>
                    <th className="font-medium w-32">ブランチ</th>
                    <th className="font-medium w-10 text-right">msgs</th>
                    <th className="font-medium w-36 text-right">更新日時</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-base-200">
                  {sessions.map((s) => (
                    <tr
                      key={s.sessionId}
                      className="hover:bg-base-50 cursor-pointer transition-colors group"
                      onClick={() =>
                        navigate(
                          `/sessions/${s.sessionId}?project=${encodeURIComponent(s.projectDirName)}`,
                        )
                      }
                    >
                      <td className="py-3">
                        <div className="text-sm font-medium leading-snug group-hover:text-primary transition-colors">
                          {s.summary || (
                            <span className="text-base-content/30 italic">
                              サマリなし
                            </span>
                          )}
                        </div>
                        {s.firstPrompt && (
                          <div className="text-xs text-base-content/40 mt-0.5">
                            {truncate(s.firstPrompt, 80)}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="text-xs font-mono text-base-content/60 bg-base-200 px-1.5 py-0.5 rounded">
                          {s.projectDisplayName.split("/").slice(-2).join("/")}
                        </span>
                      </td>
                      <td>
                        {s.gitBranch && (
                          <span className="text-xs font-mono text-base-content/50">
                            {s.gitBranch}
                          </span>
                        )}
                      </td>
                      <td className="text-right text-xs text-base-content/40 tabular-nums">
                        {s.messageCount}
                      </td>
                      <td className="text-right text-xs text-base-content/40 tabular-nums">
                        {formatDate(s.modified)}
                      </td>
                      <td>
                        <button
                          className={`btn btn-xs gap-1 ${
                            openingSessionId === s.sessionId
                              ? "btn-success"
                              : "btn-ghost opacity-0 group-hover:opacity-100"
                          } transition-opacity`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpeningSessionId(s.sessionId);
                            api
                              .openTerminal(s.sessionId, s.projectPath)
                              .finally(() => {
                                setTimeout(
                                  () => setOpeningSessionId(null),
                                  2000,
                                );
                              });
                          }}
                          disabled={openingSessionId === s.sessionId}
                        >
                          {openingSessionId === s.sessionId ? (
                            "開いた"
                          ) : (
                            <>
                              <Terminal className="w-3 h-3" />
                              再開
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ページネーション */}
          {totalPages > 1 && (
            <div className="flex justify-center">
              <div className="flex items-center gap-1">
                <button
                  className="btn btn-sm btn-ghost"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {(() => {
                  const pages: (number | "...")[] = [];
                  if (totalPages <= 7) {
                    for (let i = 1; i <= totalPages; i++) pages.push(i);
                  } else {
                    pages.push(1);
                    const start = Math.max(2, page - 1);
                    const end = Math.min(totalPages - 1, page + 1);
                    if (start > 2) pages.push("...");
                    for (let i = start; i <= end; i++) pages.push(i);
                    if (end < totalPages - 1) pages.push("...");
                    pages.push(totalPages);
                  }
                  return pages.map((p, i) =>
                    p === "..." ? (
                      <span
                        key={`dots-${i}`}
                        className="px-2 text-base-content/30 text-sm"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={p}
                        className={`btn btn-sm ${p === page ? "btn-primary" : "btn-ghost"}`}
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </button>
                    ),
                  );
                })()}
                <button
                  className="btn btn-sm btn-ghost"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
