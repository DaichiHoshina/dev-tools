/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // CSS variable based theming (supports bg-ctp-blue/10 alpha syntax)
        "ctp-base": "rgb(var(--c-base) / <alpha-value>)",
        "ctp-mantle": "rgb(var(--c-mantle) / <alpha-value>)",
        "ctp-crust": "rgb(var(--c-crust) / <alpha-value>)",
        "ctp-surface0": "rgb(var(--c-surface0) / <alpha-value>)",
        "ctp-surface1": "rgb(var(--c-surface1) / <alpha-value>)",
        "ctp-surface2": "rgb(var(--c-surface2) / <alpha-value>)",
        "ctp-overlay0": "rgb(var(--c-overlay0) / <alpha-value>)",
        "ctp-text": "rgb(var(--c-text) / <alpha-value>)",
        "ctp-subtext": "rgb(var(--c-subtext) / <alpha-value>)",
        "ctp-blue": "rgb(var(--c-blue) / <alpha-value>)",
        "ctp-green": "rgb(var(--c-green) / <alpha-value>)",
        "ctp-red": "rgb(var(--c-red) / <alpha-value>)",
        "ctp-yellow": "rgb(var(--c-yellow) / <alpha-value>)",
        "ctp-peach": "rgb(var(--c-peach) / <alpha-value>)",
        "ctp-teal": "rgb(var(--c-teal) / <alpha-value>)",
        "ctp-mauve": "rgb(var(--c-mauve) / <alpha-value>)",
        "ctp-lavender": "rgb(var(--c-lavender) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Inter", "Zen Kaku Gothic New", "Hiragino Sans", "sans-serif"],
        display: ["Space Grotesk", "Inter", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};
