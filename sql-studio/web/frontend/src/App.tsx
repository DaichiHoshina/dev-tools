import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  VscPlay,
  VscSave,
  VscCode,
  VscDashboard,
  VscDatabase,
  VscChevronRight,
  VscLoading,
  VscSplitHorizontal,
  VscSymbolKeyword,
  VscLink,
} from "react-icons/vsc";
import SqlEditor from "./components/SqlEditor";
import ResultTable from "./components/ResultTable";
import DataSourceSelect from "./components/DataSourceSelect";
import QueryTabs from "./components/QueryTabs";
import QueryList from "./components/QueryList";
import ParameterForm from "./components/ParameterForm";
import Dashboard from "./components/Dashboard";
import TableViewer from "./components/TableViewer";

import {
  useDataSources,
  useConfig,
  useEnvironment,
  useQueryExecution,
  useSchemaTree,
} from "./hooks/useRedashApi";
import { useQueryHistory } from "./hooks/useQueryHistory";
import { useLocalQueries } from "./hooks/useLocalStore";
import type { TabState } from "./types";

const ENV_STYLES = {
  dev: {
    from: "#16a34a",
    to: "#0d9488",
    label: "text-ctp-green",
    dot: "bg-ctp-green",
  },
  tes: {
    from: "#d97706",
    to: "#ea580c",
    label: "text-ctp-yellow",
    dot: "bg-ctp-yellow",
  },
  prd: {
    from: "#4f46e5",
    to: "#7c3aed",
    label: "text-ctp-blue",
    dot: "bg-ctp-blue",
  },
} as const;

function createTab(name?: string): TabState {
  return {
    id: crypto.randomUUID(),
    name: name ?? "Untitled",
    sql: "",
    dataSourceId: null,
    result: null,
    executionTimeMs: null,
    isExecuting: false,
    error: null,
    savedQueryId: null,
    isDirty: false,
  };
}

function parseErrorMessage(error: string): { summary: string } {
  const lower = error.toLowerCase();
  if (
    lower.includes("syntax error") ||
    lower.includes("you have an error in your sql syntax")
  ) {
    return { summary: "SQLの構文エラーです。クエリを確認してください。" };
  }
  if (lower.includes("unknown column")) {
    const match = error.match(/unknown column ['`]?([^'`\s]+)['`]?/i);
    return {
      summary: match
        ? `カラム "${match[1]}" が存在しません。`
        : "存在しないカラムが指定されています。",
    };
  }
  if (lower.includes("table") && lower.includes("doesn't exist")) {
    const match = error.match(/table ['`]?([^'`\s]+)['`]? doesn't exist/i);
    return {
      summary: match
        ? `テーブル "${match[1]}" が存在しません。`
        : "存在しないテーブルが指定されています。",
    };
  }
  if (lower.includes("access denied")) {
    return { summary: "アクセス権限がありません。" };
  }
  if (lower.includes("connection refused") || lower.includes("can't connect")) {
    return { summary: "データベースへの接続に失敗しました。" };
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return { summary: "クエリがタイムアウトしました。処理時間が長すぎます。" };
  }
  if (lower.includes("duplicate entry")) {
    return { summary: "重複するデータが存在します。" };
  }
  if (lower.includes("division by zero") || lower.includes("divide by zero")) {
    return { summary: "ゼロ除算エラーです。" };
  }
  return { summary: "クエリの実行に失敗しました。" };
}

function getInitialSqlFromUrl(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("sql") ?? "";
  } catch {
    return "";
  }
}

