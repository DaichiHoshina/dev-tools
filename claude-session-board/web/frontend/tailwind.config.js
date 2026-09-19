import daisyui from "daisyui";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx}", "./index.html"],
  theme: {
    extend: {},
  },
  plugins: [daisyui],
  daisyui: {
    themes: [
      {
        /* Linear (project management tool) 風ダークテーマ */
        linear: {
          primary: "#8b5cf6",
          "primary-content": "#ffffff",
          secondary: "#6d28d9",
          "secondary-content": "#e4e4e7",
          accent: "#a78bfa",
          "accent-content": "#ffffff",
          neutral: "#2e2e33",
          "neutral-content": "#e4e4e7",
          "base-100": "#161618",
          "base-200": "#1c1c20",
          "base-300": "#28282e",
          "base-content": "#dadadf",
          info: "#38bdf8",
          "info-content": "#e0f2fe",
          success: "#4ade80",
          "success-content": "#dcfce7",
          warning: "#fbbf24",
          "warning-content": "#fef3c7",
          error: "#f87171",
          "error-content": "#fee2e2",
        },
      },
    ],
  },
};
