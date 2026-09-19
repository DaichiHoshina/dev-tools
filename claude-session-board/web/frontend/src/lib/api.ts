import type {
  ProjectInfo,
  SessionsResponse,
  SessionDetail,
  SearchResponse,
  StatsResponse,
  ActiveSession,
} from "./types";

const BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON response from ${path}`);
  }
}

type PostResult = { result?: string; error?: string };

async function post(path: string, body: unknown): Promise<PostResult> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<PostResult>;
}

export const api = {
  projects: () => get<ProjectInfo[]>("/projects"),

  sessions: (params: {
    project?: string;
    limit?: number;
    offset?: number;
    from?: string;
    to?: string;
  }) => {
    const q = new URLSearchParams();
    if (params.project) q.set("project", params.project);
    if (params.limit != null) q.set("limit", String(params.limit));
    if (params.offset != null) q.set("offset", String(params.offset));
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
    const qs = q.toString();
    return get<SessionsResponse>(`/sessions${qs ? `?${qs}` : ""}`);
  },

  session: (sessionId: string, project?: string, cwd?: string) => {
    const q = new URLSearchParams();
    if (project) q.set("project", project);
    if (cwd) q.set("cwd", cwd);
    const qs = q.toString();
    return get<SessionDetail>(`/sessions/${sessionId}${qs ? `?${qs}` : ""}`);
  },

  search: (keyword: string, project?: string) => {
    const q = new URLSearchParams({ q: keyword });
    if (project) q.set("project", project);
    return get<SearchResponse>(`/search?${q.toString()}`);
  },

  stats: () => get<StatsResponse>("/stats"),

  active: () => get<ActiveSession[]>("/active"),

  focusSession: (tty: string) => post("/active/focus", { tty }),

  openTerminal: (sessionId: string, projectPath: string) =>
    post("/active/open-terminal", { sessionId, projectPath }),

  launchSession: (projectPath: string, prompt?: string) =>
    post("/launch", { projectPath, prompt: prompt || undefined }),
};
