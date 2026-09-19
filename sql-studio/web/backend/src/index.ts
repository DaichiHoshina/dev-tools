import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { serve } from "@hono/node-server";
import { RedashClient } from "./redash-client.js";
import * as store from "./local-store.js";
import type {
  SavedQuery,
  Dashboard,
  DashboardCard,
  QueryHistoryEntry,
  QueryTemplate,
} from "./types.js";
import { randomUUID } from "crypto";

// NOTE: currentEnv はプロセスグローバルな状態。単一ユーザー・単一タブ前提のローカル開発ツール。
const ENVIRONMENTS = [
  {
    name: "dev",
    label: "DEV",
    url: process.env.REDASH_URL_DEV || "https://redash-dev.example.com",
    apiKey: process.env.REDASH_API_KEY_DEV || process.env.REDASH_API_KEY || "",
  },
  {
    name: "tes",
    label: "TES",
    url: process.env.REDASH_URL_TES || "https://redash-tes.example.com",
    apiKey: process.env.REDASH_API_KEY_TES || process.env.REDASH_API_KEY || "",
  },
  {
    name: "prd",
    label: "PRD",
    url: process.env.REDASH_URL || "https://redash.example.com",
    apiKey: process.env.REDASH_API_KEY || "",
  },
] as const;

type EnvName = (typeof ENVIRONMENTS)[number]["name"];

const redashClients: Record<EnvName, RedashClient> = {
  dev: new RedashClient(ENVIRONMENTS[0].url, ENVIRONMENTS[0].apiKey),
  tes: new RedashClient(ENVIRONMENTS[1].url, ENVIRONMENTS[1].apiKey),
  prd: new RedashClient(ENVIRONMENTS[2].url, ENVIRONMENTS[2].apiKey),
};

let currentEnv: EnvName = "prd";

function getRedash(): RedashClient {
  return redashClients[currentEnv];
}

const app = new Hono();

// Middleware
app.use("*", secureHeaders());
app.use(
  "*",
  cors({
    origin: ["http://localhost:5175", "http://127.0.0.1:5175"],
    allowMethods: ["GET", "POST", "PUT", "DELETE"],
    allowHeaders: ["Content-Type"],
  }),
);

// --- Config ---
app.get("/api/config", (c) => {
  return c.json({
    configured: getRedash().isConfigured(),
    redashUrl: getRedash().getBaseUrl(),
    currentEnv,
  });
});

// --- Environments ---
app.get("/api/environments", (c) => {
  return c.json({
    current: currentEnv,
    environments: ENVIRONMENTS.map((env) => ({
      name: env.name,
      label: env.label,
      url: env.url,
      configured: redashClients[env.name].isConfigured(),
    })),
  });
});

app.put("/api/environment", async (c) => {
  const body = await c.req.json<{ name: string }>();
  const env = ENVIRONMENTS.find((e) => e.name === body.name);
  if (!env) {
    return c.json({ error: "Unknown environment" }, 400);
  }
  currentEnv = env.name;
  return c.json({ current: currentEnv });
});

// --- Data Sources ---
app.get("/api/data-sources", async (c) => {
  try {
    const sources = await getRedash().getDataSources();
    return c.json(sources);
  } catch (e) {
    console.error("[data-sources]", e);
    return c.json({ error: String(e) }, 500);
  }
});

// --- Data Source Schema ---
app.get("/api/data-sources/:id/schema", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "id must be a positive integer" }, 400);
  }
  try {
    const schema = await getRedash().getDataSourceSchema(id);
    return c.json(schema);
  } catch (e) {
    console.error("[data-source-schema]", e);
    return c.json({ error: String(e) }, 500);
  }
});

