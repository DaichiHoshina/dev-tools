import { useState } from "hono/jsx/dom";
import { CATEGORIES, K8S_COMPONENTS } from "~/data/k8s-components";
import type {
  Category,
  K8sComponent,
  CategoryInfo,
} from "~/data/k8s-components";
import {
  ArchitectureDiagram,
  FlowArrow,
  ComponentIcon,
} from "~/components/k8s-map/ArchitectureDiagram";

type ViewMode = "list" | "diagram";

// ============================================================
// CopyButton
// ============================================================
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      class="text-xs px-2 py-1 rounded transition-colors"
      style="color: var(--text-muted); background: var(--bg-body)"
    >
      <i class={`fas ${copied ? "fa-check" : "fa-copy"} mr-1`} />
      {copied ? "コピー済み" : "コピー"}
    </button>
  );
}

// ============================================================
// ComponentCard - 個別コンポーネントカード
// ============================================================
function ComponentCard({
  component,
  isSelected,
  onSelect,
}: {
  component: K8sComponent;
  isSelected: boolean;
  onSelect: (c: K8sComponent) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      class="rounded-xl border cursor-pointer transition-all p-3"
      style={`
        background: var(--bg-surface);
        border-color: ${isSelected ? component.color : hovered ? "var(--border-hover)" : "var(--border-default)"};
        box-shadow: ${isSelected || hovered ? "var(--shadow-card-hover)" : "var(--shadow-card)"};
        outline: ${isSelected ? `2px solid ${component.color}33` : "none"};
        outline-offset: 2px;
      `}
      onClick={() => onSelect(component)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div class="flex items-start gap-2.5">
        <div class="flex-shrink-0 mt-0.5">
          <ComponentIcon component={component} size="w-8 h-8" />
        </div>
        <div class="min-w-0 flex-1">
          <p
            class="text-xs font-semibold truncate leading-tight"
            style="color: var(--text-heading)"
          >
            {component.name}
          </p>
          <p
            class="text-[11px] mt-0.5 line-clamp-2 leading-snug"
            style="color: var(--text-muted)"
          >
            {component.description.slice(0, 50)}
            {component.description.length > 50 ? "…" : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CategoryBlock - カテゴリの折りたたみブロック
// ============================================================
function CategoryBlock({
  category,
  components,
  isExpanded,
  selectedComponent,
  onToggle,
  onSelectComponent,
}: {
  category: CategoryInfo;
  components: K8sComponent[];
  isExpanded: boolean;
  selectedComponent: K8sComponent | null;
  onToggle: () => void;
  onSelectComponent: (c: K8sComponent) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      class="rounded-xl border transition-all"
      style={`
        background: var(--bg-surface);
        border-color: ${isExpanded ? category.color + "66" : hovered ? "var(--border-hover)" : "var(--border-default)"};
        box-shadow: ${isExpanded || hovered ? "var(--shadow-card-hover)" : "var(--shadow-card)"};
      `}
    >
      {/* ヘッダー */}
      <div
        class="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={onToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          class="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm"
          style={`background: ${category.color}22; color: ${category.color}`}
        >
          <i class={`fas ${category.icon}`} />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-sm font-bold" style="color: var(--text-heading)">
              {category.label}
            </span>
            <span
              class="text-[11px] px-1.5 py-0.5 rounded-full font-medium"
              style={`background: ${category.color}22; color: ${category.color}`}
            >
              {components.length}
            </span>
          </div>
          <p class="text-[11px] mt-0.5" style="color: var(--text-muted)">
            {category.description}
          </p>
        </div>
        <i
          class={`fas fa-chevron-right text-xs transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
          style="color: var(--text-subtle)"
        />
      </div>

      {/* 展開コンテンツ */}
      {isExpanded && (
        <div
          class="px-4 pb-4"
          style={`border-top: 1px solid ${category.color}33`}
        >
          <div class="pt-3 grid grid-cols-2 gap-2">
            {components.map((comp) => (
              <ComponentCard
                key={comp.id}
                component={comp}
                isSelected={selectedComponent?.id === comp.id}
                onSelect={onSelectComponent}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// TroubleshootingAccordion - トラブルシューティングアコーディオン
// ============================================================
function TroubleshootingAccordion({
  problem,
  solution,
}: {
  problem: string;
  solution: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      class="rounded-lg border overflow-hidden"
      style="border-color: var(--border-default)"
    >
      <button
        class="w-full flex items-start gap-2 px-3 py-2 text-left transition-colors"
        style="background: var(--bg-body)"
        onClick={() => setOpen(!open)}
      >
        <i
          class={`fas fa-chevron-right text-[10px] mt-0.5 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          style="color: var(--text-subtle)"
        />
        <span class="text-xs flex-1" style="color: var(--text-body)">
          {problem}
        </span>
      </button>
      {open && (
        <div
          class="px-3 py-2 text-xs"
          style="color: var(--text-muted); background: var(--bg-surface); border-top: 1px solid var(--border-default)"
        >
          <i
            class="fas fa-lightbulb text-[10px] mr-1.5"
            style="color: #f59e0b"
          />
          {solution}
        </div>
      )}
    </div>
  );
}

// ============================================================
// DetailPanel - 右側の詳細パネル
// ============================================================
function DetailPanel({
  component,
  allComponents,
  onClose,
  onSelectComponent,
}: {
  component: K8sComponent;
  allComponents: K8sComponent[];
  onClose: () => void;
  onSelectComponent: (c: K8sComponent) => void;
}) {
  const categoryInfo = CATEGORIES.find((c) => c.id === component.category);

  const handleRelatedClick = (id: string) => {
    const related = allComponents.find((c) => c.id === id);
    if (related) onSelectComponent(related);
  };

  return (
    <div class="flex flex-col h-full" style="background: var(--bg-surface)">
      {/* ヘッダー */}
      <div
        class="flex items-start gap-3 p-4"
        style={`border-bottom: 2px solid ${component.color}44`}
      >
        <div
          class="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
          style={`background: ${component.color}11`}
        >
          <ComponentIcon component={component} size="w-8 h-8" />
        </div>
        <div class="flex-1 min-w-0">
          <h2
            class="text-sm font-bold leading-tight"
            style="color: var(--text-heading)"
          >
            {component.name}
          </h2>
          {categoryInfo && (
            <span
              class="inline-block text-[11px] px-2 py-0.5 rounded-full mt-1 font-medium"
              style={`background: ${categoryInfo.color}22; color: ${categoryInfo.color}`}
            >
              <i class={`fas ${categoryInfo.icon} mr-1 text-[10px]`} />
              {categoryInfo.label}
            </span>
          )}
        </div>
        <button
          class="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
          style="color: var(--text-subtle)"
          onClick={onClose}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "var(--bg-body)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "transparent";
          }}
        >
          <i class="fas fa-xmark text-xs" />
        </button>
      </div>

      {/* スクロール領域 */}
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 説明 */}
        <div>
          <p class="text-xs leading-relaxed" style="color: var(--text-body)">
            {component.description}
          </p>
        </div>

        {/* ポイント */}
        {component.points.length > 0 && (
          <div>
            <h3
              class="text-xs font-bold mb-2"
              style="color: var(--text-heading)"
            >
              <i
                class="fas fa-list-check mr-1.5"
                style={`color: ${component.color}`}
              />
              ポイント
            </h3>
            <ul class="space-y-1.5">
              {component.points.map((point, i) => (
                <li key={i} class="flex items-start gap-2">
                  <span
                    class="flex-shrink-0 w-1 h-1 rounded-full mt-1.5"
                    style={`background: ${component.color}`}
                  />
                  <span
                    class="text-xs leading-relaxed"
                    style="color: var(--text-muted)"
                  >
                    {point}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 関連コンポーネント */}
        {component.relatedComponents.length > 0 && (
          <div>
            <h3
              class="text-xs font-bold mb-2"
              style="color: var(--text-heading)"
            >
              <i
                class="fas fa-link mr-1.5"
                style={`color: ${component.color}`}
              />
              関連コンポーネント
            </h3>
            <div class="flex flex-wrap gap-1.5">
              {component.relatedComponents.map((relId) => {
                const rel = allComponents.find((c) => c.id === relId);
                return (
                  <button
                    key={relId}
                    class="text-[11px] px-2 py-1 rounded-full border transition-all cursor-pointer"
                    style={`
                      background: var(--bg-body);
                      border-color: var(--border-default);
                      color: var(--text-muted);
                    `}
                    onClick={() => handleRelatedClick(relId)}
                    onMouseEnter={(e) => {
                      const btn = e.currentTarget as HTMLButtonElement;
                      btn.style.borderColor =
                        rel?.color ?? "var(--border-hover)";
                      btn.style.color = rel?.color ?? "var(--text-body)";
                    }}
                    onMouseLeave={(e) => {
                      const btn = e.currentTarget as HTMLButtonElement;
                      btn.style.borderColor = "var(--border-default)";
                      btn.style.color = "var(--text-muted)";
                    }}
                  >
                    {rel ? (
                      <>
                        <i class={`fas ${rel.icon} mr-1 text-[10px]`} />
                        {rel.name}
                      </>
                    ) : (
                      relId
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* kube-lens リンク */}
        {component.kubeLensLink && (
          <div>
            <a
              href={component.kubeLensLink}
              class="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-all"
              style={`background: ${component.color}22; color: ${component.color}; font-weight: 600`}
            >
              <i class="fas fa-arrow-up-right-from-square text-[10px]" />
              このリソースを見る
            </a>
          </div>
        )}

        {/* kubectl コマンド */}
        {component.kubectlCommands.length > 0 && (
          <div>
            <h3
              class="text-xs font-bold mb-2"
              style="color: var(--text-heading)"
            >
              <i
                class="fas fa-terminal mr-1.5"
                style={`color: ${component.color}`}
              />
              kubectl コマンド
            </h3>
            <div class="space-y-2">
              {component.kubectlCommands.map((cmd, i) => (
                <div
                  key={i}
                  class="rounded-lg overflow-hidden border"
                  style="border-color: var(--border-default)"
                >
                  <div
                    class="px-3 py-1.5 text-[11px]"
                    style="background: var(--bg-body); color: var(--text-muted)"
                  >
                    {cmd.description}
                  </div>
                  <div
                    class="flex items-center gap-2 px-3 py-2"
                    style="background: var(--bg-body)"
                  >
                    <code
                      class="flex-1 text-[11px] font-mono"
                      style="color: var(--text-body)"
                    >
                      {cmd.command}
                    </code>
                    <CopyButton text={cmd.command} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* トラブルシューティング */}
        {component.troubleshooting.length > 0 && (
          <div>
            <h3
              class="text-xs font-bold mb-2"
              style="color: var(--text-heading)"
            >
              <i
                class="fas fa-screwdriver-wrench mr-1.5"
                style={`color: ${component.color}`}
              />
              トラブルシューティング
            </h3>
            <div class="space-y-1.5">
              {component.troubleshooting.map((item, i) => (
                <TroubleshootingAccordion
                  key={i}
                  problem={item.problem}
                  solution={item.solution}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// カテゴリの表示順序定義（フロー順）
// ============================================================
const FLOW_CATEGORIES: Category[] = [
  "control-plane",
  "node",
  "api-objects",
  "advanced",
];

const SIDE_CATEGORIES: Category[] = [
  "network",
  "observability",
  "platform-tools",
];

// ============================================================
// K8sMapPage - メインページ
// ============================================================
export function K8sMapPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [expandedCategories, setExpandedCategories] = useState<Set<Category>>(
    new Set(),
  );
  const [selectedComponent, setSelectedComponent] =
    useState<K8sComponent | null>(null);

  const toggleCategory = (category: Category) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleSelectComponent = (component: K8sComponent) => {
    setSelectedComponent((prev) =>
      prev?.id === component.id ? null : component,
    );
    // 選択されたコンポーネントのカテゴリを展開
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      next.add(component.category);
      return next;
    });
  };

  const handleClosePanel = () => setSelectedComponent(null);

  const getComponentsByCategory = (category: Category) =>
    K8S_COMPONENTS.filter((c) => c.category === category);

  const totalComponents = K8S_COMPONENTS.length;

  return (
    <div
      class="page-full-width flex flex-col h-full"
      style="background: var(--bg-body)"
    >
      {/* ページヘッダー */}
      <div class="page-header">
        <div>
          <h1 class="page-title">
            K8s Architecture Map
            <span
              class="text-sm font-normal ml-2"
              style="color: var(--text-muted)"
            >
              {totalComponents} コンポーネント
            </span>
          </h1>
          <p class="text-xs mt-1" style="color: var(--text-muted)">
            Kubernetesの登場人物を役割ごとに整理
          </p>
        </div>
        <div class="flex items-center gap-2 ml-auto">
          {/* ビュー切替トグル */}
          <div
            class="flex rounded-lg border overflow-hidden"
            style="border-color: var(--border-default)"
          >
            <button
              class="text-xs px-3 py-1.5 transition-colors"
              style={
                viewMode === "list"
                  ? "background: var(--bg-surface); color: var(--text-heading); font-weight: 600"
                  : "background: transparent; color: var(--text-muted)"
              }
              onClick={() => setViewMode("list")}
            >
              <i class="fas fa-list mr-1.5" />
              リスト
            </button>
            <button
              class="text-xs px-3 py-1.5 transition-colors"
              style={
                viewMode === "diagram"
                  ? "background: var(--bg-surface); color: var(--text-heading); font-weight: 600"
                  : "background: transparent; color: var(--text-muted)"
              }
              onClick={() => setViewMode("diagram")}
            >
              <i class="fas fa-diagram-project mr-1.5" />
              構成図
            </button>
          </div>
          {viewMode === "list" && (
            <button
              class="text-xs px-3 py-1.5 rounded-lg border transition-colors"
              style="border-color: var(--border-default); color: var(--text-muted); background: var(--bg-surface)"
              onClick={() => {
                const allExpanded = CATEGORIES.every((c) =>
                  expandedCategories.has(c.id),
                );
                if (allExpanded) {
                  setExpandedCategories(new Set());
                } else {
                  setExpandedCategories(new Set(CATEGORIES.map((c) => c.id)));
                }
              }}
            >
              <i
                class={`fas ${CATEGORIES.every((c) => expandedCategories.has(c.id)) ? "fa-compress" : "fa-expand"} mr-1.5`}
              />
              {CATEGORIES.every((c) => expandedCategories.has(c.id))
                ? "すべて折りたたむ"
                : "すべて展開"}
            </button>
          )}
        </div>
      </div>

      {/* メインコンテンツ */}
      <div class="flex flex-1 gap-4 p-4 overflow-hidden">
        {/* 左: メインエリア */}
        <div
          class={`flex-1 overflow-y-auto space-y-2 transition-all duration-300 ${selectedComponent ? "max-w-[calc(100%-340px)]" : ""}`}
        >
          {viewMode === "list" ? (
            <>
              {/* 凡例 */}
              <div
                class="rounded-xl border p-3 mb-3"
                style="background: var(--bg-surface); border-color: var(--border-default)"
              >
                <p
                  class="text-[11px] mb-2 font-semibold"
                  style="color: var(--text-subtle)"
                >
                  <i class="fas fa-layer-group mr-1.5" />
                  レイヤー構造
                </p>
                <div class="flex flex-wrap items-center gap-2 text-[11px]">
                  {CATEGORIES.map((cat) => (
                    <span
                      key={cat.id}
                      class="flex items-center gap-1 px-2 py-0.5 rounded-full cursor-pointer transition-all"
                      style={`background: ${cat.color}15; color: ${cat.color}`}
                      onClick={() => toggleCategory(cat.id)}
                    >
                      <i class={`fas ${cat.icon} text-[10px]`} />
                      {cat.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* フローレイヤー（Control Plane → Node → API Objects → Advanced） */}
              <div>
                <p
                  class="text-[11px] font-semibold mb-1.5 px-1"
                  style="color: var(--text-subtle)"
                >
                  <i class="fas fa-arrow-down mr-1.5" />
                  メインフロー
                </p>
                <div class="space-y-1">
                  {FLOW_CATEGORIES.map((catId, idx) => {
                    const cat = CATEGORIES.find((c) => c.id === catId);
                    if (!cat) return null;
                    const comps = getComponentsByCategory(catId);
                    return (
                      <div key={catId}>
                        <CategoryBlock
                          category={cat}
                          components={comps}
                          isExpanded={expandedCategories.has(catId)}
                          selectedComponent={selectedComponent}
                          onToggle={() => toggleCategory(catId)}
                          onSelectComponent={handleSelectComponent}
                        />
                        {idx < FLOW_CATEGORIES.length - 1 && <FlowArrow />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 区切り */}
              <div
                class="flex items-center gap-2 py-1"
                style="color: var(--text-subtle)"
              >
                <div
                  class="flex-1 h-px"
                  style="background: var(--border-default)"
                />
                <span class="text-[11px] px-2">横断的レイヤー</span>
                <div
                  class="flex-1 h-px"
                  style="background: var(--border-default)"
                />
              </div>

              {/* サイドカテゴリ（Network・Observability・Platform Tools） */}
              <div class="space-y-1.5">
                {SIDE_CATEGORIES.map((catId) => {
                  const cat = CATEGORIES.find((c) => c.id === catId);
                  if (!cat) return null;
                  const comps = getComponentsByCategory(catId);
                  return (
                    <CategoryBlock
                      key={catId}
                      category={cat}
                      components={comps}
                      isExpanded={expandedCategories.has(catId)}
                      selectedComponent={selectedComponent}
                      onToggle={() => toggleCategory(catId)}
                      onSelectComponent={handleSelectComponent}
                    />
                  );
                })}
              </div>

              {/* 下部余白 */}
              <div class="h-4" />
            </>
          ) : (
            <ArchitectureDiagram
              selectedComponent={selectedComponent}
              onSelectComponent={handleSelectComponent}
            />
          )}
        </div>

        {/* 右: 詳細パネル */}
        {selectedComponent && (
          <div
            class="flex-shrink-0 w-80 rounded-xl border overflow-hidden transition-all duration-300"
            style="border-color: var(--border-default); box-shadow: var(--shadow-card-hover)"
          >
            <DetailPanel
              component={selectedComponent}
              allComponents={K8S_COMPONENTS}
              onClose={handleClosePanel}
              onSelectComponent={handleSelectComponent}
            />
          </div>
        )}
      </div>
    </div>
  );
}
