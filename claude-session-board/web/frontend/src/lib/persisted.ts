/**
 * sessionStorage.ts
 * localStorage のヘルパー関数・定数・型をまとめたモジュール
 * ActiveSessionsPage から利用される
 */

import type { ActiveSession } from "./types";

// ===== 汎用ヘルパー（内部用） =====

function readLS<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// ===== キー定数 =====

export const LABELS_KEY = "session-labels";
export const STATUSES_KEY = "session-statuses";
export const COLORS_KEY = "session-colors";
export const SESSION_CACHE_KEY = "session-active-cache";
export const ORDER_KEY = "session-card-order";
export const CANVAS_POSITIONS_KEY = "session-canvas-positions";
export const CANVAS_SIZES_KEY = "session-canvas-sizes";
export const VIEW_MODE_KEY = "session-view-mode";
export const GRID_COLS_KEY = "session-grid-cols";
export const ENDED_SESSIONS_KEY = "session-ended-sessions";

// ===== 型エクスポート =====

export type SessionStatus = "pending" | "doing" | "done";
export type ViewMode = "grid" | "canvas";
export type GridCols = 1 | 2 | 3 | 4;
export type EndedSession = ActiveSession & { endedAt: string };

// ===== CARD_COLORS =====

export const CARD_COLORS = [
  {
    value: "",
    label: "デフォルト",
    bg: "bg-base-200",
    border: "border-base-300/50",
    hover: "hover:border-base-content/15",
  },
  {
    value: "blue",
    label: "ブルー",
    bg: "bg-blue-950/40",
    border: "border-blue-500/10",
    hover: "hover:border-blue-500/25",
  },
  {
    value: "orange",
    label: "オレンジ",
    bg: "bg-orange-950/40",
    border: "border-orange-500/10",
    hover: "hover:border-orange-500/25",
  },
  {
    value: "green",
    label: "グリーン",
    bg: "bg-emerald-950/40",
    border: "border-emerald-500/10",
    hover: "hover:border-emerald-500/25",
  },
  {
    value: "purple",
    label: "パープル",
    bg: "bg-violet-950/40",
    border: "border-violet-500/10",
    hover: "hover:border-violet-500/25",
  },
  {
    value: "red",
    label: "レッド",
    bg: "bg-red-950/40",
    border: "border-red-500/10",
    hover: "hover:border-red-500/25",
  },
  {
    value: "yellow",
    label: "イエロー",
    bg: "bg-yellow-950/40",
    border: "border-yellow-500/10",
    hover: "hover:border-yellow-500/25",
  },
  {
    value: "pink",
    label: "ピンク",
    bg: "bg-pink-950/40",
    border: "border-pink-500/10",
    hover: "hover:border-pink-500/25",
  },
  {
    value: "cyan",
    label: "シアン",
    bg: "bg-cyan-950/40",
    border: "border-cyan-500/10",
    hover: "hover:border-cyan-500/25",
  },
  {
    value: "indigo",
    label: "インディゴ",
    bg: "bg-indigo-950/40",
    border: "border-indigo-500/10",
    hover: "hover:border-indigo-500/25",
  },
  {
    value: "lime",
    label: "ライム",
    bg: "bg-lime-950/40",
    border: "border-lime-500/10",
    hover: "hover:border-lime-500/25",
  },
  {
    value: "amber",
    label: "アンバー",
    bg: "bg-amber-950/40",
    border: "border-amber-500/10",
    hover: "hover:border-amber-500/25",
  },
] as const;

export type CardColorValue = (typeof CARD_COLORS)[number]["value"];

// ===== COLOR_SWATCHES =====

export const COLOR_SWATCHES: Record<string, string> = {
  "": "bg-zinc-600",
  blue: "bg-blue-400",
  orange: "bg-orange-400",
  green: "bg-emerald-400",
  purple: "bg-violet-400",
  red: "bg-red-400",
  yellow: "bg-yellow-400",
  pink: "bg-pink-400",
  cyan: "bg-cyan-400",
  indigo: "bg-indigo-400",
  lime: "bg-lime-400",
  amber: "bg-amber-400",
};

