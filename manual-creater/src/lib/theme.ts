type Theme = "vercel" | "vercel-light";

const STORAGE_KEY = "manual-creater-theme";
const DARK_THEME: Theme = "vercel";
const LIGHT_THEME: Theme = "vercel-light";

function getSystemTheme(): Theme {
  if (typeof window === "undefined") return DARK_THEME;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? DARK_THEME
    : LIGHT_THEME;
}

export function getTheme(): Theme {
  if (typeof window === "undefined") return DARK_THEME;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === DARK_THEME || stored === LIGHT_THEME) return stored;
  return getSystemTheme();
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}

export function toggleTheme(): Theme {
  const current = getTheme();
  const next = current === DARK_THEME ? LIGHT_THEME : DARK_THEME;
  setTheme(next);
  return next;
}

export function applyTheme(theme?: Theme): void {
  const resolved = theme ?? getTheme();
  document.documentElement.setAttribute("data-theme", resolved);
}

export function isDarkTheme(theme: Theme): boolean {
  return theme === DARK_THEME;
}
