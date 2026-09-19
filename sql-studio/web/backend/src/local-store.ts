import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import type {
  SavedQuery,
  Dashboard,
  QueryHistoryEntry,
  QueryTemplate,
} from "./types.js";

// Use process.cwd() to avoid path issues when running from different locations (dev vs build)
const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");

const ensureDataDir = () => {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
};

const readJson = <T>(filename: string, fallback: T): T => {
  ensureDataDir();
  const filepath = join(DATA_DIR, filename);
  if (!existsSync(filepath)) return fallback;
  try {
    return JSON.parse(readFileSync(filepath, "utf-8"));
  } catch {
    return fallback;
  }
};

const writeJson = <T>(filename: string, data: T): void => {
  ensureDataDir();
  writeFileSync(join(DATA_DIR, filename), JSON.stringify(data, null, 2));
};

// Queries
export const getQueries = (): SavedQuery[] => readJson("queries.json", []);

export const saveQuery = (query: SavedQuery): void => {
  const queries = getQueries();
  const idx = queries.findIndex((q) => q.id === query.id);
  if (idx >= 0) {
    queries[idx] = query;
  } else {
    queries.push(query);
  }
  writeJson("queries.json", queries);
};

export const deleteQuery = (id: string): boolean => {
  const queries = getQueries();
  const filtered = queries.filter((q) => q.id !== id);
  if (filtered.length === queries.length) return false;
  writeJson("queries.json", filtered);
  return true;
};

// Dashboards
export const getDashboards = (): Dashboard[] => readJson("dashboards.json", []);

export const saveDashboard = (dashboard: Dashboard): void => {
  const dashboards = getDashboards();
  const idx = dashboards.findIndex((d) => d.id === dashboard.id);
  if (idx >= 0) {
    dashboards[idx] = dashboard;
  } else {
    dashboards.push(dashboard);
  }
  writeJson("dashboards.json", dashboards);
};

export const deleteDashboard = (id: string): boolean => {
  const dashboards = getDashboards();
  const filtered = dashboards.filter((d) => d.id !== id);
  if (filtered.length === dashboards.length) return false;
  writeJson("dashboards.json", filtered);
  return true;
};

// Templates
export const getTemplates = (): QueryTemplate[] =>
  readJson("templates.json", []);

export const saveTemplate = (template: QueryTemplate): void => {
  const templates = getTemplates();
  const idx = templates.findIndex((t) => t.id === template.id);
  if (idx >= 0) {
    templates[idx] = template;
  } else {
    templates.push(template);
  }
  writeJson("templates.json", templates);
};

export const deleteTemplate = (id: string): boolean => {
  const templates = getTemplates();
  const filtered = templates.filter((t) => t.id !== id);
  if (filtered.length === templates.length) return false;
  writeJson("templates.json", filtered);
  return true;
};

// History
const MAX_HISTORY = 200;

export const getHistory = (): QueryHistoryEntry[] =>
  readJson("history.json", []);

export const addHistory = (entry: QueryHistoryEntry): void => {
  const history = getHistory();
  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  writeJson("history.json", history);
};
