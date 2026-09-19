import { VscAdd, VscClose } from "react-icons/vsc";
import type { TabState } from "../types";

type Props = {
  tabs: TabState[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
};

export default function QueryTabs({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onAdd,
}: Props) {
  return (
    <div className="flex items-center bg-ctp-crust overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={`group flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-all duration-150 whitespace-nowrap relative ${
              isActive
                ? "border-ctp-blue text-ctp-text bg-white"
                : "border-transparent text-ctp-overlay0 hover:text-ctp-subtext hover:bg-ctp-surface0/30"
            }`}
          >
            {tab.isDirty && (
              <span className="w-1.5 h-1.5 rounded-full bg-ctp-peach" />
            )}
            {tab.isExecuting && (
              <span className="w-1.5 h-1.5 rounded-full bg-ctp-green animate-pulse-dot" />
            )}
            <span className="max-w-28 truncate">{tab.name}</span>
            {tabs.length > 1 && (
              <span
                role="button"
                className={`rounded p-0.5 transition-all ${
                  isActive
                    ? "opacity-40 hover:opacity-100 hover:bg-ctp-surface0"
                    : "opacity-0 group-hover:opacity-40 hover:!opacity-100 hover:bg-ctp-surface0"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
              >
                <VscClose size={12} />
              </span>
            )}
          </button>
        );
      })}
      <button
        onClick={onAdd}
        className="px-3 py-2.5 text-ctp-overlay0 hover:text-ctp-subtext transition-colors"
        title="New Query (Cmd+T)"
      >
        <VscAdd size={14} />
      </button>
    </div>
  );
}
