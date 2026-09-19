import { useState, useMemo } from "hono/jsx/dom";
import type { FC } from "hono/jsx";
import { K8S_COMPONENTS } from "~/data/k8s-components";
import type { K8sComponent } from "~/data/k8s-components";
import {
  MAIN_LAYERS,
  LEFT_SIDE,
  RIGHT_SIDES,
  ENTRY_POINT,
  COMPONENT_ICON_URLS,
} from "./diagram-layout";
import type { DiagramLayer, SideGroup } from "./diagram-layout";

// ============================================================
// ComponentIcon - アイコン画像（CDN） or Font Awesome フォールバック
// ============================================================
export function ComponentIcon({
  component,
  size = "w-7 h-7",
}: {
  component: K8sComponent;
  size?: string;
}) {
  const iconUrl = COMPONENT_ICON_URLS[component.id];
  const [failed, setFailed] = useState(false);

  if (iconUrl && !failed) {
    return (
      <img
        src={iconUrl}
        alt=""
        class={`${size} flex-shrink-0`}
        style="object-fit: contain"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      class={`${size} flex-shrink-0 inline-flex items-center justify-center`}
    >
      <i class={`fas ${component.icon}`} style={`color: ${component.color}`} />
    </span>
  );
}

// ============================================================
// DiagramNode - コンパクトなチップUI
// ============================================================
function DiagramNode({
  component,
  isSelected,
  isHighlighted,
  isDimmed,
  onSelect,
  onHoverStart,
  onHoverEnd,
}: {
  component: K8sComponent;
  isSelected: boolean;
  isHighlighted: boolean;
  isDimmed: boolean;
  onSelect: (c: K8sComponent) => void;
  onHoverStart: (id: string) => void;
  onHoverEnd: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      class="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all duration-200 cursor-pointer min-w-[140px]"
      style={`
        background: var(--bg-surface);
        border-color: ${
          isSelected
            ? component.color
            : isHighlighted
              ? component.color + "88"
              : hovered
                ? "var(--border-hover)"
                : "var(--border-default)"
        };
        box-shadow: ${
          isHighlighted || hovered
            ? `0 0 8px ${component.color}33`
            : "var(--shadow-card)"
        };
        outline: ${isSelected ? `2px solid ${component.color}44` : "none"};
        outline-offset: 1px;
        opacity: ${isDimmed ? "0.3" : "1"};
        filter: ${isDimmed ? "grayscale(0.5)" : "none"};
        transform: ${hovered && !isDimmed ? "scale(1.04)" : "scale(1)"};
      `}
      onClick={() => onSelect(component)}
      onMouseEnter={() => {
        setHovered(true);
        onHoverStart(component.id);
      }}
      onMouseLeave={() => {
        setHovered(false);
        onHoverEnd();
      }}
    >
      <ComponentIcon component={component} size="w-8 h-8" />
      <span
        class="text-xs font-medium truncate leading-tight"
        style="color: var(--text-heading)"
      >
        {component.name}
      </span>
    </button>
  );
}

// ============================================================
// FlowArrow - レイヤー間の縦矢印
// ============================================================
export const FlowArrow: FC = () => (
  <div class="flex justify-center items-center py-1">
    <div class="flex flex-col items-center" style="color: var(--text-subtle)">
      <div class="w-px h-3" style="background: var(--border-default)" />
      <i
        class="fas fa-chevron-down text-[10px]"
        style="color: var(--border-hover)"
      />
    </div>
  </div>
);

// ============================================================
// ChainArrow - チェーン内の関係矢印（横 or 縦）
// ============================================================
function ChainArrow({
  direction = "horizontal",
}: {
  direction?: "horizontal" | "vertical";
}) {
  if (direction === "vertical") {
    return (
      <div class="flex justify-center py-0.5">
        <div class="flex flex-col items-center">
          <div class="w-px h-2" style="background: var(--border-hover)" />
          <i
            class="fas fa-chevron-down text-[7px]"
            style="color: var(--border-hover)"
          />
        </div>
      </div>
    );
  }

  return (
    <div class="flex items-center px-0.5 flex-shrink-0">
      <div class="w-4 h-px" style="background: var(--border-hover)" />
      <i
        class="fas fa-chevron-right text-[8px]"
        style="color: var(--border-hover)"
      />
    </div>
  );
}

// ============================================================
// LayerBox - メインフローのレイヤーボックス（チェーン対応）
// ============================================================
function LayerBox({
  layer,
  selectedComponent,
  highlightedIds,
  hasHover,
  onSelect,
  onHoverStart,
  onHoverEnd,
}: {
  layer: DiagramLayer;
  selectedComponent: K8sComponent | null;
  highlightedIds: Set<string>;
  hasHover: boolean;
  onSelect: (c: K8sComponent) => void;
  onHoverStart: (id: string) => void;
  onHoverEnd: () => void;
}) {
  const renderNode = (compId: string) => {
    const comp = K8S_COMPONENTS.find((c) => c.id === compId);
    if (!comp) return null;
    return (
      <DiagramNode
        key={compId}
        component={comp}
        isSelected={selectedComponent?.id === compId}
        isHighlighted={hasHover && highlightedIds.has(compId)}
        isDimmed={hasHover && !highlightedIds.has(compId)}
        onSelect={onSelect}
        onHoverStart={onHoverStart}
        onHoverEnd={onHoverEnd}
      />
    );
  };

  const hasChains = layer.chains && layer.chains.length > 0;

  return (
    <div
      class="rounded-xl border p-3"
      style={`
        background: var(--bg-surface);
        border-color: ${layer.color}44;
      `}
    >
      <div class="flex items-center gap-2 mb-2">
        <div
          class="w-5 h-5 rounded flex items-center justify-center text-[10px]"
          style={`background: ${layer.color}22; color: ${layer.color}`}
        >
          <i class={`fas ${layer.icon}`} />
        </div>
        <span class="text-[11px] font-bold" style={`color: ${layer.color}`}>
          {layer.label}
        </span>
      </div>

      <div class="space-y-2">
        {hasChains ? (
          <>
            {/* チェーン（親→子の矢印付き） */}
            {layer.chains!.map((chain, ci) => (
              <div key={ci} class="flex items-center flex-wrap gap-y-1.5">
                {chain.ids.map((compId, idx) => (
                  <div key={compId} class="flex items-center">
                    {renderNode(compId)}
                    {idx < chain.ids.length - 1 && <ChainArrow />}
                  </div>
                ))}
              </div>
            ))}

            {/* 独立コンポーネント */}
            {layer.standaloneIds && layer.standaloneIds.length > 0 && (
              <div
                class="flex flex-wrap gap-1.5 pt-2"
                style="border-top: 1px dashed var(--border-default)"
              >
                {layer.standaloneIds.map((compId) => renderNode(compId))}
              </div>
            )}
          </>
        ) : (
          /* フラットグリッド（フォールバック） */
          layer.componentIds.map((row, ri) => (
            <div key={ri} class="flex flex-wrap gap-1.5">
              {row.map((compId) => renderNode(compId))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================
// SideColumn - サイドカテゴリの縦並び（チェーン対応）
// ============================================================
function SideColumn({
  groups,
  selectedComponent,
  highlightedIds,
  hasHover,
  onSelect,
  onHoverStart,
  onHoverEnd,
}: {
  groups: SideGroup[];
  selectedComponent: K8sComponent | null;
  highlightedIds: Set<string>;
  hasHover: boolean;
  onSelect: (c: K8sComponent) => void;
  onHoverStart: (id: string) => void;
  onHoverEnd: () => void;
}) {
  const renderNode = (compId: string) => {
    const comp = K8S_COMPONENTS.find((c) => c.id === compId);
    if (!comp) return null;
    return (
      <DiagramNode
        key={compId}
        component={comp}
        isSelected={selectedComponent?.id === compId}
        isHighlighted={hasHover && highlightedIds.has(compId)}
        isDimmed={hasHover && !highlightedIds.has(compId)}
        onSelect={onSelect}
        onHoverStart={onHoverStart}
        onHoverEnd={onHoverEnd}
      />
    );
  };

  return (
    <div class="space-y-2">
      {groups.map((group) => {
        const hasChains = group.chains && group.chains.length > 0;

        return (
          <div
            key={group.id}
            class="rounded-xl border p-3"
            style={`
              background: var(--bg-surface);
              border-color: ${group.color}44;
            `}
          >
            <div class="flex items-center gap-2 mb-2">
              <div
                class="w-5 h-5 rounded flex items-center justify-center text-[10px]"
                style={`background: ${group.color}22; color: ${group.color}`}
              >
                <i class={`fas ${group.icon}`} />
              </div>
              <span
                class="text-[11px] font-bold"
                style={`color: ${group.color}`}
              >
                {group.label}
              </span>
            </div>

            <div class="flex flex-col gap-1.5">
              {hasChains ? (
                <>
                  {/* チェーン（縦矢印付き） */}
                  {group.chains!.map((chain, ci) => (
                    <div key={ci} class="flex flex-col">
                      {chain.ids.map((compId, idx) => (
                        <div key={compId}>
                          {renderNode(compId)}
                          {idx < chain.ids.length - 1 && (
                            <ChainArrow direction="vertical" />
                          )}
                        </div>
                      ))}
                    </div>
                  ))}

                  {/* 独立コンポーネント */}
                  {group.standaloneIds && group.standaloneIds.length > 0 && (
                    <>
                      <div
                        class="h-px my-0.5"
                        style="background: var(--border-default)"
                      />
                      {group.standaloneIds.map((compId) => renderNode(compId))}
                    </>
                  )}
                </>
              ) : (
                /* フラットリスト（フォールバック） */
                group.componentIds.map((compId) => renderNode(compId))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// ArchitectureDiagram - メインコンテナ
// ============================================================
export function ArchitectureDiagram({
  selectedComponent,
  onSelectComponent,
}: {
  selectedComponent: K8sComponent | null;
  onSelectComponent: (c: K8sComponent) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const highlightedIds = useMemo(() => {
    if (!hoveredId) return new Set<string>();
    const comp = K8S_COMPONENTS.find((c) => c.id === hoveredId);
    if (!comp) return new Set<string>();
    return new Set<string>([hoveredId, ...comp.relatedComponents]);
  }, [hoveredId]);

  const hasHover = hoveredId !== null;

  return (
    <div class="space-y-3">
      {/* エントリーポイント */}
      <div class="flex justify-center">
        <div
          class="flex items-center gap-2 px-4 py-2 rounded-full border"
          style="background: var(--bg-surface); border-color: var(--border-default)"
        >
          <i
            class={`fas ${ENTRY_POINT.icon} text-xs`}
            style={`color: ${ENTRY_POINT.color}`}
          />
          <span class="text-xs font-medium" style="color: var(--text-muted)">
            {ENTRY_POINT.label}
          </span>
        </div>
      </div>

      <FlowArrow />

      {/* 3カラムグリッド（デスクトップ） / 1カラム（モバイル） */}
      <div class="grid grid-cols-1 lg:grid-cols-[220px_1fr_220px] gap-3">
        {/* 左: Network */}
        <div class="order-2 lg:order-1">
          <SideColumn
            groups={[LEFT_SIDE]}
            selectedComponent={selectedComponent}
            highlightedIds={highlightedIds}
            hasHover={hasHover}
            onSelect={onSelectComponent}
            onHoverStart={setHoveredId}
            onHoverEnd={() => setHoveredId(null)}
          />
        </div>

        {/* 中央: メインフロー */}
        <div class="order-1 lg:order-2">
          {MAIN_LAYERS.map((layer, idx) => (
            <div key={layer.id}>
              <LayerBox
                layer={layer}
                selectedComponent={selectedComponent}
                highlightedIds={highlightedIds}
                hasHover={hasHover}
                onSelect={onSelectComponent}
                onHoverStart={setHoveredId}
                onHoverEnd={() => setHoveredId(null)}
              />
              {idx < MAIN_LAYERS.length - 1 && <FlowArrow />}
            </div>
          ))}
        </div>

        {/* 右: Observability + Platform Tools */}
        <div class="order-3">
          <SideColumn
            groups={RIGHT_SIDES}
            selectedComponent={selectedComponent}
            highlightedIds={highlightedIds}
            hasHover={hasHover}
            onSelect={onSelectComponent}
            onHoverStart={setHoveredId}
            onHoverEnd={() => setHoveredId(null)}
          />
        </div>
      </div>
    </div>
  );
}