// ===== Session Labels =====

export function getLabels(): Record<string, string> {
  return readLS<Record<string, string>>(LABELS_KEY, {});
}

export function setLabel(pid: number, label: string): void {
  const labels = getLabels();
  if (label) {
    labels[String(pid)] = label;
  } else {
    delete labels[String(pid)];
  }
  writeLS(LABELS_KEY, labels);
}

export function getLabel(pid: number): string {
  return getLabels()[String(pid)] ?? "";
}

// ===== Session Status =====

export const STATUS_OPTIONS: { value: SessionStatus | ""; label: string }[] = [
  { value: "", label: "-" },
  { value: "pending", label: "Pending" },
  { value: "doing", label: "Doing" },
  { value: "done", label: "Done" },
];

export const STATUS_BADGE: Record<SessionStatus, string> = {
  pending: "badge-warning",
  doing: "badge-info",
  done: "badge-success",
};

export function getStatuses(): Record<string, SessionStatus> {
  return readLS<Record<string, SessionStatus>>(STATUSES_KEY, {});
}

export function setStatus(pid: number, status: SessionStatus | ""): void {
  const statuses = getStatuses();
  if (status) {
    statuses[String(pid)] = status;
  } else {
    delete statuses[String(pid)];
  }
  writeLS(STATUSES_KEY, statuses);
}

export function getStatus(pid: number): SessionStatus | "" {
  return getStatuses()[String(pid)] ?? "";
}

// ===== Card Color =====

export function getColors(): Record<string, CardColorValue> {
  return readLS<Record<string, CardColorValue>>(COLORS_KEY, {});
}

export function setColor(pid: number, color: CardColorValue): void {
  const colors = getColors();
  if (color) {
    colors[String(pid)] = color;
  } else {
    delete colors[String(pid)];
  }
  writeLS(COLORS_KEY, colors);
}

// ===== Directory Default Color =====

const DIR_COLOR_PALETTE = CARD_COLORS.filter((c) => c.value !== "");

export function getDirDefaultColor(dirName: string | null): CardColorValue {
  if (!dirName) return "";
  let hash = 0;
  for (let i = 0; i < dirName.length; i++) {
    hash = (hash * 31 + dirName.charCodeAt(i)) >>> 0;
  }
  return DIR_COLOR_PALETTE[hash % DIR_COLOR_PALETTE.length].value;
}

export function getSessionColor(
  pid: number,
  projectDirName: string | null,
): CardColorValue {
  const manual = getColors()[String(pid)] as CardColorValue | undefined;
  if (manual !== undefined) return manual;
  return getDirDefaultColor(projectDirName);
}

// ===== Session Cache =====

export function loadSessionCache(): {
  sessions: ActiveSession[];
  savedAt: string;
} | null {
  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { sessions: ActiveSession[]; savedAt: string };
  } catch {
    return null;
  }
}

export function saveSessionCache(sessions: ActiveSession[]): void {
  writeLS(SESSION_CACHE_KEY, { sessions, savedAt: new Date().toISOString() });
}

// ===== Card Order =====

export function getSavedOrder(): number[] {
  return readLS<number[]>(ORDER_KEY, []);
}

export function saveOrder(pids: number[]): void {
  writeLS(ORDER_KEY, pids);
}

// ===== Cleanup =====

export function cleanupStalePids(activePids: Set<number>): void {
  const endedPids = new Set(loadEndedSessions().map((s) => s.pid));
  const keepPids = new Set([...activePids, ...endedPids]);
  for (const [key, store] of [
    [LABELS_KEY, getLabels()] as const,
    [STATUSES_KEY, getStatuses()] as const,
    [COLORS_KEY, getColors()] as const,
  ]) {
    const data = store as Record<string, unknown>;
    let changed = false;
    for (const k of Object.keys(data)) {
      if (!keepPids.has(Number(k))) {
        delete data[k];
        changed = true;
      }
    }
    if (changed) writeLS(key, data);
  }
}

