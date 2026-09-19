import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  VscRefresh,
  VscDashboard,
  VscGraph,
  VscGraphLine,
  VscPackage,
  VscDebugRestart,
  VscCloudDownload,
  VscLoading,
  VscChevronDown,
  VscChevronRight,
} from "react-icons/vsc";
import DashboardCard from "./DashboardCard";
import type {
  Dashboard as DashboardType,
  DashboardCard as DashboardCardType,
  DataSource,
  SavedQuery,
} from "../types";

type Props = {
  queries: SavedQuery[];
  dataSources: DataSource[];
};

type PresetDashboard = Omit<DashboardType, "id" | "createdAt" | "updatedAt">;

type Page = {
  name: string;
  icon: React.ReactNode;
  sections: string[];
  hasPeriodFilter?: boolean;
};

const PAGES: Page[] = [
  {
    name: "Orders",
    icon: <VscGraph size={12} />,
    sections: ["Overview", "Timeline", "Segments"],
    hasPeriodFilter: true,
  },
  {
    name: "Users",
    icon: <VscPackage size={12} />,
    sections: ["Users", "New Users"],
    hasPeriodFilter: false,
  },
  {
    name: "Revenue",
    icon: <VscGraphLine size={12} />,
    sections: ["Revenue", "Retention"],
    hasPeriodFilter: true,
  },
];

function card(
  title: string,
  sql: string,
  dataSourceId: number,
  visualization: DashboardCardType["visualization"],
  x: number,
  y: number,
  w: number,
  h: number,
  timePeriod?: DashboardCardType["timePeriod"],
): DashboardCardType {
  return {
    id: crypto.randomUUID(),
    title,
    sql,
    dataSourceId,
    visualization,
    position: { x, y, w, h },
    timePeriod,
  };
}

// D/W/M切替でSQLが動的に変わるカードを生成。sqlはdaily優先でフォールバック初期値を設定。
function adaptive(
  title: string,
  sqlByPeriod: Partial<Record<"daily" | "weekly" | "monthly", string>>,
  dataSourceId: number,
  visualization: DashboardCardType["visualization"],
  x: number,
  y: number,
  w: number,
  h: number,
  chartGroup?: string,
): DashboardCardType {
  return {
    id: crypto.randomUUID(),
    title,
    sql: sqlByPeriod.daily ?? sqlByPeriod.weekly ?? sqlByPeriod.monthly,
    sqlByPeriod,
    dataSourceId,
    visualization,
    position: { x, y, w, h },
    chartGroup,
  };
}

