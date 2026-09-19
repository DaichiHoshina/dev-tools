import { createServer } from "http";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getRequestListener } from "@hono/node-server";
import { setupTerminalWebSocket } from "./terminal.js";
import {
  readFileSync,
  readdirSync,
  existsSync,
  createReadStream,
  statSync,
  openSync,
  readSync,
  closeSync,
} from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
import { createInterface } from "readline";
import { execSync } from "child_process";

// .envファイルを読み込み（tsx watchが--env-fileを転送しないため自前で処理）
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../../.env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const val = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) process.env[key] = val;
  }
}

const CLAUDE_DIR =
  process.env.CLAUDE_DIR ?? join(homedir(), ".claude", "projects");
const PORT = Number(process.env.PORT ?? 3010);

// ===== Types =====

interface SessionEntry {
  sessionId: string;
  fullPath: string;
  fileMtime: number;
  firstPrompt: string;
  summary: string;
  messageCount: number;
  created: string;
  modified: string;
  gitBranch: string;
  projectPath: string;
  isSidechain: boolean;
}

interface SessionsIndex {
  version: number;
  entries: SessionEntry[];
}

interface ProjectInfo {
  dirName: string; // -Users-username-ghq-...
  displayName: string; // 正規化された表示名
  projectPath: string; // 実際のパス
  sessionCount: number;
  lastModified: string;
}

interface MessageRecord {
  type:
    | "user"
    | "assistant"
    | "system"
    | "progress"
    | "file-history-snapshot"
    | "queue-operation";
  uuid?: string;
  parentUuid?: string;
  timestamp?: string;
  sessionId?: string;
  gitBranch?: string;
  message?: {
    role?: string;
    content?: string | ContentBlock[];
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
  isSidechain?: boolean;
}

interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
}

// ===== Helpers =====

/**
 * -Users-username-ghq-gitlab-example-cloud-myorg-application-frontend-app
 * → "myorg/frontend/app"
 */
function normalizeDirName(dirName: string): string {
  // ホームディレクトリ部分を除去
  let s = dirName.replace(/^-Users-[^-]+-/, "");
  // ハイフンをスラッシュに変換
  s = s.replace(/-/g, "/");
  // ghq/以降の長いgitホストパス（ghq/gitlab.*/等）を省略
  s = s.replace(/^ghq\/[^/]+\/[^/]+\/[^/]+\/[^/]+\//, "");
  return s.replace(/\/+$/, "") || dirName;
}

/** JSONL先頭からfirstPromptを取得（キャッシュ付き） */
const firstPromptCache = new Map<string, string>();

function getFirstPrompt(fullPath: string): string {
  const cached = firstPromptCache.get(fullPath);
  if (cached !== undefined) return cached;
  try {
    const { size } = statSync(fullPath);
    const readSize = Math.min(size, 32768);
    const fd = openSync(fullPath, "r");
    const buf = Buffer.alloc(readSize);
    readSync(fd, buf, 0, buf.length, 0);
    closeSync(fd);
    const head = buf.toString("utf-8");
    for (const line of head.split("\n")) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line) as MessageRecord;
        if (record.type !== "user") continue;
        let text = extractText(record.message?.content).slice(0, 500);
        if (!text) continue;
        // スキル展開メッセージ（## /flow - ...）はスキップ
        if (/^##\s*\//.test(text)) continue;
        // コマンドタグからユーザー入力部分を抽出
        if (/^<command-/.test(text)) {
          const argsMatch = text.match(
            /<command-args>([\s\S]*?)(?:<\/command-args>|$)/,
          );
          text = argsMatch?.[1]?.trim() ?? "";
          if (!text) continue;
        }
        text = text.slice(0, 200);
        firstPromptCache.set(fullPath, text);
        return text;
      } catch {
        // skip
      }
    }
  } catch {
    // skip
  }
  firstPromptCache.set(fullPath, "");
  return "";
}

/** ディレクトリスキャン結果のキャッシュ（30秒TTL） */
const dirScanCache = new Map<string, { entries: SessionEntry[]; ts: number }>();
const DIR_SCAN_TTL = 30_000;

