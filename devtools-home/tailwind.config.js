import daisyui from "daisyui";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx}", "./index.html"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Zen Kaku Gothic New", "Hiragino Sans", "sans-serif"],
        heading: ["Space Grotesk", "Inter", "sans-serif"],
      },
    },
  },
  plugins: [daisyui],
  daisyui: {
    themes: [
      {
        vercel: {
          primary: "#6366f1",
          secondary: "#7c8194",
          accent: "#8b5cf6",
          neutral: "#eef0ff",
          "base-100": "#14141f",
          "base-200": "#10101a",
          "base-300": "#2a2a3d",
          "base-content": "#eef0ff",
          info: "#06b6d4",
          success: "#22c55e",
          warning: "#f59e0b",
          error: "#ef4444",
        },
      },
      {
        "vercel-light": {
          primary: "#6366f1",
          secondary: "#64748b",
          accent: "#8b5cf6",
          neutral: "#0a0a1a",
          "base-100": "#ffffff",
          "base-200": "#f5f5fa",
          "base-300": "#e2e2f0",
          "base-content": "#0a0a1a",
          info: "#06b6d4",
          success: "#22c55e",
          warning: "#f59e0b",
          error: "#ef4444",
        },
      },
    ],
  },
};
