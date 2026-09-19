import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { useNavigate } from "react-router-dom";

import {
  RefreshCw,
  BedDouble,
  Terminal,
  FileText,
  X,
  Plus,
  ExternalLink,
  GitMerge,
  CircleDot,
  Globe,
  LayoutGrid,
  Move,
  Monitor,
  Play,
  AlertTriangle,
} from "lucide-react";
import { api } from "../lib/api";
import { formatDate } from "../lib/utils";
import type { ActiveSession, ProjectInfo } from "../lib/types";
import {
  CARD_COLORS,
  COLOR_SWATCHES,
  STATUS_OPTIONS,
  STATUS_BADGE,
  GRID_CLASS,
  CARD_MIN_WIDTH,
  CARD_MIN_HEIGHT,
  CARD_DEFAULT_WIDTH,
  getLabel,
  setLabel,
  getStatus,
  setStatus,
  setColor,
  getSessionColor,
  getDirDefaultColor,
  loadSessionCache,
  saveSessionCache,
  saveOrder,
  applyOrder,
  getInitialPosition,
  savePosition,
  saveSize,
  getInitialSize,
  getViewMode,
  persistViewMode,
  getGridCols,
  persistGridCols,
  loadEndedSessions,
  persistEndedSessions,
  dismissEndedSession,
  type SessionStatus,
  type ViewMode,
  type GridCols,
  type EndedSession,
  type CardColorValue,
  type CardPosition,
  type CardSize,
} from "../lib/persisted";

// ===== Components =====