// --- Query Execution ---
app.post("/api/execute", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const { dataSourceId, query } = body;

  if (
    typeof dataSourceId !== "number" ||
    !Number.isInteger(dataSourceId) ||
    dataSourceId <= 0
  ) {
    return c.json({ error: "dataSourceId must be a positive integer" }, 400);
  }
  if (typeof query !== "string" || !query.trim()) {
    return c.json({ error: "query must be a non-empty string" }, 400);
  }

  try {
    const startTime = Date.now();
    const result = await getRedash().executeQuery(dataSourceId, query);

    // 即座に結果が返る場合
    if (result.query_result) {
      const elapsed = Date.now() - startTime;
      const data = result.query_result.data;

      store.addHistory({
        id: randomUUID(),
        sql: query,
        dataSourceId,
        executedAt: new Date().toISOString(),
        executionTimeMs: elapsed,
        rowCount: data.rows.length,
      });

      return c.json({
        status: "done",
        data,
        executionTimeMs: elapsed,
      });
    }

    // ジョブとして非同期実行される場合
    if (result.job) {
      return c.json({
        status: "pending",
        jobId: result.job.id,
      });
    }

    return c.json({ error: "Unexpected response from Redash" }, 500);
  } catch (e) {
    console.error("[execute]", e);

    store.addHistory({
      id: randomUUID(),
      sql: query,
      dataSourceId,
      executedAt: new Date().toISOString(),
      executionTimeMs: 0,
      rowCount: 0,
      error: String(e),
    });

    return c.json({ error: String(e) }, 500);
  }
});

// --- Job Polling ---
app.get("/api/jobs/:jobId", async (c) => {
  const jobId = c.req.param("jobId");
  try {
    const { job } = await getRedash().getJob(jobId);
    return c.json(job);
  } catch (e) {
    console.error("[jobs]", e);
    return c.json({ error: String(e) }, 500);
  }
});

// --- Query Results ---
app.get("/api/results/:id", async (c) => {
  const id = Number(c.req.param("id"));
  try {
    const result = await getRedash().getQueryResult(id);
    return c.json(result.query_result.data);
  } catch (e) {
    console.error("[results]", e);
    return c.json({ error: String(e) }, 500);
  }
});

// --- Redash Saved Queries ---
app.get("/api/redash-queries", async (c) => {
  try {
    const q = c.req.query("q");
    const result = await getRedash().getSavedQueries(1, 100, q);
    return c.json(result);
  } catch (e) {
    console.error("[redash-queries]", e);
    return c.json({ error: String(e) }, 500);
  }
});

// --- Import from Redash ---
app.post("/api/import-from-redash", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();

  if (
    !Array.isArray(body.redashQueryIds) ||
    !body.redashQueryIds.every((id) => typeof id === "number")
  ) {
    return c.json({ error: "redashQueryIds must be an array of numbers" }, 400);
  }

  const redashQueryIds = body.redashQueryIds as number[];
  const existingQueries = store.getQueries();
  const existingNames = new Set(existingQueries.map((q) => q.name));

  const imported: SavedQuery[] = [];
  let skipped = 0;

  for (const id of redashQueryIds) {
    try {
      const redashQuery = await getRedash().getQueryById(id);

      if (existingNames.has(redashQuery.name)) {
        skipped++;
        continue;
      }

      const now = new Date().toISOString();
      const query: SavedQuery = {
        id: randomUUID(),
        name: redashQuery.name,
        sql: redashQuery.query,
        dataSourceId: redashQuery.data_source_id,
        parameters: [],
        tags: redashQuery.tags ?? [],
        createdAt: now,
        updatedAt: now,
      };

      store.saveQuery(query);
      existingNames.add(query.name);
      imported.push(query);
    } catch (e) {
      // 個別エラーはスキップ（全体を失敗にしない）
      console.error(`[import-from-redash] Failed to import query id=${id}:`, e);
      skipped++;
    }
  }

  return c.json({
    imported: imported.length,
    skipped,
    items: imported,
  });
});

