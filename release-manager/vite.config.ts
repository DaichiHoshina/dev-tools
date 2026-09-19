import { defineConfig } from "vite";

export default defineConfig({
  // GitLab Pages用: CI環境では正しいbaseパスを設定
  base: process.env.CI
    ? process.env.VITE_BASE_PATH || "/release-manager/"
    : "/",
  resolve: {
    alias: {
      "~": "/src",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: "./index.html",
        prd: "./prd.html",
        branch: "./branch.html",
        tes: "./tes.html",
      },
      output: {
        entryFileNames: "static/[name]-[hash].js",
        chunkFileNames: "static/[name]-[hash].js",
        assetFileNames: "static/[name]-[hash].[ext]",
      },
    },
  },
  server: {
    port: 3000,
  },
});
