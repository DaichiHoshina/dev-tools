#!/usr/bin/env node

import { spawn, execFileSync } from "node:child_process";
import { createConnection } from "node:net";

const PROXIES = [
  {
    project: "default",
    env: "dev",
    context: process.env.K8S_CONTEXT_DEV || "my-cluster-dev",
    port: 8001,
  },
  {
    project: "default",
    env: "staging",
    context: process.env.K8S_CONTEXT_STAGING || "my-cluster-staging",
    port: 8002,
  },
  {
    project: "default",
    env: "production",
    context: process.env.K8S_CONTEXT_PRODUCTION || "my-cluster-production",
    port: 8003,
  },
];

const COLORS = { dev: "\x1b[32m", staging: "\x1b[33m", production: "\x1b[31m" };
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

function log(project, env, msg) {
  const color = COLORS[env] || "";
  const label = `${project}/${env}`.toUpperCase().padEnd(20);
  console.log(`${color}[${label}]${RESET} ${msg}`);
}

function info(msg) {
  console.log(`${DIM}[INFO]${RESET} ${msg}`);
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      resolve(false);
    });
  });
}

function checkKubectl() {
  try {
    execFileSync("kubectl", ["version", "--client", "--output=json"], {
      stdio: "ignore",
    });
  } catch {
    console.error(
      `${BOLD}\x1b[31mError: kubectl is not installed or not in PATH${RESET}`
    );
    console.error("Install: https://kubernetes.io/docs/tasks/tools/");
    process.exit(1);
  }
}

function healthCheck(port, timeoutMs = 15000) {
  const interval = 500;
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api`);
        if (res.ok) return resolve();
      } catch {
        // not ready yet
      }
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`Health check timed out on port ${port}`));
      }
      setTimeout(check, interval);
    };
    check();
  });
}

async function startProxy({ project, env, context, port }) {
  if (await isPortInUse(port)) {
    log(project, env, `Port ${port} already in use - reusing existing proxy`);
    return { env, reused: true, child: null };
  }

  log(project, env, `Starting kubectl proxy (context: ${context}, port: ${port})...`);

  const child = spawn(
    "kubectl",
    [
      "proxy",
      `--port=${port}`,
      `--context=${context}`,
      "--disable-filter=true",
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  // Detect early exit (e.g. invalid context)
  const earlyExit = new Promise((_, reject) => {
    child.once("exit", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `kubectl proxy (${env}) exited with code ${code}: ${stderr.trim()}`
          )
        );
      }
    });
  });

  try {
    await Promise.race([healthCheck(port), earlyExit]);
    log(project, env, `Ready on port ${port}`);
    return { env, reused: false, child };
  } catch (err) {
    log(project, env, `\x1b[31mFailed: ${err.message}${RESET}`);
    child.kill();
    return { env, reused: false, child: null, error: err };
  }
}

async function startAllProxies() {
  const results = await Promise.all(PROXIES.map(startProxy));
  const ready = results.filter((r) => !r.error).length;
  const children = results.filter((r) => r.child).map((r) => r.child);

  console.log();
  info(`Proxies ready: ${ready}/${PROXIES.length}`);

  return children;
}

function startVite() {
  info("Starting Vite dev server...\n");

  const vite = spawn("npx", ["vite"], {
    stdio: "inherit",
    env: { ...process.env },
  });

  return vite;
}

function cleanup(children) {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

async function main() {
  console.log(`\n${BOLD}Kube Lens - Dev Launcher${RESET}\n`);

  checkKubectl();

  const proxyChildren = await startAllProxies();
  const vite = startVite();

  const allChildren = [...proxyChildren, vite];

  const shutdown = () => {
    info("Shutting down...");
    cleanup(allChildren);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  vite.on("exit", (code) => {
    cleanup(proxyChildren);
    process.exit(code ?? 0);
  });
}

main();