function readSessionsIndex(projectDir: string): SessionEntry[] {
  // キャッシュチェック
  const now = Date.now();
  const cached = dirScanCache.get(projectDir);
  if (cached && now - cached.ts < DIR_SCAN_TTL) return cached.entries;

  const dir = join(CLAUDE_DIR, projectDir);
  const indexPath = join(dir, "sessions-index.json");

  // sessions-index.json からエントリを読む
  let indexed: SessionEntry[] = [];
  if (existsSync(indexPath)) {
    try {
      const raw = readFileSync(indexPath, "utf-8");
      const data = JSON.parse(raw) as SessionsIndex;
      indexed = data.entries ?? [];
    } catch {
      // skip
    }
  }

  // インデックスに含まれないJSONLファイルを補完（statのみ、firstPromptは遅延）
  const indexedIds = new Set(indexed.map((e) => e.sessionId));
  try {
    const jsonlFiles = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    for (const f of jsonlFiles) {
      const sessionId = f.replace(".jsonl", "");
      if (indexedIds.has(sessionId)) continue;
      const fullPath = join(dir, f);
      try {
        const stat = statSync(fullPath);
        const firstPrompt = getFirstPrompt(fullPath);
        indexed.push({
          sessionId,
          fullPath,
          fileMtime: stat.mtimeMs,
          firstPrompt,
          summary: firstPrompt,
          messageCount: 0,
          created: stat.birthtime.toISOString(),
          modified: stat.mtime.toISOString(),
          gitBranch: "",
          projectPath: "",
          isSidechain: false,
        });
      } catch {
        // skip
      }
    }
  } catch {
    // skip
  }

  dirScanCache.set(projectDir, { entries: indexed, ts: now });
  return indexed;
}

function getProjectDirs(): string[] {
  try {
    return readdirSync(CLAUDE_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .filter((d) => !d.name.includes("-worktrees-"))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

/**
 * JONSLからuser/assistantメッセージのみを読み込む（遅延・ストリーム）
 * progressレコードは除外してメモリ節約
 */
async function readMessages(jsonlPath: string): Promise<MessageRecord[]> {
  if (!existsSync(jsonlPath)) return [];
  return new Promise((resolve, reject) => {
    const messages: MessageRecord[] = [];
    const rl = createInterface({
      input: createReadStream(jsonlPath, { encoding: "utf-8" }),
      crlfDelay: Infinity,
    });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const record = JSON.parse(line) as MessageRecord;
        if (record.type === "user" || record.type === "assistant") {
          messages.push(record);
        }
      } catch {
        // 壊れた行はスキップ
      }
    });
    rl.on("close", () => resolve(messages));
    rl.on("error", reject);
  });
}

/**
 * JONSLのuser/assistantメッセージからテキストを抽出してキーワード検索
 */
async function searchInJsonl(
  jsonlPath: string,
  keyword: string,
  sessionId: string,
): Promise<{ sessionId: string; snippet: string; timestamp?: string }[]> {
  if (!existsSync(jsonlPath)) return [];
  const lower = keyword.toLowerCase();
  return new Promise((resolve, reject) => {
    const hits: { sessionId: string; snippet: string; timestamp?: string }[] =
      [];
    const rl = createInterface({
      input: createReadStream(jsonlPath, { encoding: "utf-8" }),
      crlfDelay: Infinity,
    });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const record = JSON.parse(line) as MessageRecord;
        if (record.type !== "user" && record.type !== "assistant") return;
        const text = extractText(record.message?.content);
        if (text.toLowerCase().includes(lower)) {
          const idx = text.toLowerCase().indexOf(lower);
          const start = Math.max(0, idx - 60);
          const end = Math.min(text.length, idx + keyword.length + 60);
          const snippet =
            (start > 0 ? "..." : "") +
            text.slice(start, end) +
            (end < text.length ? "..." : "");
          hits.push({ sessionId, snippet, timestamp: record.timestamp });
        }
      } catch {
        // skip
      }
    });
    rl.on("close", () => resolve(hits));
    rl.on("error", reject);
  });
}

function extractText(content?: string | ContentBlock[]): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
}

/**
 * ワークツリーCWDを親リポジトリのCWDに正規化
 * /repo/.claude/worktrees/<name> → /repo
 */
function resolveWorktreeCwd(cwd: string): string {
  return cwd.replace(/\/\.claude\/worktrees\/[^/]+$/, "");
}

/**
 * CWD → プロジェクトdirName変換
 * /Users/yourname/ghq/gitlab.example... → -Users-yourname-ghq-gitlab-example...
 */
function cwdToDirName(cwd: string): string {
  return resolveWorktreeCwd(cwd).replace(/[/.]/g, "-");
}

/**
 * dirName内のJSONLファイルからmtimeが新しい順にcount件を返す
 * アクティブセッションのファイルはリアルタイムで書き込まれるため、mtimeが最も信頼できる
 */
function findLatestSessionsInDir(
  dirName: string,
  count: number,
): { sessionId: string; fullPath: string }[] {
  const dir = join(CLAUDE_DIR, dirName);
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => {
        const full = join(dir, f);
        const mtime = statSync(full).mtimeMs;
        return { sessionId: f.replace(".jsonl", ""), fullPath: full, mtime };
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, count);
  } catch {
    return [];
  }
}