// --- Create Dashboards from Redash ---
// Redashクエリをタグでグループ分けしてダッシュボードを一括作成する
// タグなし → クエリ名キーワードで分類 → フォールバック「その他」
app.post("/api/create-dashboards-from-redash", async (c) => {
  // Redash全クエリ取得（ページネーションで全件取得）
  let redashQueries: Array<{
    id: number;
    name: string;
    query: string;
    data_source_id: number;
    tags: string[];
  }> = [];

  try {
    let page = 1;
    const pageSize = 250;
    while (true) {
      const result = await getRedash().getSavedQueries(page, pageSize);
      redashQueries.push(...result.results);
      if (redashQueries.length >= result.count) break;
      page++;
    }
  } catch (e) {
    console.error(
      "[create-dashboards-from-redash] Failed to fetch redash queries:",
      e,
    );
    return c.json({ error: String(e) }, 500);
  }

  // 既存のRedashインポートダッシュボードを削除
  const existing = store.getDashboards();
  for (const d of existing) {
    if (d.isRedashImport) {
      store.deleteDashboard(d.id);
    }
  }

  // クエリ名キーワード → グループ名のマッピング
  const KEYWORD_GROUPS: Array<{ keywords: string[]; group: string }> = [
    { keywords: ["購入", "注文", "purchase", "order"], group: "Purchases" },
    { keywords: ["ストア", "店舗", "store", "shop"], group: "Stores" },
    {
      keywords: ["売上", "収益", "revenue", "sales", "amount"],
      group: "Revenue",
    },
    {
      keywords: ["ユーザー", "顧客", "user", "customer", "member"],
      group: "Users",
    },
    {
      keywords: ["配送", "発送", "shipping", "delivery", "carrier"],
      group: "Shipping",
    },
    {
      keywords: ["マーケティング", "キャンペーン", "marketing", "campaign"],
      group: "Marketing",
    },
    { keywords: ["product", "item", "inventory"], group: "Products" },
    { keywords: ["category", "segment", "group"], group: "Segments" },
    { keywords: ["refund", "return", "chargeback"], group: "Refunds" },
    { keywords: ["エラー", "error", "fail"], group: "Errors" },
  ];

  function classifyQuery(query: { name: string; tags: string[] }): string {
    // タグあり → 最初のタグをグループ名として使用
    if (query.tags.length > 0) {
      return query.tags[0];
    }
    // キーワードマッチ
    const lowerName = query.name.toLowerCase();
    for (const { keywords, group } of KEYWORD_GROUPS) {
      if (keywords.some((kw) => lowerName.includes(kw.toLowerCase()))) {
        return group;
      }
    }
    return "その他";
  }

  // グループ分け
  const groups = new Map<string, typeof redashQueries>();
  for (const q of redashQueries) {
    const group = classifyQuery(q);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(q);
  }

  // グループごとにダッシュボード作成
  const COLS = 12; // グリッド列数
  const CARD_W = 6; // カード幅（2カラム配置）
  const CARD_H = 4; // カード高さ

  const createdDashboards: typeof existing = [];

  for (const [groupName, queries] of groups) {
    const cards: DashboardCard[] = queries.map((q, i) => {
      const col = (i % (COLS / CARD_W)) * CARD_W;
      const row = Math.floor(i / (COLS / CARD_W)) * CARD_H;
      return {
        id: randomUUID(),
        title: q.name,
        sql: q.query,
        dataSourceId: q.data_source_id,
        visualization: "table",
        position: { x: col, y: row, w: CARD_W, h: CARD_H },
      };
    });

    const now = new Date().toISOString();
    const dashboard: Dashboard = {
      id: randomUUID(),
      name: groupName,
      cards,
      refreshInterval: 0,
      isRedashImport: true,
      createdAt: now,
      updatedAt: now,
    };

    store.saveDashboard(dashboard);
    createdDashboards.push(dashboard);
  }

  return c.json({
    dashboards: createdDashboards.length,
    groups: Array.from(groups.entries()).map(([name, qs]) => ({
      name,
      count: qs.length,
    })),
  });
});

