interface Props {
  selectedNamespaces: string[];
  namespaces: string[];
  onChange: (ns: string[]) => void;
}

export function NamespaceSelector({
  selectedNamespaces,
  namespaces,
  onChange,
}: Props) {
  if (namespaces.length === 0) return null;

  const allSelected = selectedNamespaces.length === namespaces.length;

  const handleToggle = (ns: string) => {
    if (allSelected) {
      // ALL状態 → クリックしたものだけに絞る
      onChange([ns]);
    } else if (selectedNamespaces.includes(ns)) {
      // 選択済みを外す（最低1つは残す）
      if (selectedNamespaces.length > 1) {
        onChange(selectedNamespaces.filter((n) => n !== ns));
      }
    } else {
      // 未選択を追加
      const next = [...selectedNamespaces, ns];
      // 全部選んだらALL状態に戻す
      onChange(next.length === namespaces.length ? [...namespaces] : next);
    }
  };

  const handleToggleAll = () => {
    onChange(allSelected ? [namespaces[0]] : [...namespaces]);
  };

  return (
    <div class="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={handleToggleAll}
        class={`btn btn-xs rounded-full ${allSelected ? "btn-primary" : "btn-ghost"}`}
        style={!allSelected ? "border: 1px solid var(--border-default)" : ""}
      >
        ALL
      </button>
      {namespaces.map((ns) => {
        const selected = selectedNamespaces.includes(ns);
        return (
          <button
            key={ns}
            type="button"
            onClick={() => handleToggle(ns)}
            class={`btn btn-xs rounded-full ${selected ? "btn-primary" : "btn-ghost"}`}
            style={!selected ? "border: 1px solid var(--border-default)" : ""}
          >
            {ns}
          </button>
        );
      })}
    </div>
  );
}