/** URL抽出用の正規表現 */
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]()]+/g;

/** Jiraチケットキー抽出 */
const JIRA_SITE_NAME = process.env.ATLASSIAN_SITE_NAME ?? "your-org";
const JIRA_BASE_URL = (() => {
  const raw =
    process.env.JIRA_BASE_URL ??
    `https://${JIRA_SITE_NAME}.atlassian.net/browse/`;
  return raw.endsWith("/") ? raw : raw + "/";
})();
const JIRA_API_BASE = `https://${JIRA_SITE_NAME}.atlassian.net`;
const JIRA_API_EMAIL = process.env.ATLASSIAN_USER_EMAIL ?? "";
const JIRA_API_TOKEN = process.env.ATLASSIAN_API_TOKEN ?? "";
const JIRA_TICKET_REGEX = /\b([A-Z]{2,10}-\d+)\b/g;

/** Jira APIからチケットのサマリーを一括取得（キャッシュ付き、TTLなし＝サーバー再起動でリセット） */
const jiraTitleCache = new Map<string, string>();
const JIRA_KEY_PATTERN = /^[A-Z]{2,10}-\d+$/;

async function fetchJiraTitles(keys: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!JIRA_API_EMAIL || !JIRA_API_TOKEN || keys.length === 0) return result;

  // キーバリデーション（JQLインジェクション防止）
  const safeKeys = keys.filter((k) => JIRA_KEY_PATTERN.test(k));
  const uncached = safeKeys.filter((k) => !jiraTitleCache.has(k));

  // キャッシュ済みのものを返却用mapに追加
  for (const k of safeKeys) {
    const cached = jiraTitleCache.get(k);
    if (cached !== undefined) result.set(k, cached);
  }

  if (uncached.length === 0) return result;

  // JQLで一括取得（最大20件、残りは空文字キャッシュで次回再試行を防止）
  const batch = uncached.slice(0, 20);
  const jql = `key in (${batch.map((k) => `"${k}"`).join(",")})`;
  const url = `${JIRA_API_BASE}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=summary&maxResults=20`;
  const auth = Buffer.from(`${JIRA_API_EMAIL}:${JIRA_API_TOKEN}`).toString(
    "base64",
  );

  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) {
      const data = (await resp.json()) as {
        issues?: { key: string; fields?: { summary?: string } }[];
      };
      for (const issue of data.issues ?? []) {
        const title = issue.fields?.summary ?? "";
        jiraTitleCache.set(issue.key, title);
        result.set(issue.key, title);
      }
    } else {
      console.warn(
        `[Jira API] Failed to fetch titles: ${resp.status} ${resp.statusText}`,
      );
    }
  } catch {
    // ネットワークエラー・タイムアウト時はタイトルなしで続行
  }

  // 未解決キーは全件空文字キャッシュ（バッチ外含め再APIコール防止）
  for (const k of uncached) {
    if (!jiraTitleCache.has(k)) {
      jiraTitleCache.set(k, "");
    }
  }

  return result;
}

/**
 * JONSLの末尾を読み取り、末尾N件の「テキストがある」user/assistantメッセージを返す。
 * tool_use/tool_result が連続する長時間セッションに備え、64KB→256KB→512KBと段階的に
 * 読み取り範囲を拡大する。全サイズ試行後もテキストが見つからない場合はファイル全体を読む。
 */
