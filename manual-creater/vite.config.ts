import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/application/tools/devtools/manual-creater/",
  publicDir: "static",
  build: {
    outDir: "public",
    emptyOutDir: true,
  },
});
