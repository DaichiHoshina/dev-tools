// Redash API types
export type RedashDataSource = {
  id: number;
  name: string;
  type: string;
};

export type RedashColumn = {
  name: string;
  friendly_name: string;
  type: string;
};

export type RedashQueryResult = {
  columns: RedashColumn[];
  rows: Record<string, unknown>[];
};

export type RedashJob = {
  id: string;
  status: 1 | 2 | 3 | 4 | 5;
  error?: string;
  query_result_id?: number;
};

// Local storage types
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
  visualization: "table" | "line" | "bar";
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