async function readLastNMessages(
  jsonlPath: string,
  n: number,
): Promise<{
  messages: { type: "user" | "assistant"; text: string; timestamp?: string }[];
  links: string[];
  jiraTickets: { key: string; url: string }[];
}> {
  if (!existsSync(jsonlPath))
    return { messages: [], links: [], jiraTickets: [] };
  const { size } = statSync(jsonlPath);

  // tool_use/tool_result が大きい場合に備え、段階的に読み取りサイズを拡大
  // 最後に size を追加することで、長期セッションでも必ずテキストを探せる
  const TAIL_SIZES = [64 * 1024, 256 * 1024, 512 * 1024, size];

  let bestMessages: {
    type: "user" | "assistant";
    text: string;
    timestamp?: string;
  }[] = [];
  let bestLinks: string[] = [];
  let bestTickets: { key: string; url: string }[] = [];

  for (const tailBytes of TAIL_SIZES) {
    const fd = openSync(jsonlPath, "r");
    const startPos = Math.max(0, size - tailBytes);
    const buf = Buffer.alloc(Math.min(size, tailBytes));
    readSync(fd, buf, 0, buf.length, startPos);
    closeSync(fd);

    const tail = buf.toString("utf-8");
    const lines = tail.split("\n").filter(Boolean);
    if (startPos > 0 && lines.length > 0) lines.shift();

    const result: {
      type: "user" | "assistant";
      text: string;
      timestamp?: string;
    }[] = [];
    const urlSet = new Set<string>();
    const ticketSet = new Set<string>();

    for (const line of lines) {
      try {
        const record = JSON.parse(line) as MessageRecord;
        if (record.type !== "user" && record.type !== "assistant") continue;
        const fullText = extractText(record.message?.content);

        const urls = fullText.match(URL_REGEX);
        if (urls) {
          for (const url of urls) {
            const cleaned = url.replace(/[.,;:!?)]+$/, "");
            urlSet.add(cleaned);
          }
        }

        // Jiraチケットキー抽出
        for (const m of fullText.matchAll(JIRA_TICKET_REGEX)) {
          ticketSet.add(m[1]);
        }

        const text = fullText.slice(0, 200);
        if (text.length === 0) continue;
        result.push({ type: record.type, text, timestamp: record.timestamp });
      } catch {
        // skip
      }
    }

    // links/ticketsは常に最も広い読み取り範囲で上書き（tool_useのみ区間でもURLは拾う）
    // Jira browse URLのみ除外（Confluence等の他atlassianサービスURLはlinksに残す）
    bestLinks = [...urlSet].filter((u) => !u.includes("atlassian.net/browse/"));
    bestTickets = [...ticketSet].map((key) => ({
      key,
      url: JIRA_BASE_URL + key,
    }));

    // メッセージは件数が増えた場合のみ更新
    if (result.length > bestMessages.length) {
      bestMessages = result.slice(-n);
    }

    // 十分なメッセージが見つかったか、ファイル全体を読んだ場合は終了
    if (result.length >= n || startPos === 0) {
      break;
    }
  }

  return { messages: bestMessages, links: bestLinks, jiraTickets: bestTickets };
}

// ===== Validation =====

/** projectPathのバリデーション（安全なパス文字のみ許可） */
function validateProjectPath(path: string): boolean {
  return /^[a-zA-Z0-9/_. -]+$/.test(path);
}

/** sessionIdのバリデーション（UUID形式） */
function validateSessionId(id: string): boolean {
  return /^[a-f0-9-]+$/i.test(id);
}

/** iTerm2のwrite textに渡す文字列をエスケープ */
function escapeForShell(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** AppleScriptでiTerm2新タブを開いてコマンドを実行 */
function runInNewItermTab(command: string): void {
  const script = `
tell application "iTerm2"
  activate
  tell current window
    create tab with default profile
    tell current session
      write text "${command}"
    end tell
  end tell
end tell`;
  execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
    encoding: "utf-8",
    timeout: 5000,
  });
}

// ===== App =====

const app = new Hono();

app.use(
  "*",
  cors({
    origin: [
      "http://localhost:5174",
      "http://localhost:5173",
      "http://127.0.0.1:5174",
    ],
    allowMethods: ["GET", "POST"],
  }),
);

// GET /api/projects - プロジェクト一覧
app.get("/api/projects", (c) => {
  const dirs = getProjectDirs();
  const projects: ProjectInfo[] = dirs
    .map((dirName) => {
      const entries = readSessionsIndex(dirName);
      const lastModified =
        entries
          .map((e) => e.modified)
          .sort()
          .reverse()[0] ?? "";
      const projectPath = entries[0]?.projectPath ?? "";
      return {
        dirName,
        displayName: normalizeDirName(dirName),
        projectPath,
        sessionCount: entries.length,
        lastModified,
      };
    })
    .filter((p) => p.sessionCount > 0);

  projects.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
  return c.json(projects);
});

// GET /api/sessions?project=<dirName>&limit=50&offset=0 - セッション一覧
app.get("/api/sessions", (c) => {
  const projectFilter = c.req.query("project");
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Number(c.req.query("offset") ?? 0);

  const dirs = projectFilter ? [projectFilter] : getProjectDirs();
  let all: (SessionEntry & {
    projectDirName: string;
    projectDisplayName: string;
  })[] = [];

  for (const dirName of dirs) {
    const entries = readSessionsIndex(dirName);
    for (const e of entries) {
      all.push({
        ...e,
        projectDirName: dirName,
        projectDisplayName: normalizeDirName(dirName),
      });
    }
  }

  // 期間フィルター
  const fromParam = c.req.query("from");
  const toParam = c.req.query("to");
  if (fromParam) {
    const from = new Date(fromParam).getTime();
    if (!Number.isNaN(from))
      all = all.filter((e) => new Date(e.modified).getTime() >= from);
  }
  if (toParam) {
    const to = new Date(toParam).getTime();
    if (!Number.isNaN(to))
      all = all.filter((e) => new Date(e.modified).getTime() <= to);
  }

  all.sort((a, b) => b.modified.localeCompare(a.modified));
  const total = all.length;
  const sliced = all.slice(offset, offset + limit);

  return c.json({ total, offset, limit, sessions: sliced });
});

