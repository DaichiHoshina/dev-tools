import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  VscClose,
  VscCode,
  VscArrowUp,
  VscArrowDown,
  VscLoading,
  VscTable,
  VscSymbolStructure,
} from "react-icons/vsc";
import FilterBar from "./FilterBar";
import type { TableFilter, SchemaTable, QueryResult } from "../types";

type Props = {
  table: SchemaTable;
  dataSourceId: number;
  onClose: () => void;
  onOpenInEditor: (sql: string) => void;
};

function buildQuery(
  tableName: string,
  filters: TableFilter[],
  sort: { column: string | null; direction: "ASC" | "DESC" },
  limit: number,
): string {
  let sql = `SELECT * FROM ${tableName}`;
  const wheres = filters
    .map((f) => {
      if (f.operator === "IS NULL" || f.operator === "IS NOT NULL") {
        return `${f.column} ${f.operator}`;
      }
      const escaped = f.value.replace(/'/g, "''");
      if (f.operator === "LIKE") {
        return `${f.column} LIKE '%${escaped}%'`;
      }
      return `${f.column} ${f.operator} '${escaped}'`;
    })
    .filter(Boolean);
  if (wheres.length > 0) sql += ` WHERE ${wheres.join(" AND ")}`;
  if (sort.column) sql += ` ORDER BY ${sort.column} ${sort.direction}`;
  sql += ` LIMIT ${limit}`;
  return sql;
}

export default function TableViewer({
  table,
  dataSourceId,
  onClose,
  onOpenInEditor,
}: Props) {
  const [activeTab, setActiveTab] = useState<"data" | "structure">("data");
  const [filters, setFilters] = useState<TableFilter[]>([]);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"ASC" | "DESC">("ASC");
  const [limit, setLimit] = useState(100);

  const [result, setResult] = useState<QueryResult | null>(null);
  const [structureResult, setStructureResult] = useState<QueryResult | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPolling = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    return clearPolling;
  }, [clearPolling]);

  const executeQuery = useCallback(
    async (sql: string): Promise<QueryResult> => {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataSourceId, query: sql }),
      });
      const data = await res.json();
      if ("error" in data) throw new Error(data.error);

      if (data.status === "done") return data.data;

      // Poll for result
      return new Promise<QueryResult>((resolve, reject) => {
        const poll = async (jobId: string) => {
          try {
            const jobRes = await fetch(`/api/jobs/${jobId}`);
            if (!jobRes.ok) throw new Error(`HTTP ${jobRes.status}`);
            const job = await jobRes.json();

            if (job.status === 3 && job.query_result_id) {
              const resultRes = await fetch(
                `/api/results/${job.query_result_id}`,
              );
              if (!resultRes.ok) throw new Error(`HTTP ${resultRes.status}`);
              resolve(await resultRes.json());
            } else if (job.status === 4) {
              reject(new Error(job.error || "Query execution failed"));
            } else {
              pollingRef.current = setTimeout(() => poll(jobId), 1000);
            }
          } catch (e) {
            reject(e);
          }
        };
        poll(data.jobId);
      });
    },
    [dataSourceId],
  );

  // Fetch data
  const fetchData = useCallback(async () => {
    clearPolling();
    setIsLoading(true);
    setError(null);
    try {
      const sql = buildQuery(
        table.fullName,
        filters,
        { column: sortColumn, direction: sortDirection },
        limit,
      );
      const data = await executeQuery(sql);
      setResult(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, [
    table.fullName,
    filters,
    sortColumn,
    sortDirection,
    limit,
    executeQuery,
    clearPolling,
  ]);

  // Fetch structure
  const fetchStructure = useCallback(async () => {
    try {
      const sql = `SHOW COLUMNS FROM ${table.fullName}`;
      const data = await executeQuery(sql);
      setStructureResult(data);
    } catch {
      // Some DBs may not support SHOW COLUMNS; silently ignore
    }
  }, [table.fullName, executeQuery]);

  // Reset and fetch when table changes
  useEffect(() => {
    setFilters([]);
    setSortColumn(null);
    setSortDirection("ASC");
    setLimit(100);
    setStructureResult(null);
    setActiveTab("data");
    setResult(null);
    setError(null);

    // Fetch initial data with clean state
    clearPolling();
    setIsLoading(true);
    const sql = buildQuery(
      table.fullName,
      [],
      { column: null, direction: "ASC" },
      100,
    );
    executeQuery(sql)
      .then((data) => setResult(data))
      .catch((e) => setError(String(e)))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.fullName, dataSourceId]);

  // Re-fetch when sort/limit/filters change (but not on initial mount)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    fetchData();
  }, [fetchData]);

  // Reset initial mount flag when table changes
  useEffect(() => {
    isInitialMount.current = true;
  }, [table.fullName]);

  // Load structure when tab switches
  useEffect(() => {
    if (activeTab === "structure" && !structureResult) {
      fetchStructure();
    }
  }, [activeTab, structureResult, fetchStructure]);

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      if (sortDirection === "ASC") {
        setSortDirection("DESC");
      } else {
        setSortColumn(null);
        setSortDirection("ASC");
      }
    } else {
      setSortColumn(col);
      setSortDirection("ASC");
    }
  };

  const handleFilterChange = (newFilters: TableFilter[]) => {
    setFilters(newFilters);
  };

  const currentSql = buildQuery(
    table.fullName,
    filters,
    { column: sortColumn, direction: sortDirection },
    limit,
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-ctp-crust border-b border-ctp-surface0 shrink-0">
        <VscTable size={12} className="text-ctp-teal shrink-0" />
        <span className="text-xs font-semibold text-ctp-text truncate font-mono">
          {table.fullName}
        </span>

        <div className="flex items-center bg-ctp-crust rounded-md p-0.5 ml-3">
          <button
            onClick={() => setActiveTab("data")}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
              activeTab === "data"
                ? "bg-white text-ctp-text shadow-sm"
                : "text-ctp-overlay0 hover:text-ctp-subtext"
            }`}
          >
            <VscTable size={11} />
            Data
          </button>
          <button
            onClick={() => setActiveTab("structure")}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
              activeTab === "structure"
                ? "bg-white text-ctp-text shadow-sm"
                : "text-ctp-overlay0 hover:text-ctp-subtext"
            }`}
          >
            <VscSymbolStructure size={11} />
            Structure
          </button>
        </div>

        <div className="flex-1" />

        <button
          onClick={() => onOpenInEditor(currentSql)}
          className="flex items-center gap-1 text-[11px] text-ctp-overlay0 hover:text-ctp-text px-1.5 py-0.5 rounded-md hover:bg-ctp-surface0 transition-colors"
          title="Open in Editor"
        >
          <VscCode size={13} />
          Open in Editor
        </button>
        <button
          onClick={onClose}
          className="p-1 text-ctp-overlay0 hover:text-ctp-text rounded-md hover:bg-ctp-surface0 transition-colors"
          title="Close"
        >
          <VscClose size={14} />
        </button>
      </div>

      {activeTab === "data" ? (
        <DataTab
          result={result}
          isLoading={isLoading}
          error={error}
          filters={filters}
          columns={table.columns}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          limit={limit}
          onFilterChange={handleFilterChange}
          onSort={handleSort}
          onLimitChange={setLimit}
        />
      ) : (
        <StructureTab result={structureResult} />
      )}
    </div>
  );
}

