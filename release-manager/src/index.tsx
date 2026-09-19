import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { IndexPage } from "./routes/index";
import { PrdPage } from "./routes/prd";

const app = new Hono();

// 静的ファイル配信
app.use("/static/*", serveStatic({ root: "./dist" }));

// ルート
app.get("/", (c) => {
  return c.html(<IndexPage />);
});

app.get("/prd", (c) => {
  return c.html(<PrdPage />);
});

export default app;
