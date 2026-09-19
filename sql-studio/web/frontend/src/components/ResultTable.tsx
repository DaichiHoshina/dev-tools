import { useMemo, useCallback, useState, useEffect } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  VscArrowDown,
  VscArrowUp,
  VscCloudDownload,
  VscCopy,
  VscCheck,
} from "react-icons/vsc";
import type { QueryResult } from "../types";

type Props = {
  result: QueryResult;
  executionTimeMs: number | null;
};

export default function ResultTable({ result, executionTimeMs }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [copied, setCopied] = useState(false);
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());

  useEffect(() => {
    setExpandedCells(new Set());
  }, [result]);

  const toggleCell = useCallback((key: string) => {
    setExpandedCells((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      result.columns.map((col) => ({
        accessorKey: col.name,
        header: col.name,
        cell: (info) => {
          const val = info.getValue();
          if (val === null || val === undefined) {
            return (
              <span className="text-ctp-surface2 italic text-xs">NULL</span>
            );
          }
          const str = String(val);
          const cellKey = `${info.row.id}-${info.column.id}`;
          const isExpanded = expandedCells.has(cellKey);
          const isLong = str.length > 30;
          if (!isLong) return <span>{str}</span>;
          return (
            <span
              onClick={(e) => {
                e.stopPropagation();
                toggleCell(cellKey);
              }}
              className={`cursor-pointer ${
                isExpanded
                  ? "whitespace-pre-wrap break-all text-ctp-text"
                  : "block truncate max-w-[200px]"
              }`}
              title={isExpanded ? "クリックで折りたたむ" : "クリックで展開"}
            >
              {str}
            </span>
          );
        },
      })),
    [result.columns, expandedCells, toggleCell],
  );

  const table = useReactTable({
    data: result.rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const exportCsv = useCallback(() => {
    const header = result.columns.map((c) => c.name).join(",");
    const rows = result.rows.map((row) =>
      result.columns
        .map((c) => {
          const val = row[c.name];
          if (val === null || val === undefined) return "";
          const str = String(val);
          return str.includes(",") || str.includes('"') || str.includes("\n")
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `query_${new Date().toISOString().slice(0, 19).replace(/[:-]/g, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const copyJson = useCallback(() => {
    const json = JSON.stringify(result.rows, null, 2);
    navigator.clipboard
      .writeText(json)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        window.prompt("JSONをコピーしてください:", json);
      });
  }, [result.rows]);

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Stats bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-ctp-crust border-b border-ctp-surface0 text-xs shrink-0">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-ctp-green animate-pulse-dot" />
            <span className="text-ctp-green font-medium tabular-nums">
              {result.rows.length.toLocaleString()}
            </span>
            <span className="text-ctp-overlay0">rows</span>
          </span>
          <span className="text-ctp-blue/70">{result.columns.length} cols</span>
          {executionTimeMs !== null && (
            <span className="text-ctp-overlay0 tabular-nums">
              {executionTimeMs < 1000
                ? `${executionTimeMs}ms`
                : `${(executionTimeMs / 1000).toFixed(2)}s`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={copyJson}
            className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-ctp-surface0 text-ctp-overlay0 hover:text-ctp-text transition-colors"
            title="Copy as JSON"
          >
            {copied ? (
              <VscCheck size={13} className="text-ctp-green" />
            ) : (
              <VscCopy size={13} />
            )}
            <span>JSON</span>
          </button>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-ctp-surface0 text-ctp-overlay0 hover:text-ctp-text transition-colors"
            title="Download CSV"
          >
            <VscCloudDownload size={13} />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm font-['JetBrains_Mono',monospace]">
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                <th className="bg-ctp-crust text-ctp-overlay0 text-right px-3 py-2 border-b border-ctp-surface0 w-12 text-xs font-normal tabular-nums">
                  #
                </th>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className="bg-ctp-crust text-ctp-blue px-4 py-2 border-b border-ctp-surface0 text-left text-xs font-medium cursor-pointer hover:text-ctp-blue select-none whitespace-nowrap transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      {header.column.getIsSorted() === "asc" && (
                        <VscArrowUp size={11} className="text-ctp-blue" />
                      )}
                      {header.column.getIsSorted() === "desc" && (
                        <VscArrowDown size={11} className="text-ctp-blue" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, idx) => (
              <tr
                key={row.id}
                className="group hover:bg-ctp-blue/[0.06] transition-colors"
              >
                <td className="text-ctp-surface2 text-right px-3 py-2 border-b border-ctp-surface0/40 text-xs tabular-nums">
                  {idx + 1}
                </td>
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="px-4 py-2 border-b border-ctp-surface0/40 text-ctp-subtext group-hover:text-ctp-text transition-colors"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