// GET /api/sessions/:sessionId?project=<dirName> - セッション詳細（会話）
app.get("/api/sessions/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const projectFilter = c.req.query("project");
  const cwdHint = c.req.query("cwd"); // ActiveCardから渡されるプロジェクトパス

  const dirs = projectFilter ? [projectFilter] : getProjectDirs();

  // まず sessions-index.json から探す
  for (const dirName of dirs) {
    const entries = readSessionsIndex(dirName);
    const entry = entries.find((e) => e.sessionId === sessionId);
    if (entry) {
      const messages = await readMessages(entry.fullPath);
      return c.json({ entry, messages });
    }
  }

  // sessions-index.json にない場合、JONLファイルから直接読む
  for (const dirName of dirs) {
    const jsonlPath = join(CLAUDE_DIR, dirName, `${sessionId}.jsonl`);
    if (existsSync(jsonlPath)) {
      const stat = statSync(jsonlPath);
      const messages = await readMessages(jsonlPath);
      const firstUser = messages.find((m) => m.type === "user");
      const firstPrompt = firstUser
        ? extractText(firstUser.message?.content).slice(0, 200)
        : "";
      const entry: SessionEntry = {
        sessionId,
        fullPath: jsonlPath,
        fileMtime: stat.mtimeMs,
        firstPrompt,
        summary: firstPrompt,
        messageCount: messages.filter(
          (m) => m.type === "user" || m.type === "assistant",
        ).length,
        created: stat.birthtime.toISOString(),
        modified: stat.mtime.toISOString(),
        gitBranch: "",
        projectPath: cwdHint || "",
        isSidechain: false,
      };
      return c.json({ entry, messages });
    }
  }

  return c.json({ error: "Session not found" }, 404);
});

// GET /api/search?q=<keyword>&project=<dirName> - 全文検索
app.get("/api/search", async (c) => {
  const keyword = c.req.query("q");
  if (!keyword || keyword.length < 2) {
    return c.json({ error: "Query too short" }, 400);
  }
  const projectFilter = c.req.query("project");
  const dirs = projectFilter ? [projectFilter] : getProjectDirs();
  const lower = keyword.toLowerCase();

  const results: {
    sessionId: string;
    summary: string;
    projectDisplayName: string;
    projectDirName: string;
    projectPath: string;
    modified: string;
    snippets: { snippet: string; timestamp?: string }[];
  }[] = [];

  for (const dirName of dirs) {
    const entries = readSessionsIndex(dirName);
    for (const entry of entries) {
      // まずsummary/firstPromptで軽量マッチ
      const summaryMatch =
        (entry.summary ?? "").toLowerCase().includes(lower) ||
        (entry.firstPrompt ?? "").toLowerCase().includes(lower);

      const jsonlHits = await searchInJsonl(
        entry.fullPath,
        keyword,
        entry.sessionId,
      );

      if (summaryMatch || jsonlHits.length > 0) {
        results.push({
          sessionId: entry.sessionId,
          summary: entry.summary,
          projectDisplayName: normalizeDirName(dirName),
          projectDirName: dirName,
          projectPath: entry.projectPath,
          modified: entry.modified,
          snippets: jsonlHits.map((h) => ({
            snippet: h.snippet,
            timestamp: h.timestamp,
          })),
        });
      }

      if (results.length >= 50) break;
    }
    if (results.length >= 50) break;
  }

  results.sort((a, b) => b.modified.localeCompare(a.modified));
  return c.json({ keyword, results });
});

// GET /api/stats - 統計情報
app.get("/api/stats", (c) => {
  const dirs = getProjectDirs();
  const projectStats: {
    dirName: string;
    displayName: string;
    count: number;
    lastModified: string;
  }[] = [];
  let totalSessions = 0;
  let totalMessages = 0;
  const byMonth: Record<string, number> = {};

  for (const dirName of dirs) {
    const entries = readSessionsIndex(dirName);
    if (entries.length === 0) continue;

    totalSessions += entries.length;
    totalMessages += entries.reduce((s, e) => s + e.messageCount, 0);

    const lastModified =
      entries
        .map((e) => e.modified)
        .sort()
        .reverse()[0] ?? "";
    projectStats.push({
      dirName,
      displayName: normalizeDirName(dirName),
      count: entries.length,
      lastModified,
    });

    for (const e of entries) {
      const month = e.created.slice(0, 7); // YYYY-MM
      byMonth[month] = (byMonth[month] ?? 0) + 1;
    }
  }

  projectStats.sort((a, b) => b.count - a.count);

  const monthlyTrend = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  return c.json({
    totalSessions,
    totalMessages,
    projectCount: projectStats.length,
    topProjects: projectStats.slice(0, 10),
    monthlyTrend,
  });
});