function createPresetDashboards(dsId: number): PresetDashboard[] {
  return [
    // ─── 1. Overview ───────────────────────────────
    {
      name: "Overview",
      refreshInterval: 60,
      cards: [
        // KPI row (4 cards x 3 cols)
        card(
          "Total Orders (All Time)",
          "SELECT COUNT(*) AS total_orders FROM public.orders",
          dsId,
          "stat",
          0,
          0,
          3,
          4,
        ),
        card(
          "Today's Orders",
          "SELECT COUNT(*) AS todays_orders FROM public.orders WHERE DATE(created_at) = CURRENT_DATE",
          dsId,
          "stat",
          3,
          0,
          3,
          4,
        ),
        card(
          "Total Revenue (All Time)",
          "SELECT SUM(amount) AS total_revenue FROM public.orders WHERE status = 'completed'",
          dsId,
          "stat",
          6,
          0,
          3,
          4,
        ),
        card(
          "Total Users (All Time)",
          "SELECT COUNT(*) AS total_users FROM public.users",
          dsId,
          "stat",
          9,
          0,
          3,
          4,
        ),
        // Charts
        card(
          "Daily Orders (Last 30 Days)",
          "SELECT DATE(created_at) AS day, COUNT(*) AS cnt\nFROM public.orders\nWHERE created_at >= CURRENT_DATE - INTERVAL '30 days'\nGROUP BY day ORDER BY day;",
          dsId,
          "line",
          0,
          4,
          6,
          4,
          "monthly",
        ),
        card(
          "Orders by Status (All Time)",
          "SELECT status, COUNT(*) AS cnt\nFROM public.orders\nGROUP BY status ORDER BY cnt DESC;",
          dsId,
          "bar",
          6,
          4,
          6,
          4,
          "monthly",
        ),
        card(
          "Orders by Product Category",
          "SELECT p.name AS product, COUNT(oi.id) AS cnt\nFROM public.order_items AS oi\nJOIN public.products AS p ON oi.product_id = p.id\nGROUP BY p.name ORDER BY cnt DESC\nLIMIT 10;",
          dsId,
          "bar",
          0,
          8,
          6,
          4,
          "monthly",
        ),
        card(
          "Recent Orders (Last 50)",
          "SELECT o.id, u.name AS user, u.email,\n  o.status, o.amount, o.created_at\nFROM public.orders AS o\nJOIN public.users AS u ON o.user_id = u.id\nORDER BY o.created_at DESC LIMIT 50;",
          dsId,
          "table",
          6,
          8,
          6,
          4,
          "daily",
        ),
      ],
    },

    // ─── 2. Timeline ───────────────────────────────
    {
      name: "Timeline",
      refreshInterval: 0,
      cards: [
        adaptive(
          "Order Volume Trend",
          {
            daily:
              "SELECT DATE(created_at) AS day, COUNT(*) AS cnt\nFROM public.orders\nWHERE created_at >= CURRENT_DATE - INTERVAL '7 days'\nGROUP BY day ORDER BY day;",
            weekly:
              "SELECT DATE_TRUNC('week', created_at)::date AS week, COUNT(*) AS cnt\nFROM public.orders\nWHERE created_at >= CURRENT_DATE - INTERVAL '12 weeks'\nGROUP BY week ORDER BY week;",
            monthly:
              "SELECT DATE_TRUNC('month', created_at)::date AS month, COUNT(*) AS cnt\nFROM public.orders\nWHERE created_at >= CURRENT_DATE - INTERVAL '12 months'\nGROUP BY month ORDER BY month;",
          },
          dsId,
          "bar",
          0,
          0,
          12,
          4,
        ),
        adaptive(
          "Revenue Trend",
          {
            daily:
              "SELECT DATE(created_at) AS day, SUM(amount) AS total\nFROM public.orders\nWHERE created_at >= CURRENT_DATE - INTERVAL '7 days'\n  AND status = 'completed'\nGROUP BY day ORDER BY day;",
            weekly:
              "SELECT DATE_TRUNC('week', created_at)::date AS week, SUM(amount) AS total\nFROM public.orders\nWHERE created_at >= CURRENT_DATE - INTERVAL '12 weeks'\n  AND status = 'completed'\nGROUP BY week ORDER BY week;",
            monthly:
              "SELECT DATE_TRUNC('month', created_at)::date AS month, SUM(amount) AS total\nFROM public.orders\nWHERE created_at >= CURRENT_DATE - INTERVAL '12 months'\n  AND status = 'completed'\nGROUP BY month ORDER BY month;",
          },
          dsId,
          "bar",
          0,
          4,
          6,
          4,
        ),
        adaptive(
          "Order Activity Pattern",
          {
            daily:
              "SELECT EXTRACT(HOUR FROM created_at) AS hour, COUNT(*) AS cnt\nFROM public.orders\nGROUP BY hour ORDER BY hour;",
            weekly:
              "SELECT EXTRACT(DOW FROM created_at) AS dow, COUNT(*) AS cnt\nFROM public.orders\nGROUP BY dow ORDER BY dow;",
            monthly:
              "SELECT DATE_TRUNC('month', created_at)::date AS month, COUNT(*) AS cnt\nFROM public.orders\nWHERE created_at >= CURRENT_DATE - INTERVAL '12 months'\nGROUP BY month ORDER BY month;",
          },
          dsId,
          "bar",
          6,
          4,
          6,
          4,
        ),
      ],
    },

    // ─── 3. Segments ───────────────────────────────
    {
      name: "Segments",
      refreshInterval: 0,
      cards: [
        adaptive(
          "Orders by Status",
          {
            daily:
              "SELECT status, COUNT(*) AS cnt\nFROM public.orders\nWHERE DATE(created_at) = CURRENT_DATE\nGROUP BY status ORDER BY cnt DESC;",
            weekly:
              "SELECT status, COUNT(*) AS cnt\nFROM public.orders\nWHERE created_at >= CURRENT_DATE - INTERVAL '12 weeks'\nGROUP BY status ORDER BY cnt DESC;",
            monthly:
              "SELECT status, COUNT(*) AS cnt\nFROM public.orders\nGROUP BY status ORDER BY cnt DESC;",
          },
          dsId,
          "bar",
          0,
          0,
          6,
          4,
        ),
        adaptive(
          "Top Products by Order Count",
          {
            daily:
              "SELECT p.name AS product, COUNT(oi.id) AS cnt\nFROM public.order_items AS oi\nJOIN public.products AS p ON oi.product_id = p.id\nJOIN public.orders AS o ON oi.order_id = o.id\nWHERE DATE(o.created_at) = CURRENT_DATE\nGROUP BY p.name ORDER BY cnt DESC LIMIT 10;",
            weekly:
              "SELECT p.name AS product, COUNT(oi.id) AS cnt\nFROM public.order_items AS oi\nJOIN public.products AS p ON oi.product_id = p.id\nJOIN public.orders AS o ON oi.order_id = o.id\nWHERE o.created_at >= CURRENT_DATE - INTERVAL '12 weeks'\nGROUP BY p.name ORDER BY cnt DESC LIMIT 10;",
            monthly:
              "SELECT p.name AS product, COUNT(oi.id) AS cnt\nFROM public.order_items AS oi\nJOIN public.products AS p ON oi.product_id = p.id\nGROUP BY p.name ORDER BY cnt DESC LIMIT 10;",
          },
          dsId,
          "bar",
          6,
          0,
          6,
          4,
        ),
        adaptive(
          "Order Status Breakdown Over Time",
          {
            daily:
              "SELECT DATE(created_at) AS day, status, COUNT(*) AS cnt\nFROM public.orders\nWHERE DATE(created_at) = CURRENT_DATE\nGROUP BY day, status ORDER BY day DESC;",
            weekly:
              "SELECT DATE_TRUNC('week', created_at)::date AS week,\n  status, COUNT(*) AS cnt\nFROM public.orders\nWHERE created_at >= CURRENT_DATE - INTERVAL '12 weeks'\nGROUP BY week, status ORDER BY week DESC;",
            monthly:
              "SELECT DATE_TRUNC('month', created_at)::date AS month,\n  status, COUNT(*) AS cnt\nFROM public.orders\nWHERE created_at >= CURRENT_DATE - INTERVAL '12 months'\nGROUP BY month, status ORDER BY month DESC;",
          },
          dsId,
          "table",
          0,
          4,
          12,
          4,
        ),
        adaptive(
          "Revenue by Product",
          {
            daily:
              "SELECT p.name AS product, SUM(oi.quantity * oi.unit_price) AS revenue\nFROM public.order_items AS oi\nJOIN public.products AS p ON oi.product_id = p.id\nJOIN public.orders AS o ON oi.order_id = o.id\nWHERE DATE(o.created_at) = CURRENT_DATE\nGROUP BY p.name ORDER BY revenue DESC;",
            weekly:
              "SELECT p.name AS product, SUM(oi.quantity * oi.unit_price) AS revenue\nFROM public.order_items AS oi\nJOIN public.products AS p ON oi.product_id = p.id\nJOIN public.orders AS o ON oi.order_id = o.id\nWHERE o.created_at >= CURRENT_DATE - INTERVAL '12 weeks'\nGROUP BY p.name ORDER BY revenue DESC;",
            monthly:
              "SELECT p.name AS product, SUM(oi.quantity * oi.unit_price) AS revenue\nFROM public.order_items AS oi\nJOIN public.products AS p ON oi.product_id = p.id\nGROUP BY p.name ORDER BY revenue DESC;",
          },
          dsId,
          "bar",
          0,
          8,
          12,
          4,
        ),
      ],
    },

    // ─── 4. Users ──────────────────────────────────
    {
      name: "Users",
      refreshInterval: 0,
      cards: [
        card(
          "Top Users by Order Count",
          "SELECT u.name AS user, u.email, COUNT(o.id) AS order_count\nFROM public.orders AS o\nJOIN public.users AS u ON o.user_id = u.id\nGROUP BY u.id, u.name, u.email\nORDER BY order_count DESC\nLIMIT 20;",
          dsId,
          "bar",
          0,
          0,
          12,
          4,
        ),
        card(
          "User Orders by Status",
          "SELECT u.name AS user, o.status, COUNT(*) AS cnt\nFROM public.orders AS o\nJOIN public.users AS u ON o.user_id = u.id\nGROUP BY u.id, u.name, o.status\nORDER BY u.name, cnt DESC;",
          dsId,
          "table",
          0,
          4,
          6,
          4,
        ),
        card(
          "User Orders (Last 30 Days)",
          "SELECT u.name AS user, DATE(o.created_at) AS day, COUNT(*) AS cnt\nFROM public.orders AS o\nJOIN public.users AS u ON o.user_id = u.id\nWHERE o.created_at >= CURRENT_DATE - INTERVAL '30 days'\nGROUP BY u.id, u.name, day\nORDER BY day DESC, cnt DESC\nLIMIT 300;",
          dsId,
          "table",
          6,
          4,
          6,
          4,
        ),
        card(
          "User List",
          "SELECT u.id, u.name, u.email,\n       COUNT(o.id) AS order_count,\n       SUM(o.amount) AS total_spent\nFROM public.users AS u\nLEFT JOIN public.orders AS o ON o.user_id = u.id\nGROUP BY u.id, u.name, u.email\nORDER BY total_spent DESC;",
          dsId,
          "table",
          0,
          8,
          12,
          4,
        ),
      ],
    },

    // ─── 5. Revenue ────────────────────────────────
    {
      name: "Revenue",
      refreshInterval: 0,
      cards: [
        adaptive(
          "Revenue Trend",
          {
            daily:
              "SELECT DATE(created_at) AS day,\n  SUM(amount) AS total\nFROM public.orders\nWHERE created_at >= CURRENT_DATE - INTERVAL '7 days'\n  AND status = 'completed'\nGROUP BY day ORDER BY day;",
            weekly:
              "SELECT DATE_TRUNC('week', created_at)::date AS week,\n  SUM(amount) AS total\nFROM public.orders\nWHERE created_at >= CURRENT_DATE - INTERVAL '12 weeks'\n  AND status = 'completed'\nGROUP BY week ORDER BY week;",
            monthly:
              "SELECT DATE_TRUNC('month', created_at)::date AS month,\n  SUM(amount) AS total\nFROM public.orders\nWHERE status = 'completed'\n  AND created_at >= CURRENT_DATE - INTERVAL '12 months'\nGROUP BY month ORDER BY month;",
          },
          dsId,
          "line",
          0,
          0,
          12,
          4,
        ),
        adaptive(
          "Active Users",
          {
            daily:
              "SELECT DATE(created_at) AS day,\n  COUNT(DISTINCT user_id) AS active_users\nFROM public.orders\nWHERE created_at >= CURRENT_DATE - INTERVAL '7 days'\nGROUP BY day ORDER BY day;",
            weekly:
              "SELECT DATE_TRUNC('week', created_at)::date AS week,\n  COUNT(DISTINCT user_id) AS active_users\nFROM public.orders\nWHERE created_at >= CURRENT_DATE - INTERVAL '12 weeks'\nGROUP BY week ORDER BY week;",
            monthly:
              "SELECT DATE_TRUNC('month', created_at)::date AS month,\n  COUNT(DISTINCT user_id) AS active_users\nFROM public.orders\nWHERE created_at >= CURRENT_DATE - INTERVAL '12 months'\nGROUP BY month ORDER BY month;",
          },
          dsId,
          "line",
          0,
          4,
          6,
          4,
        ),
        adaptive(
          "Average Order Value",
          {
            daily:
              "SELECT ROUND(AVG(amount)::numeric, 2) AS avg_order_value\nFROM public.orders\nWHERE status = 'completed'\n  AND created_at >= CURRENT_DATE - INTERVAL '7 days';",
            weekly:
              "SELECT ROUND(AVG(amount)::numeric, 2) AS avg_order_value\nFROM public.orders\nWHERE status = 'completed'\n  AND created_at >= CURRENT_DATE - INTERVAL '12 weeks';",
            monthly:
              "SELECT ROUND(AVG(amount)::numeric, 2) AS avg_order_value\nFROM public.orders\nWHERE status = 'completed'\n  AND created_at >= CURRENT_DATE - INTERVAL '12 months';",
          },
          dsId,
          "stat",
          6,
          4,
          3,
          4,
        ),
        adaptive(
          "Total Items Sold",
          {
            daily:
              "SELECT SUM(oi.quantity) AS total_quantity\nFROM public.order_items AS oi\nJOIN public.orders AS o ON o.id = oi.order_id\nWHERE o.status = 'completed'\n  AND o.created_at >= CURRENT_DATE - INTERVAL '7 days';",
            weekly:
              "SELECT SUM(oi.quantity) AS total_quantity\nFROM public.order_items AS oi\nJOIN public.orders AS o ON o.id = oi.order_id\nWHERE o.status = 'completed'\n  AND o.created_at >= CURRENT_DATE - INTERVAL '12 weeks';",
            monthly:
              "SELECT SUM(oi.quantity) AS total_quantity\nFROM public.order_items AS oi\nJOIN public.orders AS o ON o.id = oi.order_id\nWHERE o.status = 'completed'\n  AND o.created_at >= CURRENT_DATE - INTERVAL '12 months';",
          },
          dsId,
          "stat",
          9,
          4,
          3,
          4,
        ),
        adaptive(
          "Top Users by Revenue",
          {
            daily:
              "SELECT u.name AS user,\n  SUM(o.amount) AS total\nFROM public.orders AS o\nJOIN public.users AS u ON o.user_id = u.id\nWHERE o.status = 'completed'\n  AND o.created_at >= CURRENT_DATE - INTERVAL '7 days'\nGROUP BY u.id, u.name\nORDER BY total DESC LIMIT 10;",
            weekly:
              "SELECT u.name AS user,\n  SUM(o.amount) AS total\nFROM public.orders AS o\nJOIN public.users AS u ON o.user_id = u.id\nWHERE o.status = 'completed'\n  AND o.created_at >= CURRENT_DATE - INTERVAL '12 weeks'\nGROUP BY u.id, u.name\nORDER BY total DESC LIMIT 10;",
            monthly:
              "SELECT u.name AS user,\n  SUM(o.amount) AS total\nFROM public.orders AS o\nJOIN public.users AS u ON o.user_id = u.id\nWHERE o.status = 'completed'\nGROUP BY u.id, u.name\nORDER BY total DESC LIMIT 10;",
          },
          dsId,
          "bar",
          0,
          8,
          12,
          4,
        ),
      ],
    },

    // ─── 6. Retention ──────────────────────────────
    {
      name: "Retention",
      refreshInterval: 0,
      cards: [
        adaptive(
          "Repeat Buyers",
          {
            daily:
              "SELECT COUNT(*) AS repeat_buyers\nFROM (\n  SELECT user_id\n  FROM public.orders\n  WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'\n  GROUP BY user_id\n  HAVING COUNT(*) >= 2\n) t;",
            weekly:
              "SELECT COUNT(*) AS repeat_buyers\nFROM (\n  SELECT user_id\n  FROM public.orders\n  WHERE created_at >= CURRENT_DATE - INTERVAL '12 weeks'\n  GROUP BY user_id\n  HAVING COUNT(*) >= 2\n) t;",
            monthly:
              "SELECT COUNT(*) AS repeat_buyers\nFROM (\n  SELECT user_id\n  FROM public.orders\n  WHERE created_at >= CURRENT_DATE - INTERVAL '12 months'\n  GROUP BY user_id\n  HAVING COUNT(*) >= 2\n) t;",
          },
          dsId,
          "stat",
          0,
          0,
          3,
          4,
        ),
        adaptive(
          "Order Frequency Distribution",
          {
            daily:
              "SELECT order_count, COUNT(*) AS user_count\nFROM (\n  SELECT user_id, COUNT(*) AS order_count\n  FROM public.orders\n  WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'\n  GROUP BY user_id\n) t\nGROUP BY order_count ORDER BY order_count;",
            weekly:
              "SELECT order_count, COUNT(*) AS user_count\nFROM (\n  SELECT user_id, COUNT(*) AS order_count\n  FROM public.orders\n  WHERE created_at >= CURRENT_DATE - INTERVAL '12 weeks'\n  GROUP BY user_id\n) t\nGROUP BY order_count ORDER BY order_count;",
            monthly:
              "SELECT order_count, COUNT(*) AS user_count\nFROM (\n  SELECT user_id, COUNT(*) AS order_count\n  FROM public.orders\n  WHERE created_at >= CURRENT_DATE - INTERVAL '12 months'\n  GROUP BY user_id\n) t\nGROUP BY order_count ORDER BY order_count;",
          },
          dsId,
          "bar",
          3,
          0,
          5,
          4,
        ),
        adaptive(
          "New vs Returning",
          {
            daily:
              "SELECT DATE(o.created_at) AS day,\n  SUM(CASE WHEN prev.user_id IS NULL THEN 1 ELSE 0 END) AS new_users,\n  SUM(CASE WHEN prev.user_id IS NOT NULL THEN 1 ELSE 0 END) AS returning_users\nFROM public.orders AS o\nLEFT JOIN (\n  SELECT DISTINCT user_id,\n    DATE(created_at) AS day\n  FROM public.orders\n) AS prev ON prev.user_id = o.user_id\n  AND prev.day < DATE(o.created_at)\nWHERE o.created_at >= CURRENT_DATE - INTERVAL '7 days'\nGROUP BY day ORDER BY day DESC;",
            weekly:
              "SELECT DATE_TRUNC('week', o.created_at)::date AS week,\n  SUM(CASE WHEN prev.user_id IS NULL THEN 1 ELSE 0 END) AS new_users,\n  SUM(CASE WHEN prev.user_id IS NOT NULL THEN 1 ELSE 0 END) AS returning_users\nFROM public.orders AS o\nLEFT JOIN (\n  SELECT DISTINCT user_id,\n    DATE_TRUNC('week', created_at)::date AS week\n  FROM public.orders\n) AS prev ON prev.user_id = o.user_id\n  AND prev.week < DATE_TRUNC('week', o.created_at)::date\nWHERE o.created_at >= CURRENT_DATE - INTERVAL '12 weeks'\nGROUP BY week ORDER BY week DESC;",
            monthly:
              "SELECT DATE_TRUNC('month', o.created_at)::date AS month,\n  SUM(CASE WHEN prev.user_id IS NULL THEN 1 ELSE 0 END) AS new_users,\n  SUM(CASE WHEN prev.user_id IS NOT NULL THEN 1 ELSE 0 END) AS returning_users\nFROM public.orders AS o\nLEFT JOIN (\n  SELECT DISTINCT user_id,\n    DATE_TRUNC('month', created_at)::date AS month\n  FROM public.orders\n) AS prev ON prev.user_id = o.user_id\n  AND prev.month < DATE_TRUNC('month', o.created_at)::date\nWHERE o.created_at >= CURRENT_DATE - INTERVAL '12 months'\nGROUP BY month ORDER BY month;",
          },
          dsId,
          "table",
          8,
          0,
          4,
          4,
        ),
      ],
    },

    // ─── 7. New Users ──────────────────────────────
    {
      name: "New Users",
      refreshInterval: 60,
      cards: [
        card(
          "New Signups (Last 30 Days)",
          "SELECT DATE(created_at) AS day, COUNT(*) AS cnt\nFROM public.users\nWHERE created_at >= CURRENT_DATE - INTERVAL '30 days'\nGROUP BY day ORDER BY day;",
          dsId,
          "line",
          0,
          0,
          12,
          4,
        ),
        card(
          "Weekly New Signups (Last 12 Weeks)",
          "SELECT DATE_TRUNC('week', created_at)::date AS week, COUNT(*) AS cnt\nFROM public.users\nWHERE created_at >= CURRENT_DATE - INTERVAL '12 weeks'\nGROUP BY week ORDER BY week;",
          dsId,
          "bar",
          0,
          4,
          6,
          4,
        ),
        card(
          "Monthly New Signups (Last 12 Months)",
          "SELECT DATE_TRUNC('month', created_at)::date AS month, COUNT(*) AS cnt\nFROM public.users\nWHERE created_at >= CURRENT_DATE - INTERVAL '12 months'\nGROUP BY month ORDER BY month;",
          dsId,
          "bar",
          6,
          4,
          6,
          4,
        ),
        card(
          "Users with No Orders",
          "SELECT COUNT(*) AS cnt\nFROM public.users AS u\nLEFT JOIN public.orders AS o ON o.user_id = u.id\nWHERE o.id IS NULL;",
          dsId,
          "stat",
          0,
          8,
          6,
          4,
        ),
        card(
          "Recently Registered Users (Last 50)",
          "SELECT u.id, u.name, u.email, u.created_at\nFROM public.users AS u\nORDER BY u.created_at DESC LIMIT 50;",
          dsId,
          "table",
          6,
          8,
          6,
          4,
        ),
      ],
    },
  ];
}

