import { useState, useEffect } from "react";
import { VscAdd, VscClose } from "react-icons/vsc";
import type { TableFilter } from "../types";

type Props = {
  filters: TableFilter[];
  columns: string[];
  onFilterChange: (filters: TableFilter[]) => void;
};

const OPERATORS: TableFilter["operator"][] = [
  "=",
  "!=",
  "LIKE",
  ">",
  "<",
  "IS NULL",
  "IS NOT NULL",
];

function FilterValueInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const commit = () => {
    if (local !== value) onCommit(local);
  };

  return (
    <input
      type="text"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      placeholder="value"
      className="bg-transparent text-ctp-green text-[11px] outline-none w-20 font-mono placeholder:text-ctp-surface2"
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export default function FilterBar({ filters, columns, onFilterChange }: Props) {
  const addFilter = () => {
    if (columns.length === 0) return;
    onFilterChange([
      ...filters,
      {
        id: crypto.randomUUID(),
        column: columns[0],
        operator: "=",
        value: "",
      },
    ]);
  };

  const updateFilter = (id: string, updates: Partial<TableFilter>) => {
    onFilterChange(
      filters.map((f) => (f.id === id ? { ...f, ...updates } : f)),
    );
  };

  const removeFilter = (id: string) => {
    onFilterChange(filters.filter((f) => f.id !== id));
  };

  const needsValue = (op: TableFilter["operator"]) =>
    op !== "IS NULL" && op !== "IS NOT NULL";

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 flex-wrap">
      {filters.map((f) => (
        <div
          key={f.id}
          className="flex items-center gap-1 bg-ctp-crust border border-ctp-surface0 rounded-md px-1.5 py-0.5"
        >
          <select
            value={f.column}
            onChange={(e) => updateFilter(f.id, { column: e.target.value })}
            className="bg-transparent text-ctp-text text-[11px] outline-none font-mono max-w-24"
          >
            {columns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={f.operator}
            onChange={(e) =>
              updateFilter(f.id, {
                operator: e.target.value as TableFilter["operator"],
              })
            }
            className="bg-transparent text-ctp-peach text-[11px] outline-none font-mono"
          >
            {OPERATORS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          {needsValue(f.operator) && (
            <FilterValueInput
              value={f.value}
              onCommit={(v) => updateFilter(f.id, { value: v })}
            />
          )}
          <button
            onClick={() => removeFilter(f.id)}
            className="text-ctp-overlay0 hover:text-ctp-red ml-0.5 transition-colors"
          >
            <VscClose size={12} />
          </button>
        </div>
      ))}
      <button
        onClick={addFilter}
        disabled={columns.length === 0}
        className="flex items-center gap-1 text-[11px] text-ctp-overlay0 hover:text-ctp-text px-1.5 py-0.5 rounded-md hover:bg-ctp-surface0 transition-colors disabled:opacity-30"
      >
        <VscAdd size={12} />
        Filter
      </button>
    </div>
  );
}
