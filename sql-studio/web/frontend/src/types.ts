export type DataSource = {
  id: number;
  name: string;
  type: string;
};

export type QueryColumn = {
  name: string;
  friendly_name: string;
  type: string;
};

export type QueryResult = {
  columns: QueryColumn[];
  rows: Record<string, unknown>[];
};

export type ExecuteResponse =
  | { status: "done"; data: QueryResult; executionTimeMs: number }
  | { status: "pending"; jobId: string };

export type JobStatus = {
  id: string;
  status: 1 | 2 | 3 | 4 | 5;
  error?: string;
  query_result_id?: number;
};

export type SavedQuery = {
  id: string;
  name: string;
  sql: string;
  dataSourceId: number;
  parameters: QueryParameter[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastExecutedAt?: string;
};

export type QueryParameter = {
  name: string;
  type: "text" | "number" | "date" | "select";
  defaultValue?: string;
  options?: string[];
};

export type QueryHistoryEntry = {
  id: string;
  sql: string;
  dataSourceId: number;
  executedAt: string;
  executionTimeMs: number;
  rowCount: number;
  error?: string;
};

export type TabState = {
  id: string;
  name: string;
  sql: string;
  dataSourceId: number | null;
  result: QueryResult | null;
  executionTimeMs: number | null;
  isExecuting: boolean;
  error: string | null;
  savedQueryId: string | null;
  isDirty: boolean;
};

export type QueryTemplate = {
  id: string;
  name: string;
  sql: string;
  description: string;
  category: string;
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Dashboard = {
  id: string;
  name: string;
  cards: DashboardCard[];
  refreshInterval: number;
  createdAt: string;
  updatedAt: string;
  isRedashImport?: boolean;
};

export type DashboardCard = {
  id: string;
  queryId?: string;
  sql?: string;
  dataSourceId?: number;
  title: string;
  position: { x: number; y: number; w: number; h: number };
  visualization: "table" | "line" | "bar" | "stat";
  /** timePeriodフィルタで表示/非表示を制御する旧方式（card()で使用） */
  timePeriod?: "daily" | "weekly" | "monthly";
  /** D/W/M切替でSQLを動的に差し替える新方式（adaptive()で使用）。timePeriodより優先 */
  sqlByPeriod?: Partial<Record<"daily" | "weekly" | "monthly", string>>;
  /** 同じchartGroupを持つカードはY軸スケールを共有する */
  chartGroup?: string;
};

export type Environment = {
  name: string;
  label: string;
  url: string;
  configured: boolean;
};

export type SchemaTable = {
  schema: string;
  table: string;
  fullName: string;
  columns: string[];
};

export type TableFilter = {
  id: string;
  column: string;
  operator: "=" | "!=" | "LIKE" | ">" | "<" | "IS NULL" | "IS NOT NULL";
  value: string;
};
