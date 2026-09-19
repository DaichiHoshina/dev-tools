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
          primary: "#3b82f6",
          secondary: "#8b5cf6",
          accent: "#06b6d4",
          neutral: "#ededed",
          "base-100": "#131316",
          "base-200": "#0a0a0d",
          "base-300": "#1e1e24",
          "base-content": "#e4e4e7",
          info: "#06b6d4",
          success: "#10b981",
          warning: "#f59e0b",
          error: "#ef4444",
        },
      },
      {
        "vercel-light": {
          primary: "#3b82f6",
          secondary: "#8b5cf6",
          accent: "#0891b2",
          neutral: "#1a1a1a",
          "base-100": "#ffffff",
          "base-200": "#f8f9fc",
          "base-300": "#e2e4ea",
          "base-content": "#111827",
          info: "#0891b2",
          success: "#10b981",
          warning: "#f59e0b",
          error: "#ef4444",
        },
      },
    ],
  },
};
