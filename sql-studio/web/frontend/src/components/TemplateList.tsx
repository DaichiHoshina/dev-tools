import { useState } from "react";
import {
  VscChevronDown,
  VscChevronRight,
  VscLock,
  VscTrash,
} from "react-icons/vsc";
import type { QueryTemplate } from "../types";

type Props = {
  templates: QueryTemplate[];
  search: string;
  onSelect: (template: QueryTemplate) => void;
  onDelete: (id: string) => void;
};

export default function TemplateList({
  templates,
  search,
  onSelect,
  onDelete,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.sql.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()),
  );

  const grouped = filtered.reduce<Record<string, QueryTemplate[]>>((acc, t) => {
    const key = t.category;
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  const categories = Object.keys(grouped).sort();

  if (categories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-ctp-surface2">
        <p className="text-xs">
          {templates.length === 0 ? "テンプレートはありません" : "該当なし"}
        </p>
      </div>
    );
  }

  return (
    <div className="py-1">
      {categories.map((category) => {
        const isCollapsed = collapsed[category] ?? false;
        const items = grouped[category];
        return (
          <div key={category}>
            <button
              onClick={() =>
                setCollapsed((prev) => ({
                  ...prev,
                  [category]: !isCollapsed,
                }))
              }
              className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-[11px] font-semibold text-ctp-overlay0 uppercase tracking-wider hover:text-ctp-subtext transition-colors"
            >
              {isCollapsed ? (
                <VscChevronRight size={12} />
              ) : (
                <VscChevronDown size={12} />
              )}
              {category}
              <span className="text-ctp-surface2 font-normal ml-auto">
                {items.length}
              </span>
            </button>
            {!isCollapsed && (
              <div className="space-y-0.5">
                {items.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => onSelect(t)}
                    className="flex items-start gap-2.5 px-2.5 py-2 cursor-pointer rounded-lg hover:bg-ctp-base group transition-colors mx-1"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-ctp-text truncate">
                          {t.name}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {t.isBuiltin ? (
                            <VscLock
                              size={11}
                              className="text-ctp-surface2"
                              title="ビルトインテンプレート"
                            />
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(t.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 text-ctp-overlay0 hover:text-ctp-red transition-all"
                            >
                              <VscTrash size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-[11px] text-ctp-overlay0 mt-0.5 leading-tight">
                        {t.description}
                      </div>
                      <div className="text-[11px] text-ctp-surface2 truncate font-mono mt-0.5 leading-tight">
                        {t.sql.split("\n")[0].slice(0, 50)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
