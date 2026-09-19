import { useState } from "react";
import {
  VscDatabase,
  VscHistory,
  VscSave,
  VscPlay,
  VscTrash,
  VscCheck,
  VscClose,
  VscCloudDownload,
} from "react-icons/vsc";
import type { SchemaTable, SavedQuery, QueryHistoryEntry } from "../types";
import SchemaTree from "./SchemaTree";
import RedashImportModal from "./RedashImportModal";

type Props = {
  schemaMap: Map<string, SchemaTable[]>;
  selectedTable?: string | null;
  onSelectTable: (fullName: string) => void;
  savedQueries?: SavedQuery[];
  history?: QueryHistoryEntry[];
  onLoadQuery?: (sql: string, dataSourceId?: number) => void;
  onDeleteQuery?: (id: string) => void;
  onImportFromRedash?: (
    ids: number[],
  ) => Promise<{ imported: number; skipped: number }>;
};

type Tab = "schema" | "saved" | "history";

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return "たった今";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}時間前`;
  return date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

export default function QueryList({
  schemaMap,
  selectedTable,
  onSelectTable,
  savedQueries = [],
  history = [],
  onLoadQuery,
  onDeleteQuery,
  onImportFromRedash,
}: Props) {
  const [tab, setTab] = useState<Tab>("schema");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);

  const tabs: {
    id: Tab;
    label: string;
    icon: React.ReactNode;
    count?: number;
  }[] = [
    { id: "schema", label: "Schema", icon: <VscDatabase size={13} /> },
    {
      id: "saved",
      label: "Saved",
      icon: <VscSave size={13} />,
      count: savedQueries.length > 0 ? savedQueries.length : undefined,
    },
    {
      id: "history",
      label: "History",
      icon: <VscHistory size={13} />,
      count: history.length > 0 ? Math.min(history.length, 99) : undefined,
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center border-b border-ctp-surface0 bg-ctp-crust shrink-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium transition-all relative ${
              tab === t.id
                ? "text-ctp-blue bg-white"
                : "text-ctp-overlay0 hover:text-ctp-subtext hover:bg-ctp-surface0/30"
            }`}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && (
              <span className="text-[9px] bg-ctp-surface0 text-ctp-overlay0 rounded px-1 tabular-nums">
                {t.count}
              </span>
            )}
            {tab === t.id && (
              <div
                className="absolute bottom-0 left-0 right-0 h-[2px]"
                style={{ background: "var(--env-color-a)" }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === "schema" && (
          <SchemaTree
            schemaMap={schemaMap}
            onSelectTable={onSelectTable}
            selectedTable={selectedTable}
          />
        )}

        {tab === "saved" && (
          <div className="p-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-ctp-overlay0 font-medium">
                保存済みクエリ
              </span>
              <button
                onClick={() => setImportModalOpen(true)}
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-ctp-overlay0 hover:text-ctp-text bg-ctp-surface0/50 hover:bg-ctp-surface0 rounded transition-colors"
                title="Redashからインポート"
              >
                <VscCloudDownload size={12} />
                Import
              </button>
            </div>
            {savedQueries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <VscSave size={24} className="text-ctp-surface2 mb-3" />
                <p className="text-xs text-ctp-surface2">保存済みクエリなし</p>
                <p className="text-[10px] text-ctp-surface1 mt-1">
                  ツールバーの保存ボタンで保存
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {savedQueries.map((q) => (
                  <div
                    key={q.id}
                    className="group flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-ctp-base transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-ctp-text truncate">
                        {q.name}
                      </div>
                      {q.tags.length > 0 && (
                        <div className="flex gap-1 mt-0.5 flex-wrap">
                          {q.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="text-[9px] bg-ctp-surface0 text-ctp-overlay0 rounded px-1"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="text-[10px] text-ctp-surface2 mt-0.5 font-mono truncate">
                        {q.sql.replace(/\s+/g, " ").slice(0, 40)}...
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => onLoadQuery?.(q.sql, q.dataSourceId)}
                        className="p-1 rounded text-ctp-overlay0 hover:text-ctp-green hover:bg-ctp-green/10 transition-colors"
                        title="エディタで開く"
                      >
                        <VscPlay size={12} />
                      </button>
                      {confirmDelete === q.id ? (
                        <>
                          <button
                            onClick={() => {
                              onDeleteQuery?.(q.id);
                              setConfirmDelete(null);
                            }}
                            className="p-1 rounded text-ctp-red hover:bg-ctp-red/10 transition-colors"
                            title="削除確認"
                          >
                            <VscCheck size={12} />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="p-1 rounded text-ctp-overlay0 hover:bg-ctp-surface0 transition-colors"
                          >
                            <VscClose size={12} />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(q.id)}
                          className="p-1 rounded text-ctp-overlay0 hover:text-ctp-red hover:bg-ctp-red/10 transition-colors"
                          title="削除"
                        >
                          <VscTrash size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="p-2">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <VscHistory size={24} className="text-ctp-surface2 mb-3" />
                <p className="text-xs text-ctp-surface2">履歴なし</p>
              </div>
            ) : (
              <div className="space-y-1">
                {history.slice(0, 50).map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => onLoadQuery?.(entry.sql, entry.dataSourceId)}
                    className="w-full text-left group flex flex-col gap-0.5 px-2 py-2 rounded-lg hover:bg-ctp-base transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[10px] font-medium ${
                          entry.error ? "text-ctp-red" : "text-ctp-green"
                        }`}
                      >
                        {entry.error ? "Error" : `${entry.rowCount} rows`}
                      </span>
                      <span className="text-[10px] text-ctp-surface2 shrink-0">
                        {formatTime(entry.executedAt)}
                      </span>
                    </div>
                    <div className="text-[10px] text-ctp-subtext font-mono truncate group-hover:text-ctp-text transition-colors">
                      {entry.sql.replace(/\s+/g, " ").slice(0, 50)}
                    </div>
                    {entry.executionTimeMs > 0 && (
                      <div className="text-[10px] text-ctp-surface2 tabular-nums">
                        {entry.executionTimeMs < 1000
                          ? `${entry.executionTimeMs}ms`
                          : `${(entry.executionTimeMs / 1000).toFixed(2)}s`}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {onImportFromRedash && (
        <RedashImportModal
          isOpen={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          savedQueries={savedQueries}
          onImport={onImportFromRedash}
        />
      )}
    </div>
  );
}