// createRedashDashboards が生成するダッシュボード名一覧（初期化時に既存分を削除するために使用）
const BUILTIN_REDASH_NAMES = new Set([
  "Sales KPI",
  "Products",
  "Activity",
  "Transactions",
  "Engagement",
]);

function createRedashDashboards(dsId: number): PresetDashboard[] {
  return [
    // ─── Sales KPI ───────────────────────────────────────────
    {
      name: "Sales KPI",
      isRedashImport: true,
      refreshInterval: 0,
      cards: [
        card(
          "Total Revenue (All Time)",
          `SELECT
  COUNT(id) AS order_count,
  SUM(amount) AS total_revenue
FROM public.orders
WHERE status IN ('completed', 'shipped')`,
          dsId,
          "stat",
          0,
          0,
          4,
          2,
        ),
        card(
          "Revenue This Month",
          `SELECT
  COUNT(id) AS order_count,
  SUM(amount) AS total_revenue
FROM public.orders
WHERE status IN ('completed', 'shipped')
  AND created_at BETWEEN DATE_TRUNC('month', NOW())
  AND DATE_TRUNC('month', NOW()) + INTERVAL '1 month'`,
          dsId,
          "stat",
          4,
          0,
          4,
          2,
        ),
        card(
          "Orders This Month",
          `SELECT
  COUNT(id) AS order_count,
  SUM(amount) AS total_amount
FROM public.orders
WHERE created_at BETWEEN DATE_TRUNC('month', NOW())
  AND DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
  AND status IN ('completed', 'shipped')`,
          dsId,
          "stat",
          8,
          0,
          4,
          2,
        ),
        card(
          "Monthly Revenue Trend",
          `SELECT
  DATE_TRUNC('month', created_at)::date AS month,
  COUNT(id) AS order_count,
  SUM(amount) AS total_revenue
FROM public.orders
WHERE status IN ('completed', 'shipped')
GROUP BY month
ORDER BY month DESC`,
          dsId,
          "line",
          0,
          2,
          8,
          4,
        ),
        card(
          "Gross Margin This Month",
          `SELECT
  SUM(oi.unit_price * oi.quantity) AS gross_revenue,
  SUM(p.cost * oi.quantity) AS total_cost,
  ROUND(
    ((SUM(oi.unit_price * oi.quantity) - SUM(p.cost * oi.quantity))
      / NULLIF(SUM(oi.unit_price * oi.quantity), 0)) * 100, 1
  ) AS margin_pct
FROM public.order_items AS oi
JOIN public.products AS p ON p.id = oi.product_id
JOIN public.orders AS o ON o.id = oi.order_id
WHERE o.status IN ('completed', 'shipped')
  AND o.created_at BETWEEN DATE_TRUNC('month', NOW())
  AND DATE_TRUNC('month', NOW()) + INTERVAL '1 month'`,
          dsId,
          "stat",
          8,
          2,
          4,
          4,
        ),
      ],
    },

    // ─── Products ─────────────────────────────────────────────
    {
      name: "Products",
      isRedashImport: true,
      refreshInterval: 0,
      cards: [
        card(
          "Cumulative Product Registrations",
          `WITH RECURSIVE calendar AS (
    SELECT MIN(DATE(created_at)) AS date FROM public.products
    UNION ALL
    SELECT date + INTERVAL '1 day'
    FROM calendar
    WHERE date + INTERVAL '1 day' <= (SELECT MAX(DATE(created_at)) FROM public.products)
),
daily_counts AS (
    SELECT
        c.date AS registration_date,
        COALESCE(COUNT(p.created_at), 0) AS daily_count
    FROM calendar c
    LEFT JOIN public.products p ON DATE(p.created_at) = c.date
    GROUP BY c.date
    ORDER BY c.date
),
cumulative_counts AS (
    SELECT
        registration_date,
        daily_count,
        SUM(daily_count) OVER (ORDER BY registration_date) AS cumulative_total
    FROM daily_counts
)
SELECT registration_date, cumulative_total FROM cumulative_counts`,
          dsId,
          "line",
          0,
          0,
          12,
          4,
        ),
        card(
          "Products with No Orders",
          `SELECT
  p.name AS product_name,
  p.created_at
FROM public.products AS p
LEFT JOIN public.order_items AS oi ON oi.product_id = p.id
WHERE oi.id IS NULL
ORDER BY p.created_at DESC`,
          dsId,
          "table",
          0,
          4,
          6,
          4,
        ),
        card(
          "Top Products This Month",
          `SELECT
  p.name AS product_name,
  COUNT(oi.id) AS order_count
FROM public.products AS p
LEFT JOIN public.order_items AS oi ON oi.product_id = p.id
LEFT JOIN public.orders AS o ON o.id = oi.order_id
WHERE o.created_at >= DATE_TRUNC('month', NOW())
ORDER BY order_count DESC`,
          dsId,
          "table",
          6,
          4,
          6,
          4,
        ),
        card(
          "Low Stock Products",
          `SELECT
  p.name AS product_name,
  p.stock,
  COUNT(oi.id) AS recent_orders
FROM public.products AS p
LEFT JOIN public.order_items AS oi ON oi.product_id = p.id
LEFT JOIN public.orders AS o ON o.id = oi.order_id
  AND o.created_at >= NOW() - INTERVAL '30 days'
WHERE p.stock < 10
GROUP BY p.id, p.name, p.stock
ORDER BY p.stock ASC`,
          dsId,
          "table",
          0,
          8,
          6,
          4,
        ),
        card(
          "Inactive Products (No Orders Last Month)",
          `SELECT
  p.name AS product_name,
  MAX(o.created_at) AS last_order_date,
  COUNT(oi.id) AS total_orders
FROM public.products AS p
LEFT JOIN public.order_items AS oi ON oi.product_id = p.id
LEFT JOIN public.orders AS o ON o.id = oi.order_id
GROUP BY p.id, p.name
HAVING MAX(o.created_at) < NOW() - INTERVAL '1 month'
   OR MAX(o.created_at) IS NULL
ORDER BY last_order_date DESC NULLS LAST`,
          dsId,
          "table",
          6,
          8,
          6,
          4,
        ),
      ],
    },

    // ─── Activity ─────────────────────────────────────────────
    {
      name: "Activity",
      isRedashImport: true,
      refreshInterval: 0,
      cards: [
        card(
          "Orders by Hour of Day",
          `SELECT
  EXTRACT(HOUR FROM created_at) AS hour,
  COUNT(*) AS order_count
FROM public.orders
WHERE created_at BETWEEN NOW() - INTERVAL '30 days'
  AND NOW() + INTERVAL '1 day'
  AND status IN ('completed', 'shipped')
GROUP BY hour
ORDER BY hour ASC`,
          dsId,
          "bar",
          0,
          0,
          6,
          4,
        ),
        card(
          "Orders by Day of Week",
          `SELECT
  CASE EXTRACT(DOW FROM created_at)
    WHEN 0 THEN 'Sunday'
    WHEN 1 THEN 'Monday'
    WHEN 2 THEN 'Tuesday'
    WHEN 3 THEN 'Wednesday'
    WHEN 4 THEN 'Thursday'
    WHEN 5 THEN 'Friday'
    WHEN 6 THEN 'Saturday'
  END AS day_of_week,
  COUNT(*) AS order_count
FROM public.orders
WHERE created_at BETWEEN NOW() - INTERVAL '30 days'
  AND NOW() + INTERVAL '1 day'
  AND status IN ('completed', 'shipped')
GROUP BY EXTRACT(DOW FROM created_at)
ORDER BY EXTRACT(DOW FROM created_at) ASC`,
          dsId,
          "bar",
          6,
          0,
          6,
          4,
        ),
        card(
          "Orders by Day of Month",
          `SELECT
  EXTRACT(DAY FROM created_at) AS day_of_month,
  COUNT(*) AS order_count
FROM public.orders
WHERE created_at BETWEEN NOW() - INTERVAL '30 days'
  AND NOW() + INTERVAL '1 day'
  AND status IN ('completed', 'shipped')
GROUP BY day_of_month
ORDER BY day_of_month ASC`,
          dsId,
          "bar",
          0,
          4,
          6,
          4,
        ),
        card(
          "Top Products by Quantity Sold",
          `SELECT
  p.name AS product_name,
  SUM(oi.quantity) AS total_quantity
FROM public.order_items AS oi
JOIN public.products AS p ON p.id = oi.product_id
JOIN public.orders AS o ON o.id = oi.order_id
WHERE o.created_at BETWEEN NOW() - INTERVAL '30 days'
  AND NOW() + INTERVAL '1 day'
GROUP BY p.id, p.name
ORDER BY total_quantity DESC`,
          dsId,
          "table",
          6,
          4,
          6,
          4,
        ),
      ],
    },

    // ─── Transactions ─────────────────────────────────────────
    {
      name: "Transactions",
      isRedashImport: true,
      refreshInterval: 0,
      cards: [
        card(
          "Revenue by User (Last 30 Days)",
          `SELECT
  u.name AS user_name,
  COUNT(o.id) AS order_count,
  SUM(o.amount) AS total_revenue
FROM public.orders AS o
JOIN public.users AS u ON u.id = o.user_id
WHERE o.status IN ('completed', 'shipped')
  AND o.created_at BETWEEN NOW() - INTERVAL '30 days'
  AND NOW() + INTERVAL '1 day'
GROUP BY u.id, u.name
ORDER BY total_revenue DESC`,
          dsId,
          "table",
          0,
          0,
          6,
          4,
        ),
        card(
          "Orders by Product and Size",
          `SELECT
  p.name AS product_name,
  p.category,
  COUNT(oi.id) AS order_count,
  SUM(oi.quantity * oi.unit_price) AS revenue
FROM public.order_items AS oi
JOIN public.products AS p ON p.id = oi.product_id
JOIN public.orders AS o ON o.id = oi.order_id
WHERE o.status IN ('completed', 'shipped')
  AND o.created_at BETWEEN NOW() - INTERVAL '30 days'
  AND NOW() + INTERVAL '1 day'
GROUP BY p.id, p.name, p.category
ORDER BY order_count DESC`,
          dsId,
          "table",
          6,
          0,
          6,
          4,
        ),
        card(
          "Recent Completed Orders",
          `SELECT
  COUNT(id) AS order_count,
  SUM(amount) AS total_amount
FROM public.orders
WHERE status IN ('completed', 'shipped')
  AND created_at BETWEEN NOW() - INTERVAL '30 days'
  AND NOW() + INTERVAL '1 day'`,
          dsId,
          "table",
          0,
          4,
          6,
          4,
        ),
        card(
          "Payment Status Summary",
          `SELECT
  status,
  COUNT(id) AS count,
  SUM(amount) AS total_amount
FROM public.orders
WHERE created_at BETWEEN NOW() - INTERVAL '30 days'
  AND NOW() + INTERVAL '1 day'
GROUP BY status
ORDER BY count DESC`,
          dsId,
          "table",
          6,
          4,
          6,
          4,
        ),
      ],
    },

    // ─── Engagement ───────────────────────────────────────────
    {
      name: "Engagement",
      isRedashImport: true,
      refreshInterval: 0,
      cards: [
        card(
          "Users with EC Integration (No Orders)",
          `SELECT
  u.id AS user_id,
  u.name,
  u.email,
  u.created_at
FROM public.users AS u
LEFT JOIN public.orders AS o ON o.user_id = u.id
WHERE o.id IS NULL
ORDER BY u.created_at DESC`,
          dsId,
          "table",
          0,
          0,
          4,
          4,
        ),
        card(
          "Users with Orders but No Recent Activity",
          `SELECT
  u.id AS user_id,
  u.name,
  u.email,
  MAX(o.created_at) AS last_order_date,
  COUNT(o.id) AS total_orders
FROM public.users AS u
LEFT JOIN public.orders AS o ON o.user_id = u.id
GROUP BY u.id, u.name, u.email
HAVING MAX(o.created_at) < NOW() - INTERVAL '30 days'
   OR MAX(o.created_at) IS NULL
ORDER BY last_order_date DESC NULLS LAST`,
          dsId,
          "table",
          4,
          0,
          4,
          4,
        ),
        card(
          "Highly Active Users",
          `SELECT
  u.id AS user_id,
  u.name,
  u.email,
  COUNT(o.id) AS order_count,
  SUM(o.amount) AS total_spent
FROM public.users AS u
JOIN public.orders AS o ON o.user_id = u.id
WHERE o.status IN ('completed', 'shipped')
GROUP BY u.id, u.name, u.email
HAVING COUNT(o.id) >= 5
ORDER BY order_count DESC`,
          dsId,
          "table",
          8,
          0,
          4,
          4,
        ),
        card(
          "Users with Active Orders",
          `SELECT
  u.id AS user_id,
  u.name,
  u.email,
  COUNT(o.id) AS active_orders
FROM public.users AS u
JOIN public.orders AS o ON o.user_id = u.id
WHERE o.status IN ('pending', 'processing')
GROUP BY u.id, u.name, u.email
ORDER BY active_orders DESC`,
          dsId,
          "table",
          0,
          4,
          4,
          4,
        ),
        card(
          "Users with Completed and Active Orders",
          `SELECT
  u.id AS user_id,
  u.name,
  u.email,
  COUNT(o.id) AS total_orders,
  SUM(CASE WHEN o.status IN ('completed', 'shipped') THEN 1 ELSE 0 END) AS completed_orders,
  SUM(CASE WHEN o.status IN ('pending', 'processing') THEN 1 ELSE 0 END) AS active_orders
FROM public.users AS u
LEFT JOIN public.orders AS o ON o.user_id = u.id
GROUP BY u.id, u.name, u.email
ORDER BY total_orders DESC`,
          dsId,
          "table",
          4,
          4,
          4,
          4,
        ),
      ],
    },
  ];
}

