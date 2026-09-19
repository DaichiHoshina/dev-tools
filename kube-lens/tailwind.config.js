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
          primary: "#0070f3",
          secondary: "#888888",
          accent: "#0070f3",
          neutral: "#ededed",
          "base-100": "#2e2e33",
          "base-200": "#27272a",
          "base-300": "#3f3f46",
          "base-content": "#ededed",
          info: "#0070f3",
          success: "#0070f3",
          warning: "#f5a623",
          error: "#ee0000",
        },
      },
      {
        "vercel-light": {
          primary: "#0070f3",
          secondary: "#666666",
          accent: "#0070f3",
          neutral: "#1a1a1a",
          "base-100": "#ffffff",
          "base-200": "#fafafa",
          "base-300": "#e5e5e5",
          "base-content": "#1a1a1a",
          info: "#0070f3",
          success: "#0070f3",
          warning: "#f5a623",
          error: "#ee0000",
        },
      },
    ],
  },
};
