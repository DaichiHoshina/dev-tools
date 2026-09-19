import type { DataSource } from "../types";
import { VscDatabase } from "react-icons/vsc";

type Props = {
  dataSources: DataSource[];
  selectedId: number | null;
  onChange: (id: number) => void;
  compact?: boolean;
};

export default function DataSourceSelect({
  dataSources,
  selectedId,
  onChange,
  compact,
}: Props) {
  const selected = dataSources.find((ds) => ds.id === selectedId);

  return (
    <div className="relative group">
      <div className="flex items-center gap-2">
        <div
          className={`flex items-center justify-center rounded-md ${compact ? "w-5 h-5" : "w-6 h-6"} ${selected ? "bg-ctp-blue/10 text-ctp-blue" : "bg-ctp-surface0 text-ctp-overlay0"}`}
        >
          <VscDatabase size={compact ? 13 : 15} />
        </div>
        <select
          value={selectedId ?? ""}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`bg-transparent text-ctp-text border-none focus:outline-none cursor-pointer appearance-none pr-5 ${compact ? "text-xs" : "text-sm"} font-medium`}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364657d' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 0 center",
          }}
        >
          <option value="" disabled>
            Select a data source
          </option>
          {dataSources.map((ds) => (
            <option key={ds.id} value={ds.id}>
              {ds.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
