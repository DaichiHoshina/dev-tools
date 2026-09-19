import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  resolve: {
    alias: {
      "~": "/src",
    },
  },
  server: {
    port: 3005,
    proxy: {
      "/gitlab-api/": {
        target: process.env.VITE_GITLAB_URL || "https://gitlab.example.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gitlab-api/, ""),
        secure: false,
      },
    },
  },
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
});
