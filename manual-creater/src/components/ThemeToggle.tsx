import { useState } from "react";
import { getTheme, toggleTheme, isDarkTheme } from "../lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState(getTheme);

  const handleToggle = () => {
    const next = toggleTheme();
    setTheme(next);
  };

  const isDark = isDarkTheme(theme);

  return (
    <button
      id="theme-toggle"
      type="button"
      className="btn btn-ghost btn-sm btn-square rounded-lg text-neutral/60 hover:text-neutral hover:bg-white/5"
      title={isDark ? "ライトモードに切替" : "ダークモードに切替"}
      aria-label={isDark ? "ライトモードに切替" : "ダークモードに切替"}
      onClick={handleToggle}
    >
      <i className={isDark ? "fa-solid fa-moon" : "fa-solid fa-sun"} />
    </button>
  );
}
