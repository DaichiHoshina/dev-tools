export interface ProjectInfo {
  dirName: string;
  displayName: string;
  projectPath: string;
  sessionCount: number;
  lastModified: string;
}

export interface SessionEntry {
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
  projectDirName: string;
  projectDisplayName: string;
}

export interface SessionsResponse {
  total: number;
  offset: number;
  limit: number;
  sessions: SessionEntry[];
}

export interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  /** tool_resultブロックの実行結果 */
  content?: string | ContentBlock[];
}

export interface MessageRecord {
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

export interface SessionDetail {
  entry: SessionEntry;
  messages: MessageRecord[];
}

export interface SearchResult {
  sessionId: string;
  summary: string;
  projectDisplayName: string;
  projectDirName: string;
  projectPath: string;
  modified: string;
  snippets: { snippet: string; timestamp?: string }[];
}

export interface SearchResponse {
  keyword: string;
  results: SearchResult[];
}

export interface RecentMessage {
  type: "user" | "assistant";
  text: string;
  timestamp?: string;
}

export interface ActiveSession {
  pid: number;
  tty: string;
  cwd: string;
  projectDisplayName: string;
  startedAt: string;
  itermSessionName: string;
  sessionId: string | null;
  projectDirName: string | null;
  recentMessages: RecentMessage[];
  links: string[];
  jiraTickets: { key: string; url: string; title: string }[];
}

export interface StatsResponse {
  totalSessions: number;
  totalMessages: number;
  projectCount: number;
  topProjects: {
    dirName: string;
    displayName: string;
    count: number;
    lastModified: string;
  }[];
  monthlyTrend: { month: string; count: number }[];
}
