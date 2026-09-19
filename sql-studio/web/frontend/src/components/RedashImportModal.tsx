import { useState, useEffect, useCallback } from "react";
import { VscCloudDownload, VscClose, VscLoading } from "react-icons/vsc";
import type { SavedQuery } from "../types";

type RedashQuery = {
  id: number;
  name: string;
  query: string;
  data_source_id: number;
  tags: string[];
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  savedQueries: SavedQuery[];
  onImport: (ids: number[]) => Promise<{ imported: number; skipped: number }>;
};

export default function RedashImportModal({
  isOpen,
  onClose,
  savedQueries,
  onImport,
}: Props) {
  const [redashQueries, setRedashQueries] = useState<RedashQuery[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const savedNames = new Set(savedQueries.map((q) => q.name));

  const fetchRedashQueries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/redash-queries");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        count: number;
        results: RedashQuery[];
      };
      setRedashQueries(data.results ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void fetchRedashQueries();
      setSelected(new Set());
      setResult(null);
      setSearchText("");
    }
  }, [isOpen, fetchRedashQueries]);

  if (!isOpen) return null;

  const filtered = redashQueries.filter(
    (q) =>
      !searchText ||
      q.name.toLowerCase().includes(searchText.toLowerCase()) ||
      q.query.toLowerCase().includes(searchText.toLowerCase()),
  );

  const toggleSelect = (id: number, alreadySaved: boolean) => {
    if (alreadySaved) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    try {
      const r = await onImport(Array.from(selected));
      setResult(r);
      setSelected(new Set());
    } catch (e) {
      setError(String(e));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-ctp-base border border-ctp-surface0 rounded-xl shadow-2xl w-[560px] max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-ctp-surface0 shrink-0">
          <div className="flex items-center gap-2">
            <VscCloudDownload size={14} className="text-ctp-blue" />
            <span className="text-sm font-medium text-ctp-text">
              Redashからインポート
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0 transition-colors"
          >
            <VscClose size={14} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-ctp-surface0 shrink-0">
          <input
            type="text"
            placeholder="クエリを検索..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full px-3 py-1.5 text-xs bg-ctp-mantle border border-ctp-surface0 rounded-lg text-ctp-text placeholder-ctp-overlay0 focus:outline-none focus:border-ctp-blue transition-colors"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-ctp-overlay0">
              <span className="text-xs">読み込み中...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <span className="text-xs text-ctp-red">{error}</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-ctp-overlay0">
              <span className="text-xs">クエリが見つかりません</span>
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((q) => {
                const alreadySaved = savedNames.has(q.name);
                const isSelected = selected.has(q.id);
                return (
                  <div
                    key={q.id}
                    onClick={() => toggleSelect(q.id, alreadySaved)}
                    className={`flex items-start gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                      alreadySaved
                        ? "opacity-40 cursor-default"
                        : "cursor-pointer hover:bg-ctp-mantle"
                    } ${isSelected ? "bg-ctp-blue/10 border border-ctp-blue/20" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={alreadySaved}
                      onChange={() => toggleSelect(q.id, alreadySaved)}
                      className="mt-0.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-ctp-text truncate">
                          {q.name}
                        </span>
                        {alreadySaved && (
                          <span className="text-[9px] bg-ctp-surface0 text-ctp-overlay0 rounded px-1 shrink-0">
                            保存済み
                          </span>
                        )}
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
                        {q.query.replace(/\s+/g, " ").slice(0, 60)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-ctp-surface0 shrink-0">
          <div className="text-xs text-ctp-overlay0">
            {result ? (
              <span className="text-ctp-green">
                {result.imported}件インポート完了
                {result.skipped > 0 ? `（${result.skipped}件スキップ）` : ""}
              </span>
            ) : (
              <span>{selected.size > 0 ? `${selected.size}件選択中` : ""}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0 rounded-lg transition-colors"
            >
              閉じる
            </button>
            <button
              onClick={() => void handleImport()}
              disabled={selected.size === 0 || importing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-ctp-blue text-ctp-base rounded-lg hover:bg-ctp-sapphire transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? (
                <>
                  <VscLoading size={12} className="animate-spin" />
                  インポート中...
                </>
              ) : (
                <>
                  <VscCloudDownload size={12} />
                  インポート
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
