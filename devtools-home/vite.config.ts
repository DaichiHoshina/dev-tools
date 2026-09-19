import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  resolve: {
    alias: {
      "~": "/src",
    },
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
    port: 3001,
  },
});
