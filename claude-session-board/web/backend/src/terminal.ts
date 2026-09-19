import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import { WebSocketServer, WebSocket } from "ws";
import * as pty from "node-pty";

interface InitMessage {
  type: "init";
  cwd: string;
  cols: number;
  rows: number;
  command?: string;
}

interface ResizeMessage {
  type: "resize";
  cols: number;
  rows: number;
}

type ClientMessage = InitMessage | ResizeMessage;

/** 安全なcwdパスか検証 */
function isValidCwd(cwd: string): boolean {
  return /^\/[a-zA-Z0-9/_. -]+$/.test(cwd) && !cwd.includes("..");
}

/** 許可されたコマンドか検証（claude --resume <UUID> のみ許可） */
function isAllowedCommand(cmd: string): boolean {
  return /^claude --resume [a-f0-9-]+$/i.test(cmd);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setupTerminalWebSocket(server: {
  on: (...args: any[]) => void;
}): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "", `http://${req.headers.host}`);
    if (url.pathname !== "/ws/terminal") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws: WebSocket) => {
    let ptyProcess: pty.IPty | null = null;
    let initialized = false;

    ws.on("message", (raw) => {
      const data = raw.toString();

      // 初期化前はJSONメッセージのみ受け付ける
      if (!initialized) {
        let msg: ClientMessage;
        try {
          msg = JSON.parse(data) as ClientMessage;
        } catch {
          ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
          return;
        }

        if (msg.type === "init") {
          const cwd = msg.cwd || process.env.HOME || "/";
          const cols = Math.min(Math.max(msg.cols || 80, 20), 500);
          const rows = Math.min(Math.max(msg.rows || 24, 5), 200);

          if (msg.cwd && !isValidCwd(msg.cwd)) {
            ws.send(JSON.stringify({ type: "error", message: "Invalid cwd" }));
            ws.close();
            return;
          }

          // command が指定されていればそれを実行、なければシェルを起動
          const shell = process.env.SHELL || "/bin/zsh";
          const shellArgs: string[] = [];

          // init commandを構築（許可リストで検証）
          let initCommand: string | undefined;
          if (msg.command) {
            if (!isAllowedCommand(msg.command)) {
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "Command not allowed",
                }),
              );
              ws.close();
              return;
            }
            initCommand = msg.command;
          }

          try {
            ptyProcess = pty.spawn(shell, shellArgs, {
              name: "xterm-256color",
              cols,
              rows,
              cwd,
              env: {
                ...process.env,
                TERM: "xterm-256color",
                COLORTERM: "truecolor",
              } as Record<string, string>,
            });
          } catch (e) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: `Failed to spawn PTY: ${e instanceof Error ? e.message : "unknown"}`,
              }),
            );
            ws.close();
            return;
          }

          initialized = true;
          ws.send(JSON.stringify({ type: "ready", id: ptyProcess.pid }));

          // PTY → WebSocket
          ptyProcess.onData((output: string) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(output);
            }
          });

          ptyProcess.onExit(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.close();
            }
            ptyProcess = null;
          });

          // 初期コマンド送信
          if (initCommand) {
            ptyProcess.write(initCommand + "\n");
          }
        }
        return;
      }

      // 初期化後: リサイズメッセージかキー入力
      if (data.startsWith("{")) {
        try {
          const msg = JSON.parse(data) as ClientMessage;
          if (msg.type === "resize" && ptyProcess) {
            const cols = Math.min(Math.max(msg.cols || 80, 20), 500);
            const rows = Math.min(Math.max(msg.rows || 24, 5), 200);
            ptyProcess.resize(cols, rows);
          }
        } catch {
          // JSONでなければ入力として扱う
          ptyProcess?.write(data);
        }
      } else {
        // 生テキスト入力
        ptyProcess?.write(data);
      }
    });

    const cleanup = () => {
      if (ptyProcess) {
        try {
          ptyProcess.kill();
        } catch {
          // already dead
        }
        ptyProcess = null;
      }
    };

    ws.on("close", cleanup);
    ws.on("error", cleanup);
  });
}