// ===== Active Sessions =====

interface ActiveSession {
  pid: number;
  tty: string;
  cwd: string;
  projectDisplayName: string;
  startedAt: string;
  itermSessionName: string;
}

interface ClaudeProcess {
  pid: number;
  tty: string;
  cwd: string;
  startedAt: string;
  sessionId: string | null; // lsofのtasks/<uuid>から取得
}

/**
 * psコマンド + lsof でClaude Codeプロセスの一覧とcwdを取得
 */
function getClaudeProcesses(): ClaudeProcess[] {
  try {
    const out = execSync("ps -eo pid,tty,lstart,comm | grep -v grep", {
      encoding: "utf-8",
      timeout: 5000,
    });
    const parsed = out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        const pid = Number(parts[0]);
        const tty = parts[1] === "??" ? "" : `/dev/${parts[1]}`;
        const startedAt = parts.slice(2, -1).join(" ");
        const comm = parts[parts.length - 1];
        const baseName = comm.split("/").pop() ?? "";
        return {
          pid,
          tty,
          startedAt,
          cwd: "",
          sessionId: null as string | null,
          baseName,
        };
      })
      .filter((p) => p.tty !== "" && p.baseName === "claude");

    const procs: ClaudeProcess[] = parsed.map(
      ({ baseName: _, ...rest }) => rest,
    );

    // lsofでcwdとtasks/<uuid>（セッションID）を一括取得
    if (procs.length > 0) {
      const pids = procs.map((p) => p.pid).join(",");
      try {
        const lsofOut = execSync(`lsof -a -p ${pids} -Fn 2>/dev/null`, {
          encoding: "utf-8",
          timeout: 5000,
        });
        // lsof出力をPIDごとにパース（pPID\nnFILE\n...形式）
        let currentPid: number | null = null;
        const pidFiles = new Map<number, string[]>();
        for (const line of lsofOut.split("\n")) {
          if (line.startsWith("p")) {
            currentPid = Number(line.slice(1));
            if (!pidFiles.has(currentPid)) pidFiles.set(currentPid, []);
          } else if (line.startsWith("n") && currentPid !== null) {
            pidFiles.get(currentPid)!.push(line.slice(1));
          }
        }

        for (const proc of procs) {
          const files = pidFiles.get(proc.pid) ?? [];
          for (const f of files) {
            // tasks/<uuid> パターンからセッションIDを抽出
            const taskMatch = f.match(/\/tasks\/([a-f0-9-]{36})/i);
            if (taskMatch && !proc.sessionId) {
              proc.sessionId = taskMatch[1];
            }
          }
        }
      } catch {
        // skip
      }

      // cwdは専用のlsofコマンドで確実に取得
      for (const proc of procs) {
        try {
          const cwdOut = execSync(
            `lsof -a -p ${proc.pid} -d cwd -Fn 2>/dev/null | grep "^n" | sed "s/^n//"`,
            { encoding: "utf-8", timeout: 3000 },
          ).trim();
          if (cwdOut && cwdOut !== "/") proc.cwd = cwdOut;
        } catch {
          // skip
        }
      }
    }

    return procs;
  } catch {
    return [];
  }
}

/**
 * iTerm2のセッション一覧をAppleScript経由で取得
 */
function getItermSessions(): Map<string, { name: string; windowId: string }> {
  const result = new Map<string, { name: string; windowId: string }>();
  try {
    const script = `
tell application "iTerm2"
  set resultList to {}
  repeat with w in windows
    set wid to id of w
    repeat with t in tabs of w
      repeat with s in sessions of t
        set ttyName to tty of s
        set sessionName to name of s
        set end of resultList to ttyName & "	" & sessionName & "	" & wid
      end repeat
    end repeat
  end repeat
  set AppleScript's text item delimiters to linefeed
  return resultList as text
end tell`;
    const out = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
      encoding: "utf-8",
      timeout: 5000,
    });
    for (const line of out.trim().split("\n").filter(Boolean)) {
      const [tty, name, windowId] = line.split("\t");
      if (tty) result.set(tty, { name: name ?? "", windowId: windowId ?? "" });
    }
  } catch {
    // iTerm2が起動していない場合はスキップ
  }
  return result;
}

/**
 * CWDからプロジェクト表示名を生成
 */
