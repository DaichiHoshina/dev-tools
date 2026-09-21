import { useState, useEffect } from "hono/jsx/dom";
import { DARK_THEME, LIGHT_THEME, STORAGE_KEY } from "~/lib/theme";
import { getToken, setToken } from "~/lib/gitlab-client";

export function Header() {
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.getAttribute("data-theme") !== LIGHT_THEME;
  });
  const [tokenDraft, setTokenDraft] = useState<string>(() => getToken());
  const [tokenOpen, setTokenOpen] = useState(false);

  const saveToken = () => {
    setToken(tokenDraft);
    setTokenOpen(false);
    location.reload();
  };

  useEffect(() => {
    const theme = isDark ? DARK_THEME : LIGHT_THEME;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [isDark]);

  return (
    <header
      class="navbar sticky top-0 z-50 px-5 app-header"
      style="height: 56px; min-height: 56px;"
    >
      <div class="navbar-start gap-2">
        <a href="#/" class="brand" style="text-decoration: none;">
          <span class="brand-icon">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              style="display:block"
            >
              <circle
                cx="10.5"
                cy="10.5"
                r="7"
                stroke="white"
                stroke-width="2.5"
              />
              <line
                x1="15.5"
                y1="15.5"
                x2="21"
                y2="21"
                stroke="white"
                stroke-width="2.5"
                stroke-linecap="round"
              />
            </svg>
          </span>
          <span class="brand-mark">GitLab</span>
          <span class="brand-suffix">Grep</span>
        </a>
      </div>

      <div class="navbar-end gap-1">
        <button
          type="button"
          class="btn btn-ghost btn-sm btn-square rounded-lg text-neutral/60 hover:text-neutral hover:bg-white/5"
          title={isDark ? "ライトモードに切替" : "ダークモードに切替"}
          aria-label={isDark ? "ライトモードに切替" : "ダークモードに切替"}
          onClick={() => setIsDark((prev: boolean) => !prev)}
        >
          <i
            class={isDark ? "fa-solid fa-moon" : "fa-solid fa-sun"}
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          class="btn btn-ghost btn-sm btn-square rounded-lg text-neutral/60 hover:text-neutral hover:bg-white/5"
          title="GitLab トークン設定"
          aria-label="GitLab トークン設定"
          onClick={() => {
            setTokenDraft(getToken());
            setTokenOpen(true);
          }}
        >
          <i class="fa-solid fa-key" aria-hidden="true" />
        </button>

        <a
          href="/application/tools/devtools/devtools-home/"
          class="btn btn-ghost btn-sm btn-square rounded-lg text-neutral/60 hover:text-neutral hover:bg-white/5"
          title="DevTools Home"
          aria-label="DevTools Home"
        >
          <i class="fas fa-home" aria-hidden="true" />
        </a>
      </div>

      {tokenOpen && (
        <div class="modal modal-open">
          <div class="modal-box max-w-md">
            <h3 class="font-semibold text-base mb-1">GitLab トークン設定</h3>
            <p class="text-xs opacity-60 mb-4">
              入力したトークンはこのブラウザにのみ保存します。共有端末では作業後に空欄で保存してください。
            </p>
            <input
              type="password"
              value={tokenDraft}
              onInput={(e) => setTokenDraft((e.target as HTMLInputElement).value)}
              class="input input-bordered input-sm w-full font-mono"
              placeholder="glpat-..."
              autocomplete="off"
              spellcheck={false}
            />
            <div class="modal-action">
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                onClick={() => setTokenOpen(false)}
              >
                閉じる
              </button>
              <button
                type="button"
                class="btn btn-primary btn-sm"
                onClick={saveToken}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
