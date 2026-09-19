import { useState, useEffect } from "hono/jsx/dom";

const DARK_THEME = "vercel";
const LIGHT_THEME = "vercel-light";
const STORAGE_KEY = "devtools-theme";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.getAttribute("data-theme") !== LIGHT_THEME;
  });

  useEffect(() => {
    const theme = isDark ? DARK_THEME : LIGHT_THEME;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [isDark]);

  return (
    <button
      id="theme-toggle"
      type="button"
      class="btn btn-ghost btn-sm btn-square rounded-lg text-neutral/60 hover:text-neutral hover:bg-white/5"
      title={isDark ? "ライトモードに切替" : "ダークモードに切替"}
      aria-label={isDark ? "ライトモードに切替" : "ダークモードに切替"}
      onClick={() => setIsDark((prev: boolean) => !prev)}
    >
      <i class={isDark ? "fa-solid fa-moon" : "fa-solid fa-sun"} />
    </button>
  );
}