export function applyOrder(sessions: ActiveSession[]): ActiveSession[] {
  const saved = getSavedOrder();
  const pidSet = new Set(sessions.map((s) => s.pid));
  const sessionMap = new Map(sessions.map((s) => [s.pid, s]));

  const ordered: ActiveSession[] = [];
  for (const pid of saved) {
    const s = sessionMap.get(pid);
    if (s) {
      ordered.push(s);
      sessionMap.delete(pid);
    }
  }
  for (const s of sessionMap.values()) {
    ordered.push(s);
  }
  const currentOrder = ordered.map((s) => s.pid);
  const savedStr = JSON.stringify(saved.filter((p) => pidSet.has(p)));
  if (JSON.stringify(currentOrder) !== savedStr) {
    saveOrder(currentOrder);
  }
  cleanupStalePids(pidSet);
  return ordered;
}

// ===== Canvas Positions =====

export type CardPosition = { x: number; y: number };

export function getPositions(): Record<string, CardPosition> {
  return readLS<Record<string, CardPosition>>(CANVAS_POSITIONS_KEY, {});
}

export function savePosition(pid: number, pos: CardPosition): void {
  const positions = getPositions();
  positions[String(pid)] = pos;
  writeLS(CANVAS_POSITIONS_KEY, positions);
}

export function getInitialPosition(pid: number, index: number): CardPosition {
  const saved = getPositions()[String(pid)];
  if (saved) return saved;
  const col = index % 3;
  const row = Math.floor(index / 3);
  return { x: col * 340 + 20, y: row * 290 + 20 };
}

// ===== Canvas Sizes =====

export type CardSize = { width: number; height: number };

export const CARD_MIN_WIDTH = 200;
export const CARD_MIN_HEIGHT = 140;
export const CARD_DEFAULT_WIDTH = 320;

export function getSizes(): Record<string, CardSize> {
  return readLS<Record<string, CardSize>>(CANVAS_SIZES_KEY, {});
}

export function saveSize(pid: number, size: CardSize): void {
  const sizes = getSizes();
  sizes[String(pid)] = size;
  writeLS(CANVAS_SIZES_KEY, sizes);
}

export function getInitialSize(pid: number): CardSize {
  const saved = getSizes()[String(pid)];
  return saved ?? { width: CARD_DEFAULT_WIDTH, height: 0 };
}

// ===== View Mode =====

export function getViewMode(): ViewMode {
  const v = localStorage.getItem(VIEW_MODE_KEY);
  return v === "grid" || v === "canvas" ? v : "grid";
}

export function persistViewMode(mode: ViewMode): void {
  localStorage.setItem(VIEW_MODE_KEY, mode);
}

// ===== Grid Columns =====

export const GRID_CLASS: Record<GridCols, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 md:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
  4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
};

export function getGridCols(): GridCols {
  try {
    const v = Number(localStorage.getItem(GRID_COLS_KEY));
    return v >= 1 && v <= 4 ? (v as GridCols) : 3;
  } catch {
    return 3;
  }
}

export function persistGridCols(cols: GridCols): void {
  localStorage.setItem(GRID_COLS_KEY, String(cols));
}

// ===== Ended Sessions (W-PERM-1: 30日 TTL 付き) =====

const ENDED_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function loadEndedSessions(): EndedSession[] {
  try {
    const raw = localStorage.getItem(ENDED_SESSIONS_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as EndedSession[];
    const now = Date.now();
    // 30日以内のものだけ残す
    const filtered = all.filter((s) => {
      const age = now - new Date(s.endedAt).getTime();
      return age <= ENDED_TTL_MS;
    });
    // 除去があった場合はストレージを更新
    if (filtered.length !== all.length) {
      writeLS(ENDED_SESSIONS_KEY, filtered);
    }
    return filtered;
  } catch {
    return [];
  }
}

export function persistEndedSessions(sessions: EndedSession[]): void {
  writeLS(ENDED_SESSIONS_KEY, sessions);
}

export function dismissEndedSession(pid: number): EndedSession[] {
  const updated = loadEndedSessions().filter((s) => s.pid !== pid);
  persistEndedSessions(updated);
  return updated;
}