// --- Local Queries CRUD ---
app.get("/api/queries", (c) => {
  return c.json(store.getQueries());
});

app.post("/api/queries", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  if (typeof body.name !== "string" || !body.name.trim()) {
    return c.json({ error: "name is required" }, 400);
  }
  if (typeof body.sql !== "string") {
    return c.json({ error: "sql is required" }, 400);
  }
  if (typeof body.dataSourceId !== "number") {
    return c.json({ error: "dataSourceId is required" }, 400);
  }
  const now = new Date().toISOString();
  const query: SavedQuery = {
    name: body.name,
    sql: body.sql,
    dataSourceId: body.dataSourceId,
    parameters: Array.isArray(body.parameters) ? body.parameters : [],
    tags: Array.isArray(body.tags) ? body.tags : [],
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  store.saveQuery(query);
  return c.json(query, 201);
});

app.put("/api/queries/:id", async (c) => {
  const id = c.req.param("id");
  const existing = store.getQueries().find((q) => q.id === id);
  if (!existing) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json<Partial<SavedQuery>>();
  const updated: SavedQuery = {
    ...existing,
    ...body,
    id,
    updatedAt: new Date().toISOString(),
  };
  store.saveQuery(updated);
  return c.json(updated);
});

app.delete("/api/queries/:id", (c) => {
  const id = c.req.param("id");
  const deleted = store.deleteQuery(id);
  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true });
});

// --- Dashboards CRUD ---
app.get("/api/dashboards", (c) => {
  return c.json(store.getDashboards());
});

app.post("/api/dashboards", async (c) => {
  const body =
    await c.req.json<Omit<Dashboard, "id" | "createdAt" | "updatedAt">>();
  const now = new Date().toISOString();
  const dashboard: Dashboard = {
    ...body,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  store.saveDashboard(dashboard);
  return c.json(dashboard, 201);
});

app.put("/api/dashboards/:id", async (c) => {
  const id = c.req.param("id");
  const existing = store.getDashboards().find((d) => d.id === id);
  if (!existing) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json<Partial<Dashboard>>();
  const updated: Dashboard = {
    ...existing,
    ...body,
    id,
    updatedAt: new Date().toISOString(),
  };
  store.saveDashboard(updated);
  return c.json(updated);
});

app.delete("/api/dashboards/:id", (c) => {
  const id = c.req.param("id");
  const deleted = store.deleteDashboard(id);
  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true });
});

// --- Templates CRUD ---
app.get("/api/templates", (c) => {
  return c.json(store.getTemplates());
});

app.post("/api/templates", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  if (typeof body.name !== "string" || !body.name.trim()) {
    return c.json({ error: "name is required" }, 400);
  }
  if (typeof body.sql !== "string") {
    return c.json({ error: "sql is required" }, 400);
  }
  const now = new Date().toISOString();
  const template: QueryTemplate = {
    id: randomUUID(),
    name: body.name,
    sql: body.sql,
    description: typeof body.description === "string" ? body.description : "",
    category: typeof body.category === "string" ? body.category : "Custom",
    isBuiltin: false,
    createdAt: now,
    updatedAt: now,
  };
  store.saveTemplate(template);
  return c.json(template, 201);
});

app.put("/api/templates/:id", async (c) => {
  const id = c.req.param("id");
  const existing = store.getTemplates().find((t) => t.id === id);
  if (!existing) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json<Partial<QueryTemplate>>();
  const updated: QueryTemplate = {
    ...existing,
    ...body,
    id,
    isBuiltin: false,
    updatedAt: new Date().toISOString(),
  };
  store.saveTemplate(updated);
  return c.json(updated);
});

app.delete("/api/templates/:id", (c) => {
  const id = c.req.param("id");
  const deleted = store.deleteTemplate(id);
  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true });
});

// --- History ---
app.get("/api/history", (c) => {
  return c.json(store.getHistory());
});

// --- Server ---
const port = 3013;
console.log(`SQL Studio API running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
