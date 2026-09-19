export const DARK_THEME = "vercel" as const;
export const LIGHT_THEME = "vercel-light" as const;
export const STORAGE_KEY = "gitlab-grep-theme" as const;

export type Theme = typeof DARK_THEME | typeof LIGHT_THEME;

export function getTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === DARK_THEME || stored === LIGHT_THEME) return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? LIGHT_THEME
    : DARK_THEME;
}

export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(STORAGE_KEY, theme);
}
