import { useState, useMemo } from "react";
import {
  VscChevronRight,
  VscChevronDown,
  VscTable,
  VscSymbolField,
  VscSearch,
  VscClose,
} from "react-icons/vsc";
import type { SchemaTable } from "../types";

type Props = {
  schemaMap: Map<string, SchemaTable[]>;
  onSelectTable: (fullName: string) => void;
  selectedTable?: string | null;
};

export default function SchemaTree({
  schemaMap,
  onSelectTable,
  selectedTable,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const toggleSchema = (schema: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(schema)) next.delete(schema);
      else next.add(schema);
      return next;
    });
  };

  const toggleTable = (fullName: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(fullName)) next.delete(fullName);
      else next.add(fullName);
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (!search) return schemaMap;
    const q = search.toLowerCase();
    const result = new Map<string, SchemaTable[]>();
    for (const [schema, tables] of schemaMap) {
      const matched = tables.filter(
        (t) =>
          t.table.toLowerCase().includes(q) ||
          t.columns.some((c) => c.toLowerCase().includes(q)),
      );
      if (matched.length > 0) {
        result.set(schema, matched);
      }
    }
    return result;
  }, [schemaMap, search]);

  // Auto-expand all schemas when searching
  const effectiveExpanded = search ? new Set(filtered.keys()) : expanded;

  if (schemaMap.size === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-ctp-surface2">
        <VscTable size={24} className="mb-2 opacity-50" />
        <p className="text-xs">Select a data source</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-3 pt-3 pb-1">
        <div className="flex items-center gap-2 bg-ctp-base rounded-lg px-3 py-2 border border-ctp-surface0 focus-within:border-ctp-surface1 transition-colors">
          <VscSearch size={14} className="text-ctp-overlay0 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tables/columns..."
            className="bg-transparent text-ctp-text text-sm flex-1 outline-none placeholder:text-ctp-surface2 font-medium"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-ctp-overlay0 hover:text-ctp-text"
            >
              <VscClose size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto px-1">
        {filtered.size === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-ctp-surface2">
            <p className="text-xs">No results</p>
          </div>
        ) : (
          Array.from(filtered.entries()).map(([schema, tables]) => (
            <div key={schema} className="mb-0.5">
              {/* Schema */}
              <button
                onClick={() => toggleSchema(schema)}
                className="flex items-center gap-1.5 w-full px-3 py-2 text-left hover:bg-ctp-base rounded-lg transition-colors group"
              >
                {effectiveExpanded.has(schema) ? (
                  <VscChevronDown
                    size={12}
                    className="text-ctp-overlay0 shrink-0"
                  />
                ) : (
                  <VscChevronRight
                    size={12}
                    className="text-ctp-overlay0 shrink-0"
                  />
                )}
                <span className="text-sm font-semibold text-ctp-lavender/80 truncate">
                  {schema}
                </span>
                <span className="text-xs text-ctp-surface2 ml-auto tabular-nums">
                  {tables.length}
                </span>
              </button>

              {/* Tables */}
              {effectiveExpanded.has(schema) && (
                <div className="ml-2">
                  {tables.map((t) => (
                    <div key={t.fullName}>
                      <div
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer group ${
                          selectedTable === t.fullName
                            ? "bg-ctp-blue/10 text-ctp-blue"
                            : "hover:bg-ctp-base text-ctp-text"
                        }`}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTable(t.fullName);
                          }}
                          className="shrink-0 p-0.5"
                        >
                          {expandedTables.has(t.fullName) ? (
                            <VscChevronDown
                              size={10}
                              className="text-ctp-overlay0"
                            />
                          ) : (
                            <VscChevronRight
                              size={10}
                              className="text-ctp-overlay0"
                            />
                          )}
                        </button>
                        <VscTable
                          size={12}
                          className={
                            selectedTable === t.fullName
                              ? "text-ctp-blue shrink-0"
                              : "text-ctp-teal/60 shrink-0"
                          }
                        />
                        <span
                          className="text-sm truncate flex-1"
                          onClick={() => onSelectTable(t.fullName)}
                        >
                          {t.table}
                        </span>
                        <span className="text-xs text-ctp-surface2 tabular-nums shrink-0">
                          {t.columns.length}
                        </span>
                      </div>

                      {/* Columns */}
                      {expandedTables.has(t.fullName) && (
                        <div className="ml-6 mb-1">
                          {t.columns.map((col) => (
                            <div
                              key={col}
                              className="flex items-center gap-1.5 px-3 py-0.5 text-xs text-ctp-surface2"
                            >
                              <VscSymbolField
                                size={10}
                                className="text-ctp-surface1 shrink-0"
                              />
                              <span className="truncate font-mono">{col}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