export default function Dashboard({ queries, dataSources }: Props) {
  const [dashboards, setDashboards] = useState<DashboardType[]>([]);
  const [activePage, setActivePage] = useState(0);
  const [categoryOpen, setCategoryOpen] = useState(true);
  const [importingFromRedash, setImportingFromRedash] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [timePeriod, setTimePeriod] = useState<"daily" | "weekly" | "monthly">(
    "daily",
  );
  const [chartGroupMaxes, setChartGroupMaxes] = useState<
    Record<string, number>
  >({});
  const cardMaxValues = useRef<Record<string, number>>({});
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoCreatedRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Redashインポートダッシュボードを名前でグループ化したユニークリスト
  const redashGroups = useMemo(() => {
    const seen = new Set<string>();
    return dashboards
      .filter((d) => d.isRedashImport)
      .filter((d) => {
        if (seen.has(d.name)) return false;
        seen.add(d.name);
        return true;
      });
  }, [dashboards]);

  const pageSections = useMemo(() => {
    const page = PAGES[activePage];
    if (page) {
      // プリセットページ
      const filtered = dashboards.filter(
        (d) => !d.isRedashImport && page.sections.includes(d.name),
      );
      const seen = new Set<string>();
      return filtered.filter((d) => {
        if (seen.has(d.name)) return false;
        seen.add(d.name);
        return true;
      });
    }
    // Redashインポートページ（PAGES外のインデックス）
    const redashPageIndex = activePage - PAGES.length;
    const group = redashGroups[redashPageIndex];
    if (!group) return [];
    return dashboards.filter((d) => d.isRedashImport && d.name === group.name);
  }, [dashboards, activePage, redashGroups]);

  // chartGroup内の全カードが報告した最大値からグループ最大値を計算
  const handleCardMaxValue = useCallback(
    (cardId: string, max: number) => {
      cardMaxValues.current[cardId] = max;
      // 全ダッシュボードの全カードからchartGroupをマッピング
      const groupMap: Record<string, string[]> = {};
      for (const d of dashboards) {
        for (const c of d.cards) {
          if (c.chartGroup) {
            (groupMap[c.chartGroup] ??= []).push(c.id);
          }
        }
      }
      // グループごとの最大値を再計算
      const newMaxes: Record<string, number> = {};
      for (const [group, ids] of Object.entries(groupMap)) {
        let groupMax = 0;
        for (const id of ids) {
          const v = cardMaxValues.current[id];
          if (v != null && v > groupMax) groupMax = v;
        }
        if (groupMax > 0) newMaxes[group] = groupMax;
      }
      setChartGroupMaxes((prev) => {
        // 変更がなければ更新しない
        const keys = Object.keys(newMaxes);
        if (
          keys.length === Object.keys(prev).length &&
          keys.every((k) => prev[k] === newMaxes[k])
        )
          return prev;
        return newMaxes;
      });
    },
    [dashboards],
  );

  // Initialize: fetch existing dashboards or create presets
  // Redashインポートダッシュボードは保持し、プリセットのみ再作成する
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current || dataSources.length === 0) return;

    (async () => {
      let redashImported: DashboardType[] = [];

      // 既存ダッシュボードを取得し、プリセット＋ビルトインRedashのみ削除（APIインポートのRedashは保持）
      try {
        const res = await fetch("/api/dashboards");
        if (res.ok) {
          const existing: DashboardType[] = await res.json();
          // APIインポート由来（ビルトインRedash名以外のisRedashImport）のみ保持
          redashImported = existing.filter(
            (d) => d.isRedashImport && !BUILTIN_REDASH_NAMES.has(d.name),
          );
          await Promise.all(
            existing
              .filter(
                (d) => !d.isRedashImport || BUILTIN_REDASH_NAMES.has(d.name),
              )
              .map((d) =>
                fetch(`/api/dashboards/${d.id}`, { method: "DELETE" }).catch(
                  () => {},
                ),
              ),
          );
        }
      } catch {
        // ignore
      }

      const allPresets = [
        ...createPresetDashboards(dataSources[0].id),
        ...createRedashDashboards(dataSources[0].id),
      ];
      const created: DashboardType[] = [];
      for (const preset of allPresets) {
        try {
          const res = await fetch("/api/dashboards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(preset),
          });
          if (res.ok) created.push(await res.json());
        } catch {
          // ignore
        }
      }
      setDashboards([...created, ...redashImported]);
      autoCreatedRef.current = true;
      initializedRef.current = true;
    })();
  }, [dataSources]);

  // Auto-refresh only for current page's sections
  useEffect(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    if (!autoRefreshEnabled) return;

    const intervals = pageSections
      .filter((d) => d.refreshInterval > 0)
      .map((d) => d.refreshInterval);
    if (intervals.length === 0) return;

    const minInterval = Math.min(...intervals);
    refreshTimerRef.current = setInterval(() => {
      setRefreshKey((k) => k + 1);
      setLastRefreshed(new Date());
    }, minInterval * 1000);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [pageSections, autoRefreshEnabled]);

  // Scroll to top when switching pages
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0 });
  }, [activePage]);

  const handleRefreshAll = () => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    setLastRefreshed(new Date());
    setTimeout(() => setRefreshing(false), 600);
  };

  const handleResetPresets = useCallback(async () => {
    if (
      !window.confirm(
        "ダッシュボードをプリセットに戻しますか？\nRedashインポートは保持されます。",
      )
    )
      return;

    // 1. プリセット＋ビルトインRedashのみ削除（APIインポートのRedashは保持）
    let preserved: DashboardType[] = [];
    try {
      const allRes = await fetch("/api/dashboards");
      if (allRes.ok) {
        const all: DashboardType[] = await allRes.json();
        preserved = all.filter(
          (d) => d.isRedashImport && !BUILTIN_REDASH_NAMES.has(d.name),
        );
        for (const d of all) {
          if (!d.isRedashImport || BUILTIN_REDASH_NAMES.has(d.name)) {
            await fetch(`/api/dashboards/${d.id}`, { method: "DELETE" }).catch(
              () => {},
            );
          }
        }
      }
    } catch {
      // Fallback: delete from state
      preserved = dashboards.filter(
        (d) => d.isRedashImport && !BUILTIN_REDASH_NAMES.has(d.name),
      );
      for (const d of dashboards) {
        if (!d.isRedashImport || BUILTIN_REDASH_NAMES.has(d.name)) {
          await fetch(`/api/dashboards/${d.id}`, { method: "DELETE" }).catch(
            () => {},
          );
        }
      }
    }

    // 2. プリセット再作成（auto-createに任せず直接実行）
    if (dataSources.length === 0) {
      setDashboards(preserved);
      return;
    }
    const allPresets = [
      ...createPresetDashboards(dataSources[0].id),
      ...createRedashDashboards(dataSources[0].id),
    ];
    const created: DashboardType[] = [];
    for (const preset of allPresets) {
      try {
        const res = await fetch("/api/dashboards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(preset),
        });
        if (res.ok) created.push(await res.json());
      } catch {
        // ignore
      }
    }
    setDashboards([...created, ...preserved]);
    setActivePage(0);
    autoCreatedRef.current = true;
  }, [dashboards, dataSources]);

  const handleImportFromRedash = useCallback(async () => {
    if (
      !window.confirm(
        "Redashの全クエリをタグでグループ分けしてダッシュボードに取り込みます。\n既存のRedashインポートは上書きされます。続行しますか？",
      )
    )
      return;

    setImportingFromRedash(true);
    try {
      const res = await fetch("/api/create-dashboards-from-redash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        window.alert(
          `インポートに失敗しました: ${err.error ?? "不明なエラー"}`,
        );
        return;
      }
      // ダッシュボード一覧を再取得してstateに反映
      const allRes = await fetch("/api/dashboards");
      if (allRes.ok) {
        const all: DashboardType[] = await allRes.json();
        setDashboards(all);
      }
    } catch (e) {
      window.alert(`インポートに失敗しました: ${e}`);
    } finally {
      setImportingFromRedash(false);
    }
  }, []);

  const formatLastRefreshed = (date: Date) => {
    const diff = Date.now() - date.getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const hasAutoRefresh = pageSections.some((d) => d.refreshInterval > 0);

  if (dashboards.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-ctp-base dot-grid">
        <div className="text-center animate-fade-in">
          <div className="w-14 h-14 rounded-2xl bg-ctp-surface0 flex items-center justify-center mx-auto mb-4">
            <VscDashboard size={28} className="text-ctp-surface2" />
          </div>
          <p className="text-ctp-subtext text-sm font-medium mb-1">
            {dataSources.length === 0
              ? "Loading data sources..."
              : "Preparing dashboard..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-ctp-base">
      {/* Header bar: toggle + active tab name + controls */}
      <div className="flex items-center gap-2 px-5 h-10 bg-ctp-crust border-b border-ctp-surface0 shrink-0">
        <button
          onClick={() => setCategoryOpen((v) => !v)}
          className="flex items-center gap-1 text-ctp-overlay0 hover:text-ctp-text transition-colors"
          title={categoryOpen ? "カテゴリを閉じる" : "カテゴリを開く"}
        >
          {categoryOpen ? (
            <VscChevronDown size={14} />
          ) : (
            <VscChevronRight size={14} />
          )}
          <span className="text-xs font-medium">
            {activePage < PAGES.length
              ? PAGES[activePage].name
              : (redashGroups[activePage - PAGES.length]?.name ?? "")}
          </span>
        </button>

        <div className="flex-1" />

        {/* Period filter (D/W/M) - プリセットページのみ表示 */}
        {activePage < PAGES.length && PAGES[activePage].hasPeriodFilter && (
          <div className="flex items-center gap-0.5 bg-ctp-surface0/70 rounded-lg p-0.5">
            {(["daily", "weekly", "monthly"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setTimePeriod(p)}
                title={
                  p === "daily"
                    ? "Daily"
                    : p === "weekly"
                      ? "Weekly"
                      : "Monthly"
                }
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  timePeriod === p
                    ? "bg-white text-ctp-text shadow-sm"
                    : "text-ctp-surface2 hover:text-ctp-overlay0"
                }`}
              >
                {p === "daily" ? "D" : p === "weekly" ? "W" : "M"}
              </button>
            ))}
          </div>
        )}

        {/* Auto-refresh toggle */}
        {hasAutoRefresh && (
          <button
            onClick={() => setAutoRefreshEnabled((v) => !v)}
            className="p-1.5 rounded-lg transition-all text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0"
            title={autoRefreshEnabled ? "Auto-refresh ON" : "Auto-refresh OFF"}
          >
            <span
              className={`block w-1.5 h-1.5 rounded-full ${
                autoRefreshEnabled ? "bg-ctp-green" : "bg-ctp-surface2"
              }`}
            />
          </button>
        )}

        {lastRefreshed && (
          <span className="text-[11px] text-ctp-surface2">
            {formatLastRefreshed(lastRefreshed)}
          </span>
        )}

        {/* Redashからインポートボタン */}
        <button
          onClick={() => void handleImportFromRedash()}
          disabled={importingFromRedash}
          className="p-1.5 rounded-lg text-ctp-overlay0 hover:text-ctp-blue hover:bg-ctp-surface0 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          title="Redashクエリをダッシュボードにインポート（全クエリを取り込む）"
        >
          {importingFromRedash ? (
            <VscLoading size={13} className="animate-spin" />
          ) : (
            <VscCloudDownload size={13} />
          )}
        </button>

        <button
          onClick={() => void handleResetPresets()}
          className="p-1.5 rounded-lg text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0 transition-all"
          title="Reset to presets"
        >
          <VscDebugRestart size={13} />
        </button>

        <button
          onClick={handleRefreshAll}
          className="p-1.5 rounded-lg text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0 transition-all"
          title="Refresh all"
        >
          <VscRefresh
            size={13}
            className={refreshing ? "animate-spin-slow" : ""}
          />
        </button>
      </div>

      {/* Collapsible category tabs */}
      {categoryOpen && (
        <div className="flex flex-wrap items-center gap-1.5 px-5 py-2.5 bg-ctp-crust border-b border-ctp-surface0 shrink-0">
          {PAGES.map((page, idx) => {
            const isActive = idx === activePage;
            return (
              <button
                key={page.name}
                onClick={() => setActivePage(idx)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? "text-ctp-text bg-white shadow-sm"
                    : "text-ctp-overlay0 hover:text-ctp-subtext hover:bg-ctp-surface0/40"
                }`}
              >
                <span
                  className={`transition-opacity ${isActive ? "opacity-80" : "opacity-40"}`}
                >
                  {page.icon}
                </span>
                {page.name}
              </button>
            );
          })}

          {/* Redashインポートグループタブ */}
          {redashGroups.length > 0 && (
            <>
              <div className="w-px h-5 bg-ctp-surface0 mx-1" />
              {redashGroups.map((group, i) => {
                const idx = PAGES.length + i;
                const isActive = idx === activePage;
                return (
                  <button
                    key={group.id}
                    onClick={() => setActivePage(idx)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? "text-ctp-text bg-white shadow-sm"
                        : "text-ctp-overlay0 hover:text-ctp-subtext hover:bg-ctp-surface0/40"
                    }`}
                  >
                    <span
                      className={`transition-opacity ${isActive ? "opacity-60" : "opacity-30"}`}
                    >
                      <VscCloudDownload size={11} />
                    </span>
                    {group.name}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Active page sections (only render current page) */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto">
        <div key={`page-${activePage}`} className="p-5 space-y-8">
          {pageSections.map((d) => (
            <section key={d.id} id={d.id}>
              {/* Cards grid */}
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-12 gap-3 md:gap-4 auto-rows-[200px] md:auto-rows-[220px]">
                {(activePage < PAGES.length && PAGES[activePage].hasPeriodFilter
                  ? d.cards.filter(
                      // adaptive: 常に表示（SQLを動的切替）、card: timePeriodでフィルタ
                      (c) =>
                        c.sqlByPeriod != null ||
                        !c.timePeriod ||
                        c.timePeriod === timePeriod,
                    )
                  : d.cards
                ).map((c) => {
                  // adaptive カードは選択中の期間に対応するSQLを使用
                  const effectiveCard =
                    activePage < PAGES.length &&
                    PAGES[activePage].hasPeriodFilter &&
                    c.sqlByPeriod
                      ? { ...c, sql: c.sqlByPeriod[timePeriod] ?? c.sql }
                      : c;
                  return (
                    <div
                      key={c.id}
                      className={
                        c.position.w >= 12
                          ? "col-span-4 sm:col-span-6 md:col-span-12"
                          : c.position.w >= 6
                            ? "col-span-4 sm:col-span-6 md:col-span-6"
                            : "col-span-4 sm:col-span-3 md:col-span-4"
                      }
                      style={{
                        gridRow: `span ${Math.max(1, Math.ceil(c.position.h / 4))}`,
                      }}
                    >
                      <DashboardCard
                        card={effectiveCard}
                        queries={queries}
                        refreshTrigger={refreshKey}
                        yAxisMax={
                          c.chartGroup
                            ? chartGroupMaxes[c.chartGroup]
                            : undefined
                        }
                        onDataMax={
                          c.chartGroup ? handleCardMaxValue : undefined
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
