import type { MigrationServiceDef } from "./migration-config";

export interface MigrationVersion {
  version: number;
  dirty: boolean;
}

export interface ServiceVersionState {
  id: string;
  version: MigrationVersion | null;
  rawOutput: string;
  error?: string;
}

export interface ActionResult {
  success: boolean;
  output: string;
  error?: string;
}

export type MigrateAction = "up" | "down" | "goto" | "force";

interface RawPodList {
  items: Array<{
    metadata: { name: string };
    status?: { phase?: string };
  }>;
}

async function getPodName(
  baseUrl: string,
  namespace: string,
  podLabel: string,
  signal?: AbortSignal,
): Promise<string> {
  const url = `${baseUrl}/api/v1/namespaces/${encodeURIComponent(namespace)}/pods?labelSelector=${encodeURIComponent(podLabel)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Pod一覧取得失敗: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as RawPodList;
  const running = data.items.find((p) => p.status?.phase === "Running");
  const pod = running ?? data.items[0];
  if (!pod) {
    throw new Error(
      `ラベル "${podLabel}" のPodが ${namespace} に見つかりません`,
    );
  }
  return pod.metadata.name;
}

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// K8s exec WebSocket（v4.channel.k8s.io プロトコル）
// フレーム先頭バイト: 1=stdout, 2=stderr, 3=status(JSON)
function execInPod(
  baseUrl: string,
  namespace: string,
  podName: string,
  container: string,
  args: string[],
  signal?: AbortSignal,
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const params = new URLSearchParams();
    params.append("container", container);
    for (const arg of args) params.append("command", arg);
    params.append("stdout", "true");
    params.append("stderr", "true");
    const url = `${proto}//${location.host}${baseUrl}/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(podName)}/exec?${params.toString()}`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(url, ["v4.channel.k8s.io"]);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    ws.binaryType = "arraybuffer";

    let stdout = "";
    let stderr = "";
    let statusText = "";
    let settled = false;

    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };

    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          ws.close();
          settle(() => reject(new Error("Aborted")));
        },
        { once: true },
      );
    }

    ws.onmessage = (evt) => {
      const bytes = new Uint8Array(evt.data as ArrayBuffer);
      const stream = bytes[0];
      const text = new TextDecoder().decode(bytes.slice(1));
      if (stream === 1) stdout += text;
      else if (stream === 2) stderr += text;
      else if (stream === 3) statusText += text;
    };

    ws.onclose = () => {
      let exitCode = 0;
      if (statusText) {
        try {
          const status = JSON.parse(statusText) as {
            status?: string;
            details?: {
              causes?: Array<{ reason: string; message: string }>;
            };
          };
          if (status.status === "Failure") {
            const cause = status.details?.causes?.find(
              (c) => c.reason === "ExitCode",
            );
            exitCode = cause ? parseInt(cause.message, 10) : 1;
          }
        } catch {
          /* ignore JSON parse errors */
        }
      }
      settle(() => resolve({ stdout, stderr, exitCode }));
    };

    ws.onerror = () => {
      settle(() =>
        reject(
          new Error(
            "exec WebSocket接続エラー。kubectl proxy の --disable-filter=true オプションが必要です",
          ),
        ),
      );
    };
  });
}

// golang-migrate の version 出力をパース
// 例: "20211214111220" または "20211214111220 (dirty)"
export function parseMigrationVersion(output: string): MigrationVersion {
  const dirty = output.toLowerCase().includes("dirty");
  const allNumbers = output.match(/\d+/g);
  if (!allNumbers || allNumbers.length === 0) {
    return { version: 0, dirty: false };
  }
  let maxVersion = 0;
  for (const num of allNumbers) {
    const parsed = parseInt(num, 10);
    if (parsed > maxVersion) maxVersion = parsed;
  }
  return { version: maxVersion, dirty };
}

export async function fetchMigrationVersion(
  baseUrl: string,
  svc: MigrationServiceDef,
  signal?: AbortSignal,
): Promise<ServiceVersionState> {
  try {
    const podName = await getPodName(
      baseUrl,
      svc.namespace,
      svc.podLabel,
      signal,
    );
    const { stdout, stderr, exitCode } = await execInPod(
      baseUrl,
      svc.namespace,
      podName,
      svc.container,
      [svc.container, "migrate", "version"],
      signal,
    );
    const raw = stdout || stderr;
    if (exitCode !== 0 && !raw) {
      throw new Error(`migrate version が終了コード ${exitCode} で失敗`);
    }
    const version = parseMigrationVersion(raw);
    return { id: svc.id, version, rawOutput: raw };
  } catch (e) {
    if (e instanceof Error && e.message === "Aborted") throw e;
    return {
      id: svc.id,
      version: null,
      rawOutput: "",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// 実行するコマンド形式:
// kubectl exec -n {ns} {pod} -c {container} -- {container} migrate {subcommand}
export async function executeMigration(
  baseUrl: string,
  svc: MigrationServiceDef,
  action: MigrateAction,
  version?: number,
): Promise<ActionResult> {
  try {
    const podName = await getPodName(baseUrl, svc.namespace, svc.podLabel);
    const args = [svc.container, "migrate", action];
    if ((action === "goto" || action === "force") && version !== undefined) {
      args.push(String(version));
    }
    const { stdout, stderr, exitCode } = await execInPod(
      baseUrl,
      svc.namespace,
      podName,
      svc.container,
      args,
    );
    const output = stdout || stderr;
    return {
      success: exitCode === 0,
      output,
      error: exitCode !== 0 ? stderr || `終了コード ${exitCode}` : undefined,
    };
  } catch (e) {
    return {
      success: false,
      output: "",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
