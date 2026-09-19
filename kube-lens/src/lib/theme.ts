export const DARK_THEME = "vercel" as const;
export const LIGHT_THEME = "vercel-light" as const;
export const STORAGE_KEY = "kube-lens-theme" as const;

export type Theme = typeof DARK_THEME | typeof LIGHT_THEME;

export function getTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === DARK_THEME || stored === LIGHT_THEME) return stored;
  // system preference
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? LIGHT_THEME
    : DARK_THEME;
}

export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(STORAGE_KEY, theme);
}

export function toggleTheme(): Theme {
  const current = getTheme();
  const next = current === DARK_THEME ? LIGHT_THEME : DARK_THEME;
  setTheme(next);
  return next;
}
