/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{ts,tsx}",
    "./index.html",
    "./prd.html",
    "./branch.html",
    "./tes.html",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Inter"',
          '"Zen Kaku Gothic New"',
          '"Hiragino Sans"',
          "sans-serif",
        ],
        heading: ['"Space Grotesk"', '"Inter"', "sans-serif"],
        mono: ['"JetBrains Mono"', '"Fira Code"', "monospace"],
      },
      borderRadius: {
        card: "16px",
        small: "10px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.04), 0 6px 16px rgba(0,0,0,0.04)",
        "card-hover":
          "0 4px 12px rgba(0,0,0,0.06), 0 16px 32px rgba(0,0,0,0.06)",
        glass: "0 8px 32px rgba(0,0,0,0.06)",
        glow: "0 0 20px rgba(99,102,241,0.15)",
        "glow-lg": "0 0 40px rgba(99,102,241,0.25)",
        neon: "0 0 10px rgba(99,102,241,0.3), 0 0 40px rgba(99,102,241,0.1)",
        "neon-success":
          "0 0 10px rgba(52,211,153,0.3), 0 0 40px rgba(52,211,153,0.1)",
      },
      keyframes: {
        progress: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "scale-in": {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "pulse-subtle": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        "glow-pulse": {
          "0%, 100%": {
            boxShadow:
              "0 0 8px rgba(129,140,248,0.3), 0 0 24px rgba(129,140,248,0.1)",
          },
          "50%": {
            boxShadow:
              "0 0 16px rgba(129,140,248,0.5), 0 0 48px rgba(129,140,248,0.2)",
          },
        },
        "border-flow": {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        "scan-line": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
      },
      animation: {
        progress: "progress 2s linear infinite",
        shimmer: "shimmer 2s linear infinite",
        "fade-in": "fade-in 0.4s ease-out",
        "fade-in-up": "fade-in-up 0.5s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        "pulse-subtle": "pulse-subtle 2s ease-in-out infinite",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "border-flow": "border-flow 3s ease infinite",
      },
    },
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: [
      {
        releasetes: {
          primary: "#6366f1",
          "primary-content": "#FFFFFF",
          secondary: "#64748b",
          "secondary-content": "#FFFFFF",
          accent: "#22d3ee",
          "accent-content": "#0f172a",
          neutral: "#0f172a",
          "neutral-content": "#f8fafc",
          "base-100": "#ffffff",
          "base-200": "#f8fafc",
          "base-300": "#e2e8f0",
          info: "#06b6d4",
          "info-content": "#FFFFFF",
          success: "#10b981",
          "success-content": "#FFFFFF",
          warning: "#f59e0b",
          "warning-content": "#FFFFFF",
          error: "#ef4444",
          "error-content": "#FFFFFF",
          "--rounded-box": "1rem",
          "--rounded-btn": "0.625rem",
          "--rounded-badge": "999px",
          "--tab-radius": "0.625rem",
        },
        "releasetes-dark": {
          primary: "#818cf8",
          "primary-content": "#FFFFFF",
          secondary: "#94a3b8",
          "secondary-content": "#FFFFFF",
          accent: "#22d3ee",
          "accent-content": "#0c0c14",
          neutral: "#f1f5f9",
          "neutral-content": "#0c0c14",
          "base-100": "#0c0c14",
          "base-200": "#10101c",
          "base-300": "#1a1a2e",
          "base-content": "#e2e8f0",
          info: "#22d3ee",
          "info-content": "#0c0c14",
          success: "#34d399",
          "success-content": "#0c0c14",
          warning: "#fbbf24",
          "warning-content": "#0c0c14",
          error: "#fb7185",
          "error-content": "#0c0c14",
          "--rounded-box": "1rem",
          "--rounded-btn": "0.625rem",
          "--rounded-badge": "999px",
          "--tab-radius": "0.625rem",
        },
      },
    ],
    logs: false,
  },
};
