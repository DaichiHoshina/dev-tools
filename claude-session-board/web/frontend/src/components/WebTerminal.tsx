import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { TOKYO_NIGHT_THEME } from "../lib/terminalTheme";

interface WebTerminalProps {
  cwd: string;
  command?: string;
  onReady?: (pid: number) => void;
  onExit?: () => void;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 5000];

export function WebTerminal({
  cwd,
  command,
  onReady,
  onExit,
}: WebTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initializedRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  const [failed, setFailed] = useState(false);

  const connectWs = useCallback(
    (term: Terminal) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/terminal`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        retryCountRef.current = 0;
        const initMsg = {
          type: "init",
          cwd,
          cols: term.cols,
          rows: term.rows,
          command,
        };
        ws.send(JSON.stringify(initMsg));
      };

      let ready = false;
      ws.onmessage = (event) => {
        const data = event.data as string;
        if (!ready && data.startsWith("{")) {
          try {
            const msg = JSON.parse(data) as {
              type: string;
              id?: number;
              message?: string;
            };
            if (msg.type === "ready" && msg.id) {
              ready = true;
              onReady?.(msg.id);
              return;
            }
            if (msg.type === "error") {
              term.writeln(`\r\n\x1b[31mError: ${msg.message}\x1b[0m`);
              return;
            }
          } catch {
            // JSONパース失敗 → 通常出力として扱う
          }
        }
        term.write(data);
      };

      ws.onclose = () => {
        if (unmountedRef.current) return;

        if (retryCountRef.current < MAX_RETRIES) {
          const delay = RETRY_DELAYS[retryCountRef.current];
          term.writeln(
            `\r\n\x1b[33m接続が切断されました。再接続中... (${retryCountRef.current + 1}/${MAX_RETRIES})\x1b[0m`,
          );
          retryTimerRef.current = setTimeout(() => {
            retryCountRef.current++;
            connectWs(term);
          }, delay);
        } else {
          term.writeln(
            "\r\n\x1b[31m接続が切断されました。ページを再読み込みしてください。\x1b[0m",
          );
          setFailed(true);
          onExit?.();
        }
      };

      ws.onerror = () => {
        term.writeln("\r\n\x1b[31m[WebSocket error]\x1b[0m");
      };
    },
    [cwd, command, onReady, onExit],
  );

  const connect = useCallback(() => {
    if (!containerRef.current || initializedRef.current) return;
    initializedRef.current = true;
    unmountedRef.current = false;

    const term = new Terminal({
      theme: TOKYO_NIGHT_THEME,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace",
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: "bar",
      scrollback: 10000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    connectWs(term);

    // リスナーはconnect()で1回だけ登録し、wsRef経由で最新WebSocketに送信
    term.onData((data: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    });

    term.onResize(({ cols, rows }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener("resize", handleResize);

    const observer = new ResizeObserver(() => {
      fitAddon.fit();
    });
    observer.observe(containerRef.current);

    return () => {
      unmountedRef.current = true;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      window.removeEventListener("resize", handleResize);
      observer.disconnect();
      wsRef.current?.close();
      term.dispose();
      terminalRef.current = null;
      wsRef.current = null;
      fitAddonRef.current = null;
      initializedRef.current = false;
    };
  }, [connectWs]);

  useEffect(() => {
    const cleanup = connect();
    return cleanup;
  }, [connect]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      style={{ backgroundColor: TOKYO_NIGHT_THEME.background }}
    >
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
          <button
            className="btn btn-sm btn-outline border-[#f7768e] text-[#f7768e] hover:bg-[#f7768e]/10"
            onClick={() => {
              setFailed(false);
              retryCountRef.current = 0;
              if (terminalRef.current) connectWs(terminalRef.current);
            }}
          >
            再接続
          </button>
        </div>
      )}
    </div>
  );
}
