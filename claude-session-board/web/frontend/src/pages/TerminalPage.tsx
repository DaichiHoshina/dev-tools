import { useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { X, Monitor, Maximize2, Minimize2 } from "lucide-react";
import { WebTerminal } from "../components/WebTerminal";
import { TOKYO_NIGHT_THEME } from "../lib/terminalTheme";

export function TerminalPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [pid, setPid] = useState<number | null>(null);
  const [exited, setExited] = useState(false);
  const [maximized, setMaximized] = useState(false);

  const rawCwd = searchParams.get("cwd") || "";
  const rawResume = searchParams.get("resume") || "";

  // UUIDバリデーション（コマンドインジェクション防止）
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const resume = UUID_RE.test(rawResume) ? rawResume : "";
  // cwdはパストラバーサル防止のため /,~,英数字,ハイフン,アンダースコア,ドットのみ許可
  const SAFE_PATH_RE = /^[~/\w.\-]+$/;
  const cwd = SAFE_PATH_RE.test(rawCwd) ? rawCwd : "";

  const command = resume ? `claude --resume ${resume}` : undefined;

  const shortPath = cwd
    ? cwd
        .replace(/^\/Users\/[^/]+\//, "~/")
        .split("/")
        .slice(-3)
        .join("/")
    : "terminal";

  const handleReady = useCallback((newPid: number) => {
    setPid(newPid);
  }, []);

  const handleExit = useCallback(() => {
    setExited(true);
  }, []);

  const handleClose = () => navigate("/");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleClose}
    >
      <div
        className={`flex flex-col rounded-xl shadow-2xl overflow-hidden transition-all ${
          maximized
            ? "w-[calc(100%-2rem)] h-[calc(100%-2rem)]"
            : "w-[720px] h-[480px]"
        }`}
        style={{
          backgroundColor: TOKYO_NIGHT_THEME.background,
          border: `1px solid ${TOKYO_NIGHT_THEME.brightBlack}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 shrink-0"
          style={{
            backgroundColor: TOKYO_NIGHT_THEME.black,
            borderBottom: `1px solid ${TOKYO_NIGHT_THEME.brightBlack}`,
          }}
        >
          <Monitor
            className="w-3.5 h-3.5"
            style={{ color: TOKYO_NIGHT_THEME.cyan }}
          />
          <span
            className="text-xs font-mono truncate flex-1"
            style={{ color: TOKYO_NIGHT_THEME.foreground }}
          >
            {shortPath}
          </span>
          {pid && (
            <span
              className="text-[10px] font-mono"
              style={{ color: TOKYO_NIGHT_THEME.mutedText }}
            >
              PID {pid}
            </span>
          )}
          {exited && (
            <span
              className="text-[10px] font-mono"
              style={{ color: TOKYO_NIGHT_THEME.red }}
            >
              terminated
            </span>
          )}
          <button
            className="p-0.5 rounded transition-colors"
            style={{ color: TOKYO_NIGHT_THEME.mutedText }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                TOKYO_NIGHT_THEME.brightBlack;
              e.currentTarget.style.color = TOKYO_NIGHT_THEME.foreground;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = TOKYO_NIGHT_THEME.mutedText;
            }}
            onClick={() => setMaximized((v) => !v)}
            title={maximized ? "縮小" : "最大化"}
          >
            {maximized ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            className="p-0.5 rounded transition-colors"
            style={{ color: TOKYO_NIGHT_THEME.mutedText }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = `${TOKYO_NIGHT_THEME.red}33`;
              e.currentTarget.style.color = TOKYO_NIGHT_THEME.red;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = TOKYO_NIGHT_THEME.mutedText;
            }}
            onClick={handleClose}
            title="閉じる"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Terminal */}
        <div className="flex-1 min-h-0 p-1">
          <WebTerminal
            cwd={cwd}
            command={command}
            onReady={handleReady}
            onExit={handleExit}
          />
        </div>
      </div>
    </div>
  );
}