function cwdToDisplayName(cwd: string): string {
  const resolved = resolveWorktreeCwd(cwd);
  const home = homedir();
  let s = resolved.startsWith(home)
    ? resolved.slice(home.length + 1)
    : resolved;
  s = s.replace(/^ghq\/[^/]+\//, "");
  return s || cwd;
}

/**
 * プロセスの開始時刻をパースしてDateオブジェクトに変換
 * ps -o lstart の出力形式: "Mon Jan  6 12:34:56 2025"
 */
function parseProcessStartTime(lstart: string): Date | null {
  try {
    const d = new Date(lstart);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * birthtimeベースのセッションマッチング
 * プロセス開始時刻に最も近いJSONLファイルを探す（30秒以内）
 */
function matchSessionByBirthtime(
  dirName: string,
  processStartTime: Date,
  excludeSessionIds: Set<string>,
): { sessionId: string; fullPath: string } | null {
  const dir = join(CLAUDE_DIR, dirName);
  if (!existsSync(dir)) return null;
  try {
    const candidates = readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => {
        const full = join(dir, f);
        const stat = statSync(full);
        const sessionId = f.replace(".jsonl", "");
        return {
          sessionId,
          fullPath: full,
          birthtime: stat.birthtime,
          mtime: stat.mtime,
        };
      })
      .filter((c) => !excludeSessionIds.has(c.sessionId));

    const processMs = processStartTime.getTime();

    // プロセス開始時刻との差が最小のファイルを探す（birthtimeで比較、30秒以内）
    let bestMatch: (typeof candidates)[0] | null = null;
    let bestDiff = Infinity;
    for (const c of candidates) {
      const diff = Math.abs(c.birthtime.getTime() - processMs);
      if (diff < 30_000 && diff < bestDiff) {
        bestDiff = diff;
        bestMatch = c;
      }
    }

    // birthtimeで見つからなければ --resume を考慮
    // mtimeがプロセス開始後のファイルのうち最も古いものを候補にする
    if (!bestMatch) {
      const resumeCandidates = candidates
        .filter((c) => c.mtime.getTime() > processMs)
        .sort((a, b) => a.mtime.getTime() - b.mtime.getTime());
      if (resumeCandidates.length > 0) {
        bestMatch = resumeCandidates[0];
      }
    }

    return bestMatch
      ? { sessionId: bestMatch.sessionId, fullPath: bestMatch.fullPath }
      : null;
  } catch {
    return null;
  }
}

// GET /api/active - 起動中のClaudeセッション一覧（会話プレビュー付き）
app.get("/api/active", async (c) => {
  const procs = getClaudeProcesses();
  const itermMap = getItermSessions();

  // PID→セッション情報のマッピングを構築
  const pidSessionMap = new Map<
    number,
    { sessionId: string; fullPath: string }
  >();
  const procDirNames = new Map<number, string>();
  const assignedSessionIds = new Set<string>();

  // Phase 1: lsofで直接取得できたセッションIDをマッピング
  for (const proc of procs) {
    if (!proc.cwd) continue;
    const dirName = cwdToDirName(proc.cwd);
    procDirNames.set(proc.pid, dirName);

    if (proc.sessionId) {
      const jsonlPath = join(CLAUDE_DIR, dirName, `${proc.sessionId}.jsonl`);
      if (existsSync(jsonlPath)) {
        pidSessionMap.set(proc.pid, {
          sessionId: proc.sessionId,
          fullPath: jsonlPath,
        });
        assignedSessionIds.add(proc.sessionId);
      }
    }
  }

  // Phase 2: lsofで取得できなかったプロセスにbirthtimeマッチング
  for (const proc of procs) {
    if (pidSessionMap.has(proc.pid) || !proc.cwd) continue;
    const dirName = procDirNames.get(proc.pid);
    if (!dirName) continue;

    const processStart = parseProcessStartTime(proc.startedAt);
    if (!processStart) continue;

    const matched = matchSessionByBirthtime(
      dirName,
      processStart,
      assignedSessionIds,
    );
    if (matched) {
      pidSessionMap.set(proc.pid, matched);
      assignedSessionIds.add(matched.sessionId);
    }
  }

  // Phase 3: フォールバック - mtime最新のセッションを割り当て
  for (const proc of procs) {
    if (pidSessionMap.has(proc.pid) || !proc.cwd) continue;
    const dirName = procDirNames.get(proc.pid);
    if (!dirName) continue;

    const sessions = findLatestSessionsInDir(
      dirName,
      1 + assignedSessionIds.size,
    );
    const available = sessions.find(
      (s) => !assignedSessionIds.has(s.sessionId),
    );
    if (available) {
      pidSessionMap.set(proc.pid, available);
      assignedSessionIds.add(available.sessionId);
    }
  }

  const activeSessions = await Promise.all(
    procs.map(async (proc) => {
      const iterm = proc.tty ? itermMap.get(proc.tty) : undefined;
      const projectDirName = procDirNames.get(proc.pid) ?? null;
      const sessionInfo = pidSessionMap.get(proc.pid) ?? null;
      let recentMessages: {
        type: "user" | "assistant";
        text: string;
        timestamp?: string;
      }[] = [];
      let links: string[] = [];
      let jiraTickets: { key: string; url: string; title: string }[] = [];

      if (sessionInfo) {
        try {
          const result = await readLastNMessages(sessionInfo.fullPath, 5);
          recentMessages = result.messages;
          links = result.links;
          jiraTickets = result.jiraTickets.map((t) => ({ ...t, title: "" }));
        } catch {
          // skip
        }
      }

      const resolvedCwd = proc.cwd ? resolveWorktreeCwd(proc.cwd) : "";
      return {
        pid: proc.pid,
        tty: proc.tty,
        cwd: resolvedCwd,
        projectDisplayName: resolvedCwd ? cwdToDisplayName(resolvedCwd) : "",
        startedAt: proc.startedAt,
        itermSessionName: iterm?.name ?? "",
        sessionId: sessionInfo?.sessionId ?? null,
        projectDirName,
        recentMessages,
        links,
        jiraTickets,
      };
    }),
  );

  // 全セッションのJiraチケットキーを集約して一括タイトル取得
  const allKeys = [
    ...new Set(activeSessions.flatMap((s) => s.jiraTickets.map((t) => t.key))),
  ];
  const titleMap = await fetchJiraTitles(allKeys);
  for (const session of activeSessions) {
    for (const ticket of session.jiraTickets) {
      ticket.title = titleMap.get(ticket.key) ?? "";
    }
  }

  return c.json(activeSessions);
});

// POST /api/active/focus - iTerm2のセッションにフォーカス
app.post("/api/active/focus", async (c) => {
  const body = await c.req.json<{ tty: string }>();
  const tty = body.tty;
  if (!tty) return c.json({ error: "tty required" }, 400);

  // ttyパスのバリデーション（インジェクション防止）
  if (!/^\/dev\/ttys?\d+$/.test(tty)) {
    return c.json({ error: "Invalid tty format" }, 400);
  }

  try {
    const script = `
tell application "iTerm2"
  activate
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if tty of s is "${tty}" then
          select w
          select t
          select s
          return "ok"
        end if
      end repeat
    end repeat
  end repeat
  return "not_found"
end tell`;
    const result = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    return c.json({ result });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : "AppleScript error" },
      500,
    );
  }
});