function ColorDot({
  pid,
  projectDirName,
  onChange,
}: {
  pid: number;
  projectDirName: string | null;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const current = getSessionColor(pid, projectDirName);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        className={`w-3 h-3 rounded-full ${COLOR_SWATCHES[current] || COLOR_SWATCHES[""]} transition-transform hover:scale-125`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title="カードの色を変更"
      />
      {open && (
        <div
          className="absolute left-0 top-5 z-10 bg-base-100 border border-base-300 rounded-lg shadow-lg p-2 flex flex-wrap gap-1.5 max-w-[180px]"
          onClick={(e) => e.stopPropagation()}
        >
          {CARD_COLORS.map((c) => (
            <button
              key={c.value}
              className={`w-5 h-5 rounded-full ${COLOR_SWATCHES[c.value]} transition-transform hover:scale-110 ${current === c.value ? "ring-2 ring-offset-1 ring-base-content" : ""}`}
              title={c.label}
              onClick={() => {
                setColor(pid, c.value);
                setOpen(false);
                onChange();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionName({
  pid,
  fallback,
  onChange,
}: {
  pid: number;
  fallback: string;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(() => getLabel(pid));
  const inputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = () => {
    const trimmed = value.trim();
    setValue(trimmed);
    setLabel(pid, trimmed);
    setEditing(false);
    onChange();
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="input input-xs input-bordered font-bold w-full"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onCompositionStart={() => (composingRef.current = true)}
        onCompositionEnd={() => (composingRef.current = false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !composingRef.current) save();
          if (e.key === "Escape") {
            setValue(getLabel(pid));
            setEditing(false);
          }
        }}
        placeholder={fallback}
        maxLength={40}
      />
    );
  }

  const label = getLabel(pid);
  return (
    <span
      className="font-bold text-sm truncate flex-1 cursor-pointer hover:text-primary transition-colors"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      title="クリックで名前を編集"
    >
      {label || fallback}
    </span>
  );
}

const STATUS_CYCLE: (SessionStatus | "")[] = ["", "pending", "doing", "done"];

function StatusBadge({ pid, onChange }: { pid: number; onChange: () => void }) {
  const current = getStatus(pid);

  const cycle = () => {
    const idx = STATUS_CYCLE.indexOf(current);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    setStatus(pid, next);
    onChange();
  };

  if (!current) {
    return (
      <button
        className="badge badge-sm badge-ghost text-base-content/30 cursor-pointer hover:bg-base-200 transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          cycle();
        }}
        title="ステータスを設定"
      >
        -
      </button>
    );
  }

  return (
    <button
      className={`badge badge-sm ${STATUS_BADGE[current]} cursor-pointer hover:opacity-80 transition-opacity`}
      onClick={(e) => {
        e.stopPropagation();
        cycle();
      }}
      title="クリックでステータス変更"
    >
      {STATUS_OPTIONS.find((o) => o.value === current)?.label}
    </button>
  );
}

function MessagePreview({
  messages,
  lineClamp = 3,
}: {
  messages: ActiveSession["recentMessages"];
  lineClamp?: number;
}) {
  if (messages.length === 0) {
    return (
      <div className="text-xs text-base-content/40 italic py-2">
        メッセージなし
      </div>
    );
  }

  const clampStyle: React.CSSProperties =
    lineClamp > 0
      ? {
          display: "-webkit-box",
          WebkitLineClamp: lineClamp,
          WebkitBoxOrient: "vertical" as const,
          overflow: "hidden",
        }
      : {};

  // 最新の会話が常に見えるよう逆順表示
  const reversed = [...messages].reverse();

  return (
    <div className="space-y-2 mt-2">
      {reversed.map((m, i) => (
        <div key={i} className="flex gap-2 text-xs leading-relaxed">
          <span
            className={`shrink-0 font-semibold text-[11px] ${
              m.type === "user" ? "text-info" : "text-success"
            }`}
          >
            {m.type === "user" ? "U" : "A"}
          </span>
          <div
            className="text-base-content/60 break-all whitespace-pre-wrap"
            style={clampStyle}
          >
            {m.text}
          </div>
        </div>
      ))}
    </div>
  );
}

/** URLからリンクのラベルとアイコンを判定 */
function classifyLink(url: string): {
  label: string;
  icon: "mr" | "issue" | "web";
} {
  if (/merge_requests\/\d+/.test(url)) {
    const match = url.match(/\/([^/]+)\/-\/merge_requests\/(\d+)/);
    return {
      label: match ? `${match[1]} !${match[2]}` : "MR",
      icon: "mr",
    };
  }
  if (/issues\/\d+/.test(url)) {
    const match = url.match(/\/([^/]+)\/-\/issues\/(\d+)/);
    return {
      label: match ? `${match[1]} #${match[2]}` : "Issue",
      icon: "issue",
    };
  }
  // その他のURL: ホスト名だけ表示
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return { label: host, icon: "web" };
  } catch {
    return { label: "Link", icon: "web" };
  }
}

function JiraTicketPins({
  tickets,
}: {
  tickets: { key: string; url: string }[];
}) {
  if (tickets.length === 0) return null;
  const display = tickets.slice(0, 5);
  return (
    <div className="flex flex-wrap gap-1.5 mb-1.5">
      {display.map((t) => (
        <a
          key={t.key}
          href={t.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-md transition-colors font-mono font-semibold"
          onClick={(e) => e.stopPropagation()}
          title={t.url}
        >
          <span>{t.key}</span>
          <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-50" />
        </a>
      ))}
      {tickets.length > 5 && (
        <span className="text-[10px] text-base-content/30 self-center">
          +{tickets.length - 5}
        </span>
      )}
    </div>
  );
}

function LinkPins({ links }: { links: string[] }) {
  if (links.length === 0) return null;

  // 重要なリンク（GitLab MR/Issue, Jira）を優先表示
  const sorted = [...links].sort((a, b) => {
    const aImportant = /merge_requests|issues|atlassian/.test(a) ? 0 : 1;
    const bImportant = /merge_requests|issues|atlassian/.test(b) ? 0 : 1;
    return aImportant - bImportant;
  });

  // 最大5件まで表示
  const display = sorted.slice(0, 5);

  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {display.map((url) => {
        const { label, icon } = classifyLink(url);
        return (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] bg-base-200/70 hover:bg-base-300 text-base-content/60 hover:text-base-content px-2 py-0.5 rounded-md transition-colors max-w-[180px]"
            onClick={(e) => e.stopPropagation()}
            title={url}
          >
            {icon === "mr" ? (
              <GitMerge className="w-3 h-3 shrink-0 text-violet-500" />
            ) : icon === "issue" ? (
              <CircleDot className="w-3 h-3 shrink-0 text-emerald-500" />
            ) : (
              <Globe className="w-3 h-3 shrink-0 text-blue-400" />
            )}
            <span className="truncate">{label}</span>
            <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-50" />
          </a>
        );
      })}
      {sorted.length > 5 && (
        <span className="text-[10px] text-base-content/30 self-center">
          +{sorted.length - 5}
        </span>
      )}
    </div>
  );
}

function LaunchModal({
  projects,
  onClose,
}: {
  projects: ProjectInfo[];
  onClose: () => void;
}) {
  const [selectedPath, setSelectedPath] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const filterRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
  }, [projects]);

  const filteredProjects = useMemo(() => {
    if (!projectFilter.trim()) return sortedProjects;
    const q = projectFilter.trim().toLowerCase();
    return sortedProjects.filter(
      (p) =>
        p.displayName.toLowerCase().includes(q) ||
        p.projectPath.toLowerCase().includes(q),
    );
  }, [sortedProjects, projectFilter]);

  const selectedProject = projects.find((p) => p.projectPath === selectedPath);
  const [prompt, setPrompt] = useState("");
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const composingRef = useRef(false);

  const handleLaunch = async () => {
    if (!selectedPath) return;
    setLaunching(true);
    setLaunchError(null);
    try {
      const res = await api.launchSession(selectedPath, prompt || undefined);
      if (res.error) {
        setLaunchError(res.error);
      } else {
        onClose();
      }
    } catch (e) {
      setLaunchError(e instanceof Error ? e.message : "起動に失敗しました");
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-base-100 rounded-xl border border-base-300 shadow-xl p-5 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">新規セッションを起動</h3>
          <button className="btn btn-xs btn-ghost" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div ref={dropdownRef} className="relative">
            <label className="text-xs text-base-content/60 mb-1 block">
              プロジェクト
            </label>
            <input
              ref={filterRef}
              type="text"
              className="input input-sm input-bordered w-full"
              placeholder={
                selectedProject
                  ? selectedProject.displayName
                  : "プロジェクト名で検索..."
              }
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.target.value);
                setDropdownOpen(true);
              }}
              onFocus={() => setDropdownOpen(true)}
              onBlur={(e) => {
                if (!dropdownRef.current?.contains(e.relatedTarget)) {
                  setTimeout(() => setDropdownOpen(false), 150);
                }
              }}
            />
            {selectedProject && !projectFilter && (
              <div className="absolute left-3 top-[calc(50%+2px)] text-sm text-base-content pointer-events-none">
                {selectedProject.displayName}
              </div>
            )}
            {dropdownOpen && (
              <div className="absolute z-10 mt-1 w-full max-h-48 overflow-auto bg-base-200 border border-base-300 rounded-lg shadow-lg">
                {filteredProjects.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-base-content/40">
                    該当なし
                  </div>
                ) : (
                  filteredProjects.map((p) => (
                    <button
                      key={p.dirName}
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-base-300 transition-colors ${
                        selectedPath === p.projectPath
                          ? "bg-primary/10 text-primary"
                          : ""
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSelectedPath(p.projectPath);
                        setProjectFilter("");
                        setDropdownOpen(false);
                      }}
                    >
                      <div className="truncate">{p.displayName}</div>
                      <div className="text-[10px] text-base-content/30 truncate font-mono">
                        {p.projectPath}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-base-content/60 mb-1 block">
              初期プロンプト（任意）
            </label>
            <input
              type="text"
              className="input input-sm input-bordered w-full"
              placeholder="例: バグを修正して"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onCompositionStart={() => (composingRef.current = true)}
              onCompositionEnd={() => (composingRef.current = false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !composingRef.current) handleLaunch();
              }}
              maxLength={500}
            />
          </div>

          {launchError && (
            <div className="text-xs text-error">{launchError}</div>
          )}

          <button
            className="btn btn-sm btn-primary w-full"
            onClick={handleLaunch}
            disabled={!selectedPath || launching}
          >
            {launching ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <>
                <Terminal className="w-4 h-4" />
                iTerm2 で起動
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== CardBody (グリッド・キャンバス共通の中身) =====

function CardBody({
  session,
  onFocus,
  onLabelChange,
  cardSize,
  gridCols,
  isEnded = false,
  onDismiss,
  onResume,
  endedAt,
}: {
  session: ActiveSession;
  onFocus: (tty: string) => void;
  onLabelChange: () => void;
  cardSize?: CardSize;
  gridCols?: GridCols;
  isEnded?: boolean;
  onDismiss?: () => void;
  onResume?: () => void;
  endedAt?: string;
}) {
  const navigate = useNavigate();
  const shortProject = session.projectDisplayName
    ? session.projectDisplayName.split("/").slice(-2).join("/")
    : "unknown";
  // title(API未設定時は空) → key → プロジェクト名 の順でフォールバック
  const firstTicket = session.jiraTickets?.[0];
  const defaultName = firstTicket?.title || firstTicket?.key || shortProject;

  // サイズに応じた表示レベル（canvasのcardSize or gridのgridCols）
  const w = cardSize?.width ?? CARD_DEFAULT_WIDTH;
  const h = cardSize?.height ?? 0;
  const isCompact = w < 280 || (gridCols ?? 0) >= 4;

  const isWide = w > 440 || gridCols === 1;
  const isShort = h > 0 && h < 200;

  const lineClamp = isShort ? 1 : isCompact ? 2 : isWide ? 0 : 3;

  const handleDetailClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (session.sessionId && session.projectDirName) {
      const params = new URLSearchParams({
        project: session.projectDirName,
      });
      if (session.cwd) params.set("cwd", session.cwd);
      navigate(`/sessions/${session.sessionId}?${params.toString()}`);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header: ColorDot + Name (+ 終了badge when ended) */}
      <div className="flex items-center gap-2 mb-2 shrink-0">
        <ColorDot
          pid={session.pid}
          projectDirName={session.projectDirName}
          onChange={onLabelChange}
        />
        <SessionName
          pid={session.pid}
          fallback={defaultName}
          onChange={onLabelChange}
        />
        {isEnded && (
          <span className="badge badge-sm badge-ghost text-base-content/30 shrink-0">
            終了
          </span>
        )}
      </div>

      {/* Meta: project path + status badge (or ended time) */}
      {!isShort && (
        <div className="flex items-center gap-2 text-xs text-base-content/40 mb-2 shrink-0">
          <span className="font-mono truncate">{shortProject}</span>
          {isEnded ? (
            endedAt && <span className="shrink-0">{formatDate(endedAt)}</span>
          ) : (
            <StatusBadge pid={session.pid} onChange={onLabelChange} />
          )}
        </div>
      )}

      {/* Jira Tickets */}
      {!isShort && <JiraTicketPins tickets={session.jiraTickets ?? []} />}

      {/* Links */}
      {!isShort && !isCompact && <LinkPins links={session.links ?? []} />}

      {/* Messages */}
      {!isShort && (
        <div
          className={`pt-1 min-h-0 overflow-hidden flex-1${isEnded ? " opacity-50" : ""}`}
        >
          <MessagePreview
            messages={session.recentMessages}
            lineClamp={lineClamp}
          />
        </div>
      )}

      {/* Actions */}
      <div
        className={`flex items-center gap-1 shrink-0 mt-auto ${isShort ? "pt-1" : "pt-2"}`}
      >
        {isEnded ? (
          <>
            {session.sessionId && session.cwd && (
              <button
                className="btn btn-xs btn-ghost btn-square text-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  onResume?.();
                }}
                title="セッションを再開"
                aria-label="セッションを再開"
              >
                <Play className="w-3.5 h-3.5" />
              </button>
            )}
            {session.sessionId && (
              <button
                className="btn btn-xs btn-ghost btn-square"
                onClick={handleDetailClick}
                title="セッション詳細"
                aria-label="セッション詳細"
              >
                <FileText className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              className="btn btn-xs btn-ghost btn-square text-base-content/30 hover:text-error"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss?.();
              }}
              title="削除"
              aria-label="カードを削除"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
            <button
              className="btn btn-xs btn-ghost btn-square text-success"
              onClick={() => onFocus(session.tty)}
              title="iTerm に切り替え"
              aria-label="iTermに切り替え"
            >
              <Terminal className="w-3.5 h-3.5" />
            </button>
            {session.sessionId && (
              <button
                className="btn btn-xs btn-ghost btn-square"
                onClick={(e) => {
                  e.stopPropagation();
                  const params = new URLSearchParams();
                  if (session.cwd) params.set("cwd", session.cwd);
                  if (session.sessionId)
                    params.set("resume", session.sessionId);
                  navigate(`/terminal?${params.toString()}`);
                }}
                title="Web Terminal"
                aria-label="Web Terminalで開く"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
            )}
            {session.sessionId && (
              <button
                className="btn btn-xs btn-ghost btn-square"
                onClick={handleDetailClick}
                title="詳細"
                aria-label="セッション詳細"
              >
                <FileText className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ===== ActiveCard (グリッドモード) =====

const ActiveCard = memo(function ActiveCard({
  session,
  onFocus,
  onLabelChange,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver,
  gridCols,
  isEnded = false,
  onDismiss,
  onResume,
  endedAt,
}: {
  session: ActiveSession;
  onFocus: (tty: string) => void;
  onLabelChange: () => void;
  onDragStart: (pid: number) => void;
  onDragOver: (e: React.DragEvent, pid: number) => void;
  onDrop: (pid: number) => void;
  isDragOver: boolean;
  gridCols: GridCols;
  isEnded?: boolean;
  onDismiss?: () => void;
  onResume?: () => void;
  endedAt?: string;
}) {
  const colorConfig =
    CARD_COLORS.find(
      (c) => c.value === getSessionColor(session.pid, session.projectDirName),
    ) ?? CARD_COLORS[0];

  return (
    <div
      className={`${colorConfig.bg} rounded-xl border transition-all hover:shadow-md ${
        gridCols >= 4 ? "p-3" : "p-5"
      } cursor-grab active:cursor-grabbing${isEnded ? " opacity-60" : ""} ${
        isDragOver
          ? "border-primary border-dashed scale-[1.02]"
          : `${colorConfig.border} ${colorConfig.hover}`
      }`}
      draggable
      onDragStart={() => onDragStart(session.pid)}
      onDragOver={(e) => onDragOver(e, session.pid)}
      onDrop={() => onDrop(session.pid)}
      onDragEnd={() => onDrop(-1)}
    >
      <CardBody
        session={session}
        onFocus={onFocus}
        onLabelChange={onLabelChange}
        gridCols={gridCols}
        isEnded={isEnded}
        onDismiss={onDismiss}
        onResume={onResume}
        endedAt={endedAt}
      />
    </div>
  );
});

// ===== CanvasCard (キャンバスモード) =====

const CanvasCard = memo(function CanvasCard({
  session,
  index,
  onFocus,
  onLabelChange,
  isEnded = false,
  onDismiss,
  onResume,
  endedAt,
}: {
  session: ActiveSession;
  index: number;
  onFocus: (tty: string) => void;
  onLabelChange: () => void;
  isEnded?: boolean;
  onDismiss?: () => void;
  onResume?: () => void;
  endedAt?: string;
}) {
  const [pos, setPos] = useState<CardPosition>(() =>
    getInitialPosition(session.pid, index),
  );
  const [size, setSize] = useState<CardSize>(() => getInitialSize(session.pid));
  const dragRef = useRef({
    active: false,
    startMouse: { x: 0, y: 0 },
    startCard: { x: 0, y: 0 },
  });
  const resizeRef = useRef({
    active: false,
    startMouse: { x: 0, y: 0 },
    startSize: { width: 0, height: 0 },
  });
  const cleanupRef = useRef<(() => void) | null>(null);

  // アンマウント時にリスナーをクリーンアップ
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      document.body.style.cursor = "";
    };
  }, []);

  const colorConfig =
    CARD_COLORS.find(
      (c) => c.value === getSessionColor(session.pid, session.projectDirName),
    ) ?? CARD_COLORS[0];

  const attachListeners = (
    onMove: (ev: MouseEvent) => void,
    onUp: (ev: MouseEvent) => void,
    cursor: string,
  ) => {
    document.body.style.cursor = cursor;
    const cleanup = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      cleanupRef.current = null;
    };
    cleanupRef.current = cleanup;
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // ===== ドラッグ移動 =====

  const calcPos = (ev: MouseEvent): CardPosition => ({
    x: Math.max(
      0,
      dragRef.current.startCard.x + ev.clientX - dragRef.current.startMouse.x,
    ),
    y: Math.max(
      0,
      dragRef.current.startCard.y + ev.clientY - dragRef.current.startMouse.y,
    ),
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input, select, a")) return;
    e.preventDefault();
    dragRef.current = {
      active: true,
      startMouse: { x: e.clientX, y: e.clientY },
      startCard: { ...pos },
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current.active) return;
      setPos(calcPos(ev));
    };
    const onMouseUp = (ev: MouseEvent) => {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;
      savePosition(session.pid, calcPos(ev));
      cleanupRef.current?.();
    };

    attachListeners(onMouseMove, onMouseUp, "grabbing");
  };

  // ===== リサイズ =====

  const calcSize = (ev: MouseEvent): CardSize => ({
    width: Math.max(
      CARD_MIN_WIDTH,
      resizeRef.current.startSize.width +
        ev.clientX -
        resizeRef.current.startMouse.x,
    ),
    height: Math.max(
      CARD_MIN_HEIGHT,
      resizeRef.current.startSize.height +
        ev.clientY -
        resizeRef.current.startMouse.y,
    ),
  });

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      active: true,
      startMouse: { x: e.clientX, y: e.clientY },
      startSize: { ...size },
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current.active) return;
      setSize(calcSize(ev));
    };
    const onMouseUp = (ev: MouseEvent) => {
      if (!resizeRef.current.active) return;
      resizeRef.current.active = false;
      saveSize(session.pid, calcSize(ev));
      cleanupRef.current?.();
    };

    attachListeners(onMouseMove, onMouseUp, "nwse-resize");
  };

  const cardStyle: React.CSSProperties = {
    left: pos.x,
    top: pos.y,
    width: size.width,
    cursor: "grab",
    ...(size.height > 0 ? { height: size.height } : {}),
  };

  return (
    <div
      className={`absolute ${colorConfig.bg} rounded-xl border ${colorConfig.border} shadow-sm hover:shadow-md transition-shadow p-5 select-none overflow-hidden${isEnded ? " opacity-60" : ""}`}
      style={cardStyle}
      onMouseDown={handleMouseDown}
    >
      <div
        className={size.height > 0 ? "overflow-y-auto" : ""}
        style={size.height > 0 ? { height: "calc(100% - 8px)" } : {}}
      >
        <CardBody
          session={session}
          onFocus={onFocus}
          onLabelChange={onLabelChange}
          cardSize={size}
          isEnded={isEnded}
          onDismiss={onDismiss}
          onResume={onResume}
          endedAt={endedAt}
        />
      </div>

      {/* リサイズハンドル（右下角） */}
      <div
        className="absolute bottom-0 right-0 w-5 h-5 flex items-end justify-end pb-0.5 pr-0.5 opacity-25 hover:opacity-70 transition-opacity"
        style={{ cursor: "nwse-resize" }}
        onMouseDown={handleResizeMouseDown}
      >
        <svg
          viewBox="0 0 10 10"
          className="w-3 h-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <line x1="9" y1="1" x2="1" y2="9" />
          <line x1="9" y1="5" x2="5" y2="9" />
        </svg>
      </div>
    </div>
  );
});

// ===== CanvasBoard (キャンバスモード全体) =====

function CanvasBoard({
  sessions,
  endedSessions = [],
  onFocus,
  onLabelChange,
  onDismissEnded,
  onResumeEnded,
}: {
  sessions: ActiveSession[];
  endedSessions?: EndedSession[];
  onFocus: (tty: string) => void;
  onLabelChange: () => void;
  onDismissEnded?: (pid: number) => void;
  onResumeEnded?: (session: EndedSession) => void;
}) {
  return (
    <div
      className="relative w-full overflow-auto border border-base-300/40 rounded-xl bg-base-100"
      style={{ height: "calc(100vh - 9rem)", minHeight: "400px" }}
    >
      {/* ドットグリッド背景 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle, oklch(var(--b3)) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          opacity: 0.5,
        }}
      />
      {/* 仮想キャンバス（画面より大きめ） */}
      <div className="relative" style={{ width: "4000px", height: "3000px" }}>
        {sessions.map((s, i) => (
          <CanvasCard
            key={s.pid}
            session={s}
            index={i}
            onFocus={onFocus}
            onLabelChange={onLabelChange}
          />
        ))}
        {endedSessions.map((s, i) => (
          <CanvasCard
            key={`ended-${s.pid}`}
            session={s}
            index={sessions.length + i}
            onFocus={onFocus}
            onLabelChange={onLabelChange}
            isEnded
            onDismiss={() => onDismissEnded?.(s.pid)}
            onResume={() => onResumeEnded?.(s)}
            endedAt={s.endedAt}
          />
        ))}
      </div>
    </div>
  );
}

// ===== ActiveSessionsPage =====

// ポーリング間隔: 正常時10秒、失敗ごとに倍増（最大60秒）
const BASE_POLL_MS = 10_000;
const MAX_POLL_MS = 60_000;

export function ActiveSessionsPage() {
  // キャッシュがあれば初期値として使い、スピナーをスキップ（useStateイニシャライザで1回だけ読み込み）
  const [initialCache] = useState(() => loadSessionCache());
  const [sessions, setSessions] = useState<ActiveSession[]>(
    initialCache?.sessions ?? [],
  );
  const [loading, setLoading] = useState(initialCache === null);
  const [isStale, setIsStale] = useState(initialCache !== null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(
    initialCache ? new Date(initialCache.savedAt) : null,
  );
  const [, setLabelVersion] = useState(0);
  const [dragPid, setDragPid] = useState<number | null>(null);
  const [dragOverPid, setDragOverPid] = useState<number | null>(null);
  const [showLauncher, setShowLauncher] = useState(false);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [orderedSessions, setOrderedSessions] = useState<ActiveSession[]>(
    initialCache ? applyOrder(initialCache.sessions) : [],
  );
  const [viewMode, setViewModeState] = useState<ViewMode>(getViewMode);
  const [gridCols, setGridColsState] = useState<GridCols>(getGridCols);
  const [endedSessions, setEndedSessions] = useState<EndedSession[]>(() =>
    loadEndedSessions(),
  );
  const [fetchError, setFetchError] = useState(false);
  const prevSessionsRef = useRef<ActiveSession[] | null>(null);
  const failCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedulePoll = useCallback((delayMs: number, fn: () => void) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fn, delayMs);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await api.active();
      failCountRef.current = 0;
      setFetchError(false);
      // アクティブセッションとの比較で終了を検出（初回ロード後のみ）
      if (prevSessionsRef.current !== null) {
        const currentPids = new Set(data.map((s) => s.pid));
        const newlyEnded = prevSessionsRef.current.filter(
          (s) => !currentPids.has(s.pid),
        );
        if (newlyEnded.length > 0) {
          const endedAt = new Date().toISOString();
          setEndedSessions((prev) => {
            const existingPids = new Set(prev.map((s) => s.pid));
            const toAdd = newlyEnded
              .filter((s) => !existingPids.has(s.pid))
              .map((s) => ({ ...s, endedAt }));
            if (toAdd.length === 0) return prev;
            const updated = [...prev, ...toAdd];
            persistEndedSessions(updated);
            return updated;
          });
        }
      }
      prevSessionsRef.current = data;
      setSessions(data);
      saveSessionCache(data);
      setLastUpdated(new Date());
      setIsStale(false);
    } catch {
      failCountRef.current++;
      if (failCountRef.current >= 3) setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // APIデータが更新されたら保存済み順序を適用
  useEffect(() => {
    setOrderedSessions(applyOrder(sessions));
  }, [sessions]);

  // ポーリング: 成功時は10秒、失敗時は倍増（最大60秒）
  useEffect(() => {
    const poll = async () => {
      await load();
      const delay = Math.min(
        BASE_POLL_MS * 2 ** failCountRef.current,
        MAX_POLL_MS,
      );
      schedulePoll(delay, poll);
    };
    poll();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [load, schedulePoll]);

  useEffect(() => {
    api
      .projects()
      .then(setProjects)
      .catch(() => {});
  }, []);

  const handleFocus = useCallback(async (tty: string) => {
    try {
      await api.focusSession(tty);
    } catch {
      // iTerm切り替え失敗は致命的ではないため握り潰す
    }
  }, []);

  const handleLabelChange = useCallback(() => {
    setLabelVersion((v) => v + 1);
  }, []);

  const handleDragStart = useCallback((pid: number) => {
    setDragPid(pid);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, pid: number) => {
    e.preventDefault();
    setDragOverPid(pid);
  }, []);

  const handleDrop = useCallback(
    (targetPid: number) => {
      if (dragPid !== null && targetPid !== -1 && dragPid !== targetPid) {
        setOrderedSessions((prev) => {
          const fromIdx = prev.findIndex((s) => s.pid === dragPid);
          const toIdx = prev.findIndex((s) => s.pid === targetPid);
          if (fromIdx === -1 || toIdx === -1) return prev;
          const next = [...prev];
          const [moved] = next.splice(fromIdx, 1);
          next.splice(toIdx, 0, moved);
          saveOrder(next.map((s) => s.pid));
          return next;
        });
      }
      setDragPid(null);
      setDragOverPid(null);
    },
    [dragPid],
  );

  const handleDismissEnded = useCallback((pid: number) => {
    setEndedSessions(dismissEndedSession(pid));
  }, []);

  const handleResumeEnded = useCallback(async (session: EndedSession) => {
    if (!session.sessionId || !session.cwd) return;
    try {
      await api.openTerminal(session.sessionId, session.cwd);
      setEndedSessions(dismissEndedSession(session.pid));
    } catch (e) {
      console.warn("セッション再開に失敗:", e);
    }
  }, []);

  const switchViewMode = useCallback((mode: ViewMode) => {
    persistViewMode(mode);
    setViewModeState(mode);
  }, []);

  const switchGridCols = useCallback((cols: GridCols) => {
    persistGridCols(cols);
    setGridColsState(cols);
  }, []);

  /** グリッドモード用: orderedSessions をディレクトリ別にグループ化（順序維持） */
  const sessionGroups = useMemo(() => {
    const groups: {
      dirName: string | null;
      displayName: string;
      sessions: ActiveSession[];
    }[] = [];
    const seen = new Map<string, number>();
    for (const s of orderedSessions) {
      const key = s.projectDirName ?? "";
      if (seen.has(key)) {
        groups[seen.get(key)!].sessions.push(s);
      } else {
        seen.set(key, groups.length);
        groups.push({
          dirName: s.projectDirName,
          displayName: s.projectDisplayName ?? s.projectDirName ?? "unknown",
          sessions: [s],
        });
      }
    }
    return groups;
  }, [orderedSessions]);

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        {/* Left: Title + Count + Update status */}
        <div className="flex items-center gap-2.5">
          <h1 className="text-lg font-bold">起動中のセッション</h1>
          {orderedSessions.length > 0 && (
            <span className="bg-success/15 text-success text-xs font-medium px-1.5 py-0.5 rounded-full">
              {orderedSessions.length}
            </span>
          )}
          {endedSessions.length > 0 && (
            <span className="bg-base-300/60 text-base-content/40 text-xs font-medium px-1.5 py-0.5 rounded-full">
              終了 {endedSessions.length}
            </span>
          )}
          {isStale && (
            <span className="text-xs text-warning flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" />
              更新中…
            </span>
          )}
          {fetchError && (
            <span
              className="text-xs text-error flex items-center gap-1"
              title="API接続に失敗しています。自動リトライ中…"
            >
              <AlertTriangle className="w-3 h-3" />
              接続エラー
            </span>
          )}
          {lastUpdated && !isStale && !fetchError && (
            <span className="text-xs text-base-content/30">
              {formatDate(lastUpdated.toISOString())}
            </span>
          )}
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-2">
          {/* グリッド列数（グリッドモード時のみ） */}
          {viewMode === "grid" && (
            <div className="bg-base-300/40 rounded-lg p-0.5 flex items-center">
              {([1, 2, 3, 4] as GridCols[]).map((n) => (
                <button
                  key={n}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    gridCols === n
                      ? "bg-primary text-primary-content"
                      : "text-base-content/50 hover:bg-base-200"
                  }`}
                  onClick={() => switchGridCols(n)}
                  title={`${n}列表示`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}

          {/* Separator */}
          <div className="w-px h-5 bg-base-300" />

          {/* ビューモード切り替え */}
          <div className="bg-base-200/50 rounded-lg p-0.5 flex items-center">
            <button
              className={`px-2 py-1 rounded-md transition-colors ${
                viewMode === "grid"
                  ? "bg-primary text-primary-content"
                  : "text-base-content/50 hover:bg-base-200"
              }`}
              onClick={() => switchViewMode("grid")}
              title="グリッド表示"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              className={`px-2 py-1 rounded-md transition-colors ${
                viewMode === "canvas"
                  ? "bg-primary text-primary-content"
                  : "text-base-content/50 hover:bg-base-200"
              }`}
              onClick={() => switchViewMode("canvas")}
              title="自由配置（キャンバス）"
            >
              <Move className="w-4 h-4" />
            </button>
          </div>

          {/* Separator */}
          <div className="w-px h-5 bg-base-300" />

          <button className="btn btn-sm btn-ghost" onClick={load} title="更新">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            className="btn btn-sm btn-primary gap-1"
            onClick={() => setShowLauncher(true)}
          >
            <Plus className="w-4 h-4" />
            新規
          </button>
        </div>
      </div>

      {/* Launcher Modal */}
      {showLauncher && (
        <LaunchModal
          projects={projects}
          onClose={() => setShowLauncher(false)}
        />
      )}

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      ) : orderedSessions.length === 0 && endedSessions.length === 0 ? (
        <div className="bg-base-100 rounded-xl border border-base-300 p-20 text-center">
          <BedDouble className="w-12 h-12 text-base-content/20 mx-auto mb-3" />
          <div className="text-sm text-base-content/40">
            起動中の Claude セッションはありません
          </div>
          <div className="text-xs text-base-content/25 mt-1.5">
            ターミナルで{" "}
            <code className="font-mono bg-base-200 px-1 py-0.5 rounded text-[10px]">
              claude
            </code>{" "}
            を起動すると、ここに表示されます
          </div>
          <button
            className="btn btn-sm btn-primary mt-6 gap-1"
            onClick={() => setShowLauncher(true)}
          >
            <Plus className="w-4 h-4" />
            新規セッションを起動
          </button>
        </div>
      ) : viewMode === "canvas" ? (
        <CanvasBoard
          sessions={orderedSessions}
          endedSessions={endedSessions}
          onFocus={handleFocus}
          onLabelChange={handleLabelChange}
          onDismissEnded={handleDismissEnded}
          onResumeEnded={handleResumeEnded}
        />
      ) : (
        <>
          {orderedSessions.length > 0 && (
            <div className="space-y-6">
              {sessionGroups.map((group) => {
                const accentColor = getDirDefaultColor(group.dirName);
                const accentSwatch =
                  COLOR_SWATCHES[accentColor] ?? COLOR_SWATCHES[""];
                return (
                  <div key={group.dirName ?? "__unknown__"}>
                    {/* ディレクトリセクションヘッダー */}
                    {sessionGroups.length > 1 && (
                      <div className="flex items-center gap-2 mb-3">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${accentSwatch}`}
                        />
                        <span className="text-xs font-semibold text-base-content/50 truncate">
                          {group.displayName.split("/").slice(-2).join("/")}
                        </span>
                        <span className="text-xs text-base-content/25 shrink-0">
                          {group.sessions.length}
                        </span>
                        <div className="h-px flex-1 bg-base-300/50" />
                      </div>
                    )}
                    <div className={`grid ${GRID_CLASS[gridCols]} gap-4`}>
                      {group.sessions.map((s) => (
                        <ActiveCard
                          key={s.pid}
                          session={s}
                          onFocus={handleFocus}
                          onLabelChange={handleLabelChange}
                          onDragStart={handleDragStart}
                          onDragOver={handleDragOver}
                          onDrop={handleDrop}
                          isDragOver={
                            dragOverPid === s.pid && dragPid !== s.pid
                          }
                          gridCols={gridCols}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {endedSessions.length > 0 && (
            <>
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-base-300" />
                <span className="text-xs text-base-content/30">終了済み</span>
                <div className="h-px flex-1 bg-base-300" />
              </div>
              <div className={`grid ${GRID_CLASS[gridCols]} gap-4`}>
                {endedSessions.map((s) => (
                  <ActiveCard
                    key={`ended-${s.pid}`}
                    session={s}
                    onFocus={handleFocus}
                    onLabelChange={handleLabelChange}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    isDragOver={false}
                    gridCols={gridCols}
                    isEnded
                    onDismiss={() => handleDismissEnded(s.pid)}
                    onResume={() => handleResumeEnded(s)}
                    endedAt={s.endedAt}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