export default function App() {
  const [envRefreshKey, setEnvRefreshKey] = useState(0);
  const { environments, currentEnv, switchEnvironment } = useEnvironment();
  const {
    configured,
    redashUrl,
    loading: configLoading,
  } = useConfig(envRefreshKey);
  const { dataSources } = useDataSources(envRefreshKey);
  const {
    execute,
    isExecuting,
    result,
    executionTimeMs,
    error: execError,
  } = useQueryExecution();
  const { history, refresh: refreshHistory } = useQueryHistory();
  const {
    queries: savedQueries,
    saveQuery,
    deleteQuery,
    importFromRedash,
  } = useLocalQueries();

  const [mode, setMode] = useState<"editor" | "dashboard" | "browser">(
    "dashboard",
  );
  const [urlSharedSuccess, setUrlSharedSuccess] = useState(false);
  const initialSql = getInitialSqlFromUrl();
  const [tabs, setTabs] = useState<TabState[]>(() => {
    const tab = createTab();
    if (initialSql) tab.sql = initialSql;
    return [tab];
  });
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editorHeight, setEditorHeight] = useState(280);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveTags, setSaveTags] = useState("");
  const [browserTable, setBrowserTable] = useState<string | null>(null);
  const resizingRef = useRef(false);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const activeDs = dataSources.find((ds) => ds.id === activeTab?.dataSourceId);

  const { schema, schemaMap } = useSchemaTree(activeTab.dataSourceId);

  const foundTable = useMemo(() => {
    if (!browserTable) return undefined;
    for (const tables of schemaMap.values()) {
      const found = tables.find((t) => t.fullName === browserTable);
      if (found) return found;
    }
    return undefined;
  }, [browserTable, schemaMap]);

  const currentEnvStyle =
    ENV_STYLES[currentEnv as keyof typeof ENV_STYLES] ?? ENV_STYLES.prd;

  // 環境に応じてCSSアクセント色を動的に切り替え
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--env-color-a",
      currentEnvStyle.from,
    );
    document.documentElement.style.setProperty(
      "--env-color-b",
      currentEnvStyle.to,
    );
  }, [currentEnvStyle]);

  const updateTab = useCallback((id: string, updates: Partial<TabState>) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    );
  }, []);

  const handleEnvSwitch = useCallback(
    async (name: string) => {
      await switchEnvironment(name);
      setTabs((prev) => prev.map((t) => ({ ...t, dataSourceId: null })));
      setEnvRefreshKey((k) => k + 1);
    },
    [switchEnvironment],
  );

  // データソースが1つしかない場合は自動選択
  useEffect(() => {
    if (dataSources.length === 1 && activeTab.dataSourceId === null) {
      updateTab(activeTab.id, { dataSourceId: dataSources[0].id });
    }
  }, [dataSources, activeTab.id, activeTab.dataSourceId, updateTab]);

  const handleExecute = useCallback(
    (selectedText?: string) => {
      if (!activeTab.dataSourceId) return;
      const sql = selectedText ?? activeTab.sql;
      if (!sql.trim()) return;
      updateTab(activeTab.id, { isExecuting: true, error: null });
      execute(activeTab.dataSourceId, sql);
    },
    [activeTab, execute, updateTab],
  );

  const handleExplain = useCallback(() => {
    if (!activeTab.dataSourceId || !activeTab.sql.trim()) return;
    const explainSql = `EXPLAIN ${activeTab.sql.trim()}`;
    updateTab(activeTab.id, { isExecuting: true, error: null });
    execute(activeTab.dataSourceId, explainSql);
  }, [activeTab, execute, updateTab]);

  const handleLoadQuery = useCallback(
    (sql: string, dataSourceId?: number) => {
      const tab = {
        ...createTab(),
        sql,
        dataSourceId: dataSourceId ?? activeTab.dataSourceId,
      };
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
      setMode("editor");
    },
    [activeTab.dataSourceId],
  );

  const handleShareUrl = useCallback(() => {
    if (!activeTab.sql.trim()) return;
    const encoded = encodeURIComponent(activeTab.sql);
    const url = `${window.location.origin}${window.location.pathname}?sql=${encoded}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setUrlSharedSuccess(true);
        setTimeout(() => setUrlSharedSuccess(false), 2000);
      })
      .catch(() => {
        window.prompt("URLをコピーしてください:", url);
      });
  }, [activeTab.sql]);

  const handleParameterExecute = useCallback(
    (resolvedSql: string) => {
      if (!activeTab.dataSourceId) return;
      updateTab(activeTab.id, { isExecuting: true, error: null });
      execute(activeTab.dataSourceId, resolvedSql);
    },
    [activeTab, execute, updateTab],
  );

  // Sync execution state to active tab
  useEffect(() => {
    if (activeTab?.isExecuting && !isExecuting) {
      updateTab(activeTab.id, {
        isExecuting: false,
        result: result ?? activeTab.result,
        executionTimeMs: executionTimeMs ?? activeTab.executionTimeMs,
        error: execError,
      });
      refreshHistory();
    }
  }, [
    isExecuting,
    activeTab?.isExecuting,
    activeTab?.id,
    result,
    executionTimeMs,
    execError,
    updateTab,
    refreshHistory,
  ]);

  const handleSave = useCallback(async () => {
    if (!saveName.trim()) return;
    const tags = saveTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const saved = await saveQuery({
      name: saveName,
      sql: activeTab.sql,
      dataSourceId: activeTab.dataSourceId ?? 0,
      parameters: [],
      tags,
    });
    updateTab(activeTab.id, {
      savedQueryId: saved.id,
      name: saved.name,
      isDirty: false,
    });
    setSaveDialogOpen(false);
    setSaveName("");
    setSaveTags("");
  }, [saveName, saveTags, activeTab, saveQuery, updateTab]);

  const handleSelectTable = useCallback((fullName: string) => {
    setMode("browser");
    setBrowserTable(fullName);
  }, []);

  const handleOpenInEditor = useCallback(
    (sql: string) => {
      setMode("editor");
      const tab = createTab("Browser Query");
      tab.sql = sql;
      tab.dataSourceId = activeTab.dataSourceId;
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
    },
    [activeTab.dataSourceId],
  );

  const resizeListenersRef = useRef<{
    onMove: (e: MouseEvent) => void;
    onUp: () => void;
  } | null>(null);

  const handleResizeStart = useCallback(() => {
    resizingRef.current = true;
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const el = document.getElementById("editor-area");
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setEditorHeight(
        Math.max(80, Math.min(e.clientY - rect.top, rect.height - 80)),
      );
    };
    const onUp = () => {
      resizingRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      resizeListenersRef.current = null;
    };
    resizeListenersRef.current = { onMove, onUp };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  // Cleanup resize listeners on unmount
  useEffect(() => {
    return () => {
      if (resizeListenersRef.current) {
        document.removeEventListener(
          "mousemove",
          resizeListenersRef.current.onMove,
        );
        document.removeEventListener(
          "mouseup",
          resizeListenersRef.current.onUp,
        );
      }
    };
  }, []);

  // --- Loading ---
  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-ctp-crust">
        <VscLoading size={24} className="animate-spin-slow text-ctp-blue" />
      </div>
    );
  }

  // --- Setup ---
  if (!configured) {
    return (
      <div className="flex items-center justify-center h-screen bg-ctp-crust dot-grid">
        <div className="bg-ctp-base border border-ctp-surface0 rounded-xl p-8 max-w-md shadow-2xl animate-fade-in">
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
              }}
            >
              <VscCode size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-ctp-text font-display">
                SQL Studio
              </h1>
              <p className="text-xs text-ctp-overlay0">設定が必要です</p>
            </div>
          </div>
          <p className="text-xs text-ctp-subtext mb-4">
            プロジェクトルートに{" "}
            <code className="text-ctp-peach font-mono text-xs">.env</code>{" "}
            ファイルを作成してください:
          </p>
          <pre className="bg-ctp-crust border border-ctp-surface0 p-3 rounded-lg text-xs text-ctp-text font-mono leading-relaxed">
            <span className="text-ctp-overlay0">REDASH_URL</span>=
            <span className="text-ctp-green">https://redash.example.com</span>
            {"\n"}
            <span className="text-ctp-overlay0">REDASH_API_KEY</span>=
            <span className="text-ctp-green">your_api_key</span>
          </pre>
        </div>
      </div>
    );
  }

  // --- Main ---
  return (
    <div className="flex flex-col h-screen bg-ctp-crust">
      {/* ===== Header ===== */}
      <header className="flex items-center gap-3 px-4 h-12 bg-ctp-crust border-b border-ctp-surface0 shrink-0">
        {/* Left: Logo + Mode */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className={`p-1.5 rounded-md transition-colors ${sidebarOpen ? "text-ctp-blue bg-ctp-blue/10" : "text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0"}`}
            title="Toggle sidebar"
          >
            <VscSplitHorizontal size={18} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-ctp-surface0">
              <VscCode size={14} className="text-ctp-overlay0" />
            </div>
            <h1 className="text-xs font-semibold text-ctp-subtext tracking-tight select-none font-display">
              SQL Studio
            </h1>
          </div>
        </div>

        {/* Center: Mode switch */}
        <div className="flex items-center bg-ctp-surface0/70 rounded-lg p-0.5 ml-3 gap-0.5">
          {(
            [
              { key: "editor", icon: <VscCode size={14} />, label: "Editor" },
              {
                key: "dashboard",
                icon: <VscDashboard size={14} />,
                label: "Dashboard",
              },
              {
                key: "browser",
                icon: <VscDatabase size={14} />,
                label: "Browser",
              },
            ] as const
          ).map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`p-1.5 rounded-md transition-all ${
                mode === m.key
                  ? "bg-white text-ctp-text shadow-sm"
                  : "text-ctp-overlay0 hover:text-ctp-subtext"
              }`}
              title={m.label}
            >
              {m.icon}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          {/* Environment selector */}
          {environments.length > 0 && (
            <div className="flex items-center gap-0.5 bg-ctp-surface0/70 rounded-lg p-0.5">
              {environments.map((env) => {
                const style = ENV_STYLES[env.name as keyof typeof ENV_STYLES];
                const isActive = currentEnv === env.name;
                return (
                  <button
                    key={env.name}
                    onClick={() => handleEnvSwitch(env.name)}
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-bold tracking-wider transition-all ${
                      isActive
                        ? `bg-white shadow-sm ${style?.label ?? "text-ctp-text"}`
                        : "text-ctp-overlay0 hover:text-ctp-subtext"
                    }`}
                  >
                    {isActive && style && (
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${style.dot} shrink-0`}
                      />
                    )}
                    {env.label}
                  </button>
                );
              })}
            </div>
          )}

          {(mode === "editor" || mode === "browser") && (
            <>
              <div className="w-px h-6 bg-ctp-surface0" />
              <DataSourceSelect
                dataSources={dataSources}
                selectedId={activeTab.dataSourceId}
                onChange={(id) =>
                  updateTab(activeTab.id, { dataSourceId: id, isDirty: true })
                }
              />

              {mode === "editor" && (
                <>
                  <div className="w-px h-6 bg-ctp-surface0" />

                  <button
                    onClick={() => handleExecute()}
                    disabled={
                      isExecuting ||
                      !activeTab.dataSourceId ||
                      !activeTab.sql.trim()
                    }
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      isExecuting
                        ? "bg-ctp-yellow/10 text-ctp-yellow border border-ctp-yellow/20"
                        : "bg-ctp-green/10 text-ctp-green border border-ctp-green/20 hover:bg-ctp-green/15 disabled:opacity-30"
                    }`}
                    title="Run (⌘+Enter)"
                  >
                    {isExecuting ? (
                      <VscLoading size={14} className="animate-spin-slow" />
                    ) : (
                      <VscPlay size={14} />
                    )}
                    {isExecuting ? "Running" : "Run"}
                  </button>

                  <button
                    onClick={handleExplain}
                    disabled={
                      isExecuting ||
                      !activeTab.dataSourceId ||
                      !activeTab.sql.trim()
                    }
                    className="p-2 rounded-lg text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0 disabled:opacity-30 transition-colors"
                    title="EXPLAIN (実行計画を表示)"
                  >
                    <VscSymbolKeyword size={16} />
                  </button>

                  <button
                    onClick={handleShareUrl}
                    disabled={!activeTab.sql.trim()}
                    className={`p-2 rounded-lg transition-colors disabled:opacity-30 ${
                      urlSharedSuccess
                        ? "text-ctp-green bg-ctp-green/10"
                        : "text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0"
                    }`}
                    title="URLをコピーしてシェア"
                  >
                    <VscLink size={16} />
                  </button>

                  <button
                    onClick={() => {
                      setSaveName(
                        activeTab.name === "Untitled" ? "" : activeTab.name,
                      );
                      setSaveDialogOpen(true);
                    }}
                    className="p-2 rounded-lg text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0 transition-colors"
                    title="Save query"
                  >
                    <VscSave size={16} />
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </header>

      {/* ===== Body ===== */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Sidebar - Desktop: inline, Mobile: drawer overlay */}
        {sidebarOpen && (
          <>
            {/* Mobile backdrop */}
            <div
              className="fixed inset-0 z-30 bg-black/40 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <aside className="fixed md:relative inset-y-0 left-0 z-40 md:z-auto w-72 md:w-64 bg-ctp-crust border-r border-ctp-surface0 flex flex-col shrink-0 animate-slide-in shadow-2xl md:shadow-none">
              <QueryList
                schemaMap={schemaMap}
                selectedTable={browserTable}
                onSelectTable={(table) => {
                  handleSelectTable(table);
                  // Close sidebar on mobile after selecting
                  if (window.innerWidth < 768) setSidebarOpen(false);
                }}
                savedQueries={savedQueries}
                history={history}
                onLoadQuery={(sql, dsId) => {
                  handleLoadQuery(sql, dsId);
                  if (window.innerWidth < 768) setSidebarOpen(false);
                }}
                onDeleteQuery={deleteQuery}
                onImportFromRedash={importFromRedash}
              />
            </aside>
          </>
        )}

        {/* Main */}
        <main className="flex-1 flex flex-col min-w-0">
          {mode === "editor" ? (
            <>
              {/* Tabs */}
              <QueryTabs
                tabs={tabs}
                activeTabId={activeTabId}
                onSelect={setActiveTabId}
                onClose={(id) => {
                  const remaining = tabs.filter((t) => t.id !== id);
                  if (remaining.length === 0) return;
                  setTabs(remaining);
                  if (activeTabId === id) {
                    setActiveTabId(remaining[remaining.length - 1].id);
                  }
                }}
                onAdd={() => {
                  const tab = createTab();
                  tab.dataSourceId = activeTab.dataSourceId;
                  setTabs((prev) => [...prev, tab]);
                  setActiveTabId(tab.id);
                }}
              />

              {/* Parameter Form */}
              <ParameterForm
                sql={activeTab.sql}
                onExecute={handleParameterExecute}
                isExecuting={isExecuting}
              />

              {/* Editor + Results */}
              <div className="flex-1 flex flex-col min-h-0" id="editor-area">
                {/* Editor */}
                <div
                  style={{ height: editorHeight }}
                  className="shrink-0 relative"
                >
                  <SqlEditor
                    value={activeTab.sql}
                    onChange={(sql) =>
                      updateTab(activeTab.id, { sql, isDirty: true })
                    }
                    onExecute={handleExecute}
                    schema={schema}
                  />
                </div>

                {/* Resize */}
                <div
                  className="resize-handle h-2 bg-ctp-crust"
                  onMouseDown={handleResizeStart}
                />

                {/* Results */}
                <div className="flex-1 min-h-0 overflow-hidden bg-ctp-base">
                  {activeTab.error ? (
                    <div className="p-4 animate-fade-in">
                      <div className="bg-ctp-red/5 border border-ctp-red/20 rounded-lg p-4">
                        <div className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-ctp-red mt-1.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-ctp-red text-xs font-semibold mb-1">
                              {parseErrorMessage(activeTab.error).summary}
                            </p>
                            <pre className="text-ctp-red/70 text-xs font-mono whitespace-pre-wrap leading-relaxed">
                              {activeTab.error}
                            </pre>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : activeTab.result ? (
                    <ResultTable
                      result={activeTab.result}
                      executionTimeMs={activeTab.executionTimeMs}
                    />
                  ) : activeTab.isExecuting ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="flex items-center gap-3 text-ctp-subtext text-sm">
                        <VscLoading
                          size={18}
                          className="animate-spin-slow text-ctp-blue"
                        />
                        <span>Running query...</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full dot-grid">
                      <div className="text-center">
                        <div className="text-ctp-surface2 font-mono text-xs leading-relaxed mb-4 select-none">
                          <pre className="inline-block text-left">{`  ┌─────────────────────┐
  │  SELECT * FROM ...  │
  └─────────────────────┘`}</pre>
                        </div>
                        <div className="flex items-center justify-center gap-2 text-xs text-ctp-surface2">
                          <kbd>⌘</kbd> + <kbd>Enter</kbd>
                          <span>to run</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : mode === "browser" ? (
            foundTable && activeTab.dataSourceId ? (
              <TableViewer
                table={foundTable}
                dataSourceId={activeTab.dataSourceId}
                onClose={() => setBrowserTable(null)}
                onOpenInEditor={handleOpenInEditor}
              />
            ) : (
              <div className="flex items-center justify-center h-full dot-grid">
                <div className="text-center text-ctp-surface2">
                  <VscDatabase size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Select a table from the sidebar</p>
                </div>
              </div>
            )
          ) : (
            <Dashboard queries={savedQueries} dataSources={dataSources} />
          )}
        </main>
      </div>

      {/* ===== Status Bar ===== */}
      <footer className="flex items-center justify-between px-4 h-8 bg-ctp-crust border-t border-ctp-surface0 text-xs shrink-0 select-none">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${configured ? "bg-ctp-green animate-pulse-dot" : "bg-ctp-red"}`}
            />
            <span className={configured ? "text-ctp-green" : "text-ctp-red"}>
              {configured ? "Connected" : "Disconnected"}
            </span>
          </span>
          {redashUrl && (
            <>
              <VscChevronRight size={11} className="text-ctp-surface1" />
              <span className="text-ctp-surface2 truncate max-w-48">
                {redashUrl.replace(/^https?:\/\//, "")}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {activeDs && (mode === "editor" || mode === "browser") && (
            <span className="text-ctp-overlay0">{activeDs.name}</span>
          )}
          {mode === "browser" && browserTable && (
            <span className="text-ctp-surface2 font-mono">{browserTable}</span>
          )}
          {activeTab.result && mode === "editor" && (
            <span className="text-ctp-surface2 tabular-nums">
              {activeTab.result.rows.length.toLocaleString()} rows
            </span>
          )}
        </div>
      </footer>

      {/* ===== Save Dialog ===== */}
      {saveDialogOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setSaveDialogOpen(false)}
        >
          <div
            className="bg-white border border-ctp-surface0 rounded-xl p-6 w-96 shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold text-ctp-text mb-4">
              Save Query
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-ctp-overlay0 block mb-1.5 font-medium">
                  Name
                </label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  className="w-full bg-ctp-crust text-ctp-text border border-ctp-surface0 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ctp-blue/50 transition-colors"
                  placeholder="e.g. Monthly Active Users"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                    if (e.key === "Escape") setSaveDialogOpen(false);
                  }}
                />
              </div>
              <div>
                <label className="text-sm text-ctp-overlay0 block mb-1.5 font-medium">
                  Tags
                </label>
                <input
                  type="text"
                  value={saveTags}
                  onChange={(e) => setSaveTags(e.target.value)}
                  className="w-full bg-ctp-crust text-ctp-text border border-ctp-surface0 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ctp-blue/50 transition-colors"
                  placeholder="Comma-separated, e.g. report, users"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setSaveDialogOpen(false)}
                className="px-4 py-2 rounded-lg text-sm text-ctp-overlay0 hover:bg-ctp-surface0 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!saveName.trim()}
                className="px-4 py-2 bg-ctp-blue text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-30 transition-opacity"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
