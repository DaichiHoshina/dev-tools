import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  resolve: {
    alias: {
      "~": "/src",
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
  publicDir: "static",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: "./index.html",
      output: {
        entryFileNames: "static/[name]-[hash].js",
        chunkFileNames: "static/[name]-[hash].js",
        assetFileNames: "static/[name]-[hash].[ext]",
      },
    },
  },
  server: {
    port: 3002,
    proxy: {
      // K8s proxy: /k8s/{project}/{env}/ → localhost:{port}/
      // dev environment (port 8001)
      "/k8s/default/dev/": {
        target: "http://localhost:8001",
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/k8s\/default\/dev/, ""),
      },
      // staging environment (port 8002)
      "/k8s/default/staging/": {
        target: "http://localhost:8002",
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/k8s\/default\/staging/, ""),
      },
      // production environment (port 8003)
      "/k8s/default/production/": {
        target: "http://localhost:8003",
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/k8s\/default\/production/, ""),
      },
      // GitLab API proxy (configure VITE_GITLAB_HOST in .env)
      "/gitlab-api/": {
        target: `https://${process.env.VITE_GITLAB_HOST ?? "gitlab.example.com"}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gitlab-api/, ""),
      },
    },
  },
});
