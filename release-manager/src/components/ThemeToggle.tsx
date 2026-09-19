import { useState, useEffect } from "hono/jsx";

const THEME_KEY = "release-manager-theme";
const LIGHT_THEME = "releasemanager";
const DARK_THEME = "releasemanager-dark";

export const ThemeToggle = () => {
  const [theme, setTheme] = useState<string>(LIGHT_THEME);

  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);
    } else {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      const initialTheme = prefersDark ? DARK_THEME : LIGHT_THEME;
      setTheme(initialTheme);
      document.documentElement.setAttribute("data-theme", initialTheme);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === LIGHT_THEME ? DARK_THEME : LIGHT_THEME;
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem(THEME_KEY, newTheme);
  };

  return (
    <button
      onClick={toggleTheme}
      class="sidebar-link"
      style="border: none; background: transparent; width: 100%; font: inherit; text-align: left;"
      aria-label="Toggle theme"
      title={`現在: ${theme === LIGHT_THEME ? "ライトモード" : "ダークモード"}`}
    >
      <i class={`fas ${theme === LIGHT_THEME ? "fa-moon" : "fa-sun"}`}></i>
      <span class="sidebar-label">
        {theme === LIGHT_THEME ? "ダーク" : "ライト"}
      </span>
    </button>
  );
};