// --- Data Tab ---

type DataTabProps = {
  result: QueryResult | null;
  isLoading: boolean;
  error: string | null;
  filters: TableFilter[];
  columns: string[];
  sortColumn: string | null;
  sortDirection: "ASC" | "DESC";
  limit: number;
  onFilterChange: (filters: TableFilter[]) => void;
  onSort: (col: string) => void;
  onLimitChange: (limit: number) => void;
};

function DataTab({
  result,
  isLoading,
  error,
  filters,
  columns,
  sortColumn,
  sortDirection,
  limit,
  onFilterChange,
  onSort,
  onLimitChange,
}: DataTabProps) {
  const tableCols = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      result?.columns.map((col) => ({
        accessorKey: col.name,
        header: col.name,
        cell: (info) => {
          const val = info.getValue();
          if (val === null || val === undefined) {
            return (
              <span className="text-ctp-surface2 italic text-xs">NULL</span>
            );
          }
          return String(val);
        },
      })) ?? [],
    [result?.columns],
  );

  const reactTable = useReactTable({
    data: result?.rows ?? [],
    columns: tableCols,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
  });

  return (
    <>
      {/* Filter Bar */}
      <div className="shrink-0 bg-ctp-base border-b border-ctp-surface0/60">
        <FilterBar
          filters={filters}
          columns={columns}
          onFilterChange={onFilterChange}
        />
      </div>

      {/* Table */}
      {error ? (
        <div className="p-4 animate-fade-in">
          <div className="bg-ctp-red/5 border border-ctp-red/20 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-ctp-red mt-1.5 shrink-0" />
              <pre className="text-ctp-red text-xs font-mono whitespace-pre-wrap leading-relaxed">
                {error}
              </pre>
            </div>
          </div>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center flex-1">
          <div className="flex items-center gap-3 text-ctp-subtext text-sm">
            <VscLoading size={18} className="animate-spin-slow text-ctp-blue" />
            <span>Loading data...</span>
          </div>
        </div>
      ) : result ? (
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-[12px] font-['JetBrains_Mono',monospace]">
            <thead className="sticky top-0 z-10">
              {reactTable.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  <th className="bg-ctp-crust text-ctp-overlay0 text-right px-2 py-1.5 border-b border-ctp-surface0 w-12 text-xs font-normal tabular-nums">
                    #
                  </th>
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={() => onSort(header.column.id)}
                      className="bg-ctp-crust text-ctp-blue px-2.5 py-1.5 border-b border-ctp-surface0 text-left font-medium cursor-pointer hover:text-ctp-blue select-none whitespace-nowrap transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {sortColumn === header.column.id &&
                          sortDirection === "ASC" && (
                            <VscArrowUp size={11} className="text-ctp-blue" />
                          )}
                        {sortColumn === header.column.id &&
                          sortDirection === "DESC" && (
                            <VscArrowDown size={11} className="text-ctp-blue" />
                          )}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {reactTable.getRowModel().rows.map((row, idx) => (
                <tr
                  key={row.id}
                  className="group hover:bg-ctp-blue/[0.06] transition-colors"
                >
                  <td className="text-ctp-surface2 text-right px-2 py-1 border-b border-ctp-surface0/40 text-xs tabular-nums">
                    {idx + 1}
                  </td>
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-2.5 py-1 border-b border-ctp-surface0/40 max-w-sm truncate text-ctp-subtext group-hover:text-ctp-text transition-colors"
                      title={String(cell.getValue() ?? "")}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Footer */}
      {result && (
        <div className="flex items-center justify-between px-3 py-1 bg-ctp-crust border-t border-ctp-surface0 text-[11px] shrink-0">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-ctp-green" />
              <span className="text-ctp-text font-medium tabular-nums">
                {result.rows.length.toLocaleString()}
              </span>
              <span className="text-ctp-overlay0">rows</span>
            </span>
            <span className="text-ctp-overlay0">
              {result.columns.length} cols
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-ctp-surface2">LIMIT</span>
            {[100, 200, 500, 1000].map((n) => (
              <button
                key={n}
                onClick={() => onLimitChange(n)}
                className={`px-1.5 py-0.5 rounded text-xs tabular-nums transition-colors ${
                  limit === n
                    ? "bg-ctp-blue/10 text-ctp-blue font-medium"
                    : "text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// --- Structure Tab ---

function StructureTab({ result }: { result: QueryResult | null }) {
  if (!result) {
    return (
      <div className="flex items-center justify-center flex-1">
        <div className="flex items-center gap-3 text-ctp-subtext text-sm">
          <VscLoading size={18} className="animate-spin-slow text-ctp-blue" />
          <span>Loading structure...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse text-[12px] font-['JetBrains_Mono',monospace]">
        <thead className="sticky top-0 z-10">
          <tr>
            {result.columns.map((col) => (
              <th
                key={col.name}
                className="bg-ctp-crust text-ctp-blue px-2.5 py-1.5 border-b border-ctp-surface0 text-left font-medium whitespace-nowrap"
              >
                {col.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, idx) => (
            <tr
              key={idx}
              className="group hover:bg-ctp-blue/[0.06] transition-colors"
            >
              {result.columns.map((col) => (
                <td
                  key={col.name}
                  className="px-2.5 py-1 border-b border-ctp-surface0/40 text-ctp-subtext group-hover:text-ctp-text transition-colors whitespace-nowrap"
                >
                  {row[col.name] === null || row[col.name] === undefined ? (
                    <span className="text-ctp-surface2 italic text-xs">
                      NULL
                    </span>
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
