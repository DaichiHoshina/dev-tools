import { useEffect, useRef, useState, useCallback } from "hono/jsx/dom";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface Props {
  wsUrl: string;
  podName: string;
  containerName?: string;
  onClose: () => void;
}

// K8s exec WebSocket channels
const STDIN_CHANNEL = 0;
const STDOUT_CHANNEL = 1;
const STDERR_CHANNEL = 2;
const RESIZE_CHANNEL = 4;

const HEARTBEAT_INTERVAL = 30_000;

function sendResize(ws: WebSocket, cols: number, rows: number) {
  if (ws.readyState !== WebSocket.OPEN) return;
  const payload = JSON.stringify({ Width: cols, Height: rows });
  const encoded = new TextEncoder().encode(payload);
  const msg = new Uint8Array(encoded.length + 1);
  msg[0] = RESIZE_CHANNEL;
  msg.set(encoded, 1);
  ws.send(msg.buffer);
}

export function WebTerminal({ wsUrl, podName, containerName, onClose }: Props) {
  const termRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [status, setStatus] = useState<
    "connecting" | "connected" | "error" | "closed"
  >("connecting");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const clearHeartbeat = useCallback(() => {
    if (heartbeatRef.current !== null) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    const term = terminalRef.current;
    if (!term) return;

    setStatus("connecting");
    setErrorMsg("");
    term.writeln(
      `\x1b[36m# Connecting to ${podName}${containerName ? ` (${containerName})` : ""}...\x1b[0m`,
    );
    term.writeln(`\x1b[90m# URL: ${wsUrl}\x1b[0m`);

    // プリフライト: HTTP で exec エンドポイントの到達性を確認
    const httpUrl = wsUrl.replace(/^ws(s?):/, "http$1:");
    fetch(httpUrl, { method: "GET" })
      .then((res) => {
        // 400 = パラメータ不正だが到達可能、101 = Upgrade (通常ここには来ない)
        if (res.status === 400 || res.status === 101) {
          term.writeln(
            "\x1b[90m# Endpoint reachable, opening WebSocket...\x1b[0m",
          );
        } else if (res.status === 404) {
          term.writeln(
            `\x1b[33m# Warning: Pod not found (404). Pod が存在するか確認してください。\x1b[0m`,
          );
        } else if (res.status === 403) {
          term.writeln(
            "\x1b[33m# Warning: HTTP 403 - kubectl proxy が exec をブロックしています。\x1b[0m",
          );
          term.writeln(
            "\x1b[33m# kubectl proxy を --disable-filter=true 付きで再起動してください。\x1b[0m",
          );
        } else {
          term.writeln(
            `\x1b[33m# Warning: Unexpected HTTP ${res.status} from exec endpoint.\x1b[0m`,
          );
        }
      })
      .catch(() => {
        term.writeln(
          "\x1b[33m# Warning: kubectl proxy に到達できません。起動しているか確認してください。\x1b[0m",
        );
      });

    const ws = new WebSocket(wsUrl, ["v4.channel.k8s.io"]);
    wsRef.current = ws;
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      setStatus("connected");
      term.writeln("\x1b[32m# Connected.\x1b[0m\r\n");
      term.focus();

      // 初回 resize 送信
      sendResize(ws, term.cols, term.rows);

      // ハートビート開始: 30秒ごとに空データを送って接続を維持
      clearHeartbeat();
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const ping = new Uint8Array([STDIN_CHANNEL]);
          ws.send(ping.buffer);
        }
      }, HEARTBEAT_INTERVAL);
    };

    ws.onmessage = (event: MessageEvent) => {
      const data = new Uint8Array(event.data as ArrayBuffer);
      if (data.length < 2) return;
      const channel = data[0];
      const payload = new TextDecoder().decode(data.slice(1));
      if (channel === STDOUT_CHANNEL || channel === STDERR_CHANNEL) {
        term.write(payload);
      }
    };

    ws.onerror = () => {
      clearHeartbeat();
      setStatus("error");
      const msg =
        "WebSocket接続に失敗しました。ブラウザの開発者ツール (Console/Network) で詳細を確認してください。";
      setErrorMsg(msg);
      term.writeln("\r\n\x1b[31m# Connection error.\x1b[0m");
      term.writeln(
        "\x1b[31m# kubectl proxy が起動していない、または WebSocket Upgrade に失敗した可能性があります。\x1b[0m",
      );
    };

    ws.onclose = (ev) => {
      clearHeartbeat();
      setStatus((prev) => {
        if (prev === "error") return prev;
        term.writeln(
          `\r\n\x1b[33m# Connection closed (code: ${ev.code}, reason: ${ev.reason || "none"}).\x1b[0m`,
        );
        return "closed";
      });
    };

    // xterm → WebSocket (stdin)
    term.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        const encoded = new TextEncoder().encode(data);
        const msg = new Uint8Array(encoded.length + 1);
        msg[0] = STDIN_CHANNEL;
        msg.set(encoded, 1);
        ws.send(msg.buffer);
      }
    });
  }, [wsUrl, podName, containerName, clearHeartbeat]);

  const handleReconnect = useCallback(() => {
    // 既存接続を閉じる
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    clearHeartbeat();
    connect();
  }, [connect, clearHeartbeat]);

  useEffect(() => {
    if (!termRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      theme: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        cursor: "#58a6ff",
        selectionBackground: "#264f78",
      },
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termRef.current);
    fitAddon.fit();
    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // ターミナル resize → K8s resize チャネル送信
    term.onResize(({ cols, rows }) => {
      const ws = wsRef.current;
      if (ws) sendResize(ws, cols, rows);
    });

    // ウィンドウ resize → fitAddon でターミナルサイズ調整
    const handleResize = () => fitAddon.fit();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearHeartbeat();
      wsRef.current?.close();
      term.dispose();
    };
  }, [clearHeartbeat]);

  // Terminal 初期化完了後に接続開始
  useEffect(() => {
    if (terminalRef.current) connect();
  }, [connect]);

  const handleCopyCommand = () => {
    const cmd = `kubectl exec -it ${podName}${containerName ? ` -c ${containerName}` : ""} -- /bin/sh`;
    void navigator.clipboard.writeText(cmd);
  };

  return (
    <div class="fixed inset-0 z-50 flex flex-col" style="background: #0d1117">
      {/* ヘッダー */}
      <div
        class="flex items-center justify-between px-4 py-2 border-b"
        style="background: var(--bg-surface); border-color: var(--border-default)"
      >
        <div class="flex items-center gap-3">
          <i class="fas fa-terminal text-sm" style="color: var(--text-muted)" />
          <span class="text-sm font-medium" style="color: var(--text-heading)">
            {podName}
            {containerName && (
              <span class="text-xs ml-1" style="color: var(--text-subtle)">
                ({containerName})
              </span>
            )}
          </span>
          <span
            class={`text-xs px-1.5 py-0.5 rounded ${
              status === "connected"
                ? "text-success bg-success/10"
                : status === "error"
                  ? "text-error bg-error/10"
                  : "text-warning bg-warning/10"
            }`}
          >
            {status === "connecting" && "接続中..."}
            {status === "connected" && "接続中"}
            {status === "error" && "エラー"}
            {status === "closed" && "切断"}
          </span>
        </div>
        <div class="flex items-center gap-2">
          {(status === "closed" || status === "error") && (
            <button
              type="button"
              onClick={handleReconnect}
              class="btn btn-ghost btn-xs rounded-lg text-primary"
              title="再接続"
            >
              <i class="fas fa-arrows-rotate mr-1" />
              再接続
            </button>
          )}
          <button
            type="button"
            onClick={handleCopyCommand}
            class="btn btn-ghost btn-xs rounded-lg"
            title="kubectl exec コマンドをコピー"
          >
            <i class="fas fa-copy mr-1" />
            コマンドコピー
          </button>
          <button
            type="button"
            onClick={onClose}
            class="btn btn-ghost btn-xs btn-square rounded-lg"
            title="閉じる"
          >
            <i class="fas fa-xmark" />
          </button>
        </div>
      </div>

      {/* ターミナル領域 */}
      <div ref={termRef} class="flex-1 p-2" />

      {/* エラー・切断表示 */}
      {(status === "error" || status === "closed") && (
        <div
          class="px-4 py-2 text-xs border-t flex items-center justify-between"
          style={`background: oklch(var(--${status === "error" ? "er" : "wa"}) / 0.1); color: oklch(var(--${status === "error" ? "er" : "wa"})); border-color: var(--border-default)`}
        >
          <span>
            {status === "error"
              ? errorMsg
              : "接続が切断されました。「再接続」で復帰できます。"}
          </span>
          <button
            type="button"
            onClick={handleReconnect}
            class="btn btn-ghost btn-xs rounded"
          >
            <i class="fas fa-arrows-rotate mr-1" />
            再接続
          </button>
        </div>
      )}
    </div>
  );
}
