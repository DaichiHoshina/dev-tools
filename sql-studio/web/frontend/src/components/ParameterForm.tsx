import { useState, useEffect, useMemo } from "react";
import { VscPlay } from "react-icons/vsc";

type Props = {
  sql: string;
  onExecute: (resolvedSql: string) => void;
  isExecuting: boolean;
};

function extractParams(sql: string): string[] {
  const matches = sql.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

export default function ParameterForm({ sql, onExecute, isExecuting }: Props) {
  const params = useMemo(() => extractParams(sql), [sql]);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    setValues((prev) => {
      const next: Record<string, string> = {};
      for (const p of params) {
        next[p] = prev[p] ?? "";
      }
      return next;
    });
  }, [params]);

  if (params.length === 0) return null;

  const handleExecute = () => {
    let resolved = sql;
    for (const [key, val] of Object.entries(values)) {
      // Escape single quotes to prevent SQL injection
      const escaped = val.replace(/'/g, "''");
      resolved = resolved.replaceAll(`{{${key}}}`, escaped);
    }
    onExecute(resolved);
  };

  const isMany = params.length >= 3;

  return (
    <div
      className={`px-4 py-2 bg-ctp-mantle border-b border-ctp-base animate-fade-in ${
        isMany ? "flex flex-col gap-2" : "flex items-center gap-3"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-[10px] uppercase tracking-wider text-ctp-overlay0 font-semibold shrink-0">
          Parameters
        </span>
        {!isMany && (
          <div className="flex items-center gap-2 flex-wrap">
            {params.map((p) => (
              <div key={p} className="flex items-center gap-1.5">
                <label className="text-xs text-ctp-subtext font-mono">
                  {p}
                </label>
                <input
                  type="text"
                  value={values[p] ?? ""}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [p]: e.target.value }))
                  }
                  placeholder="value"
                  className="bg-ctp-base text-ctp-text text-xs border border-ctp-surface0 rounded-md px-2 py-1 w-28 focus:outline-none focus:border-ctp-blue/50 font-mono transition-colors"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleExecute();
                  }}
                />
              </div>
            ))}
          </div>
        )}
        <button
          onClick={handleExecute}
          disabled={isExecuting}
          className={`flex items-center gap-1.5 px-2.5 py-1 bg-ctp-green/10 text-ctp-green rounded-md text-xs font-medium hover:bg-ctp-green/20 disabled:opacity-40 transition-colors shrink-0 ${
            isMany ? "ml-auto" : ""
          }`}
        >
          <VscPlay size={12} />
          Run with Parameters
        </button>
      </div>
      {isMany && (
        <div className="grid grid-cols-2 gap-2">
          {params.map((p) => (
            <div key={p} className="flex items-center gap-1.5">
              <label
                className="text-xs text-ctp-subtext font-mono w-24 shrink-0 truncate"
                title={p}
              >
                {p}
              </label>
              <input
                type="text"
                value={values[p] ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [p]: e.target.value }))
                }
                placeholder="value"
                className="bg-ctp-base text-ctp-text text-xs border border-ctp-surface0 rounded-md px-2 py-1 flex-1 focus:outline-none focus:border-ctp-blue/50 font-mono transition-colors"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleExecute();
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