// POST /api/active/open-terminal - iTerm2新タブでclaude --resumeを実行
app.post("/api/active/open-terminal", async (c) => {
  const body = await c.req.json<{
    sessionId: string;
    projectPath: string;
  }>();
  const { sessionId, projectPath } = body;
  if (!sessionId) return c.json({ error: "sessionId required" }, 400);

  if (!validateSessionId(sessionId)) {
    return c.json({ error: "Invalid sessionId format" }, 400);
  }

  if (projectPath && !validateProjectPath(projectPath)) {
    return c.json({ error: "Invalid projectPath format" }, 400);
  }

  try {
    const cdCmd = projectPath ? `cd ${escapeForShell(projectPath)} && ` : "";
    runInNewItermTab(`${cdCmd}claude --resume ${sessionId}`);
    return c.json({ result: "ok" });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : "AppleScript error" },
      500,
    );
  }
});

// POST /api/launch - iTerm2新タブで新しいclaudeセッションを起動
app.post("/api/launch", async (c) => {
  const body = await c.req.json<{
    projectPath: string;
    prompt?: string;
  }>();
  const { projectPath, prompt } = body;
  if (!projectPath) return c.json({ error: "projectPath required" }, 400);

  if (!validateProjectPath(projectPath)) {
    return c.json({ error: "Invalid projectPath format" }, 400);
  }

  if (prompt && prompt.length > 500) {
    return c.json({ error: "Prompt too long" }, 400);
  }

  try {
    const claudeCmd = prompt
      ? `claude -p "${escapeForShell(prompt)}"`
      : "claude";
    runInNewItermTab(`cd ${escapeForShell(projectPath)} && ${claudeCmd}`);
    return c.json({ result: "ok" });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : "AppleScript error" },
      500,
    );
  }
});

const server = createServer(getRequestListener(app.fetch));
setupTerminalWebSocket(server);

server.listen(PORT, () => {
  console.log(`Claude Session Board API running on http://localhost:${PORT}`);
  console.log(`Data directory: ${CLAUDE_DIR}`);
});
