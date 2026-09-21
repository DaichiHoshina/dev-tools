import { TOKEN_KEYS, getToken, setToken, hasMissingTokens } from "../token-store";
import type { TokenKey } from "../token-store";

// GitLab トークンの入力画面。
// トークンは利用者のブラウザにだけ保存し、配信物には含めない。

const LABELS: Record<TokenKey, string> = {
  TRIGGER_TOKEN: "Pipeline Trigger Token",
  READ_TOKEN: "GitLab Token (アプリ用)",
  INFRA_GITLAB_TOKEN: "GitLab Token (インフラ用)",
};

const DIALOG_ID = "token-settings-dialog";

function buildDialog(): HTMLDialogElement {
  const dialog = document.createElement("dialog");
  dialog.id = DIALOG_ID;
  dialog.className = "modal";

  const fields = TOKEN_KEYS.map(
    (key) => `
      <label class="form-control w-full">
        <span class="label-text text-xs">${LABELS[key]}</span>
        <input
          type="password"
          id="token-input-${key}"
          class="input input-bordered input-sm w-full font-mono"
          autocomplete="off"
          spellcheck="false"
        />
      </label>`,
  ).join("");

  dialog.innerHTML = `
    <div class="modal-box max-w-lg">
      <h3 class="font-semibold text-base mb-1">GitLab トークン設定</h3>
      <p class="text-xs text-base-content/60 mb-4">
        入力したトークンはこのブラウザにのみ保存します。共有端末では作業後に削除してください。
      </p>
      <div class="space-y-3">${fields}</div>
      <div class="modal-action">
        <button id="token-settings-clear" class="btn btn-ghost btn-sm">削除</button>
        <button id="token-settings-cancel" class="btn btn-ghost btn-sm">閉じる</button>
        <button id="token-settings-save" class="btn btn-primary btn-sm">保存</button>
      </div>
    </div>`;
  return dialog;
}

function fillInputs(): void {
  for (const key of TOKEN_KEYS) {
    const input = document.getElementById(
      `token-input-${key}`,
    ) as HTMLInputElement | null;
    if (input) input.value = getToken(key);
  }
}

/**
 * トークン設定の画面を組み立てて body に追加する。
 * 未設定のトークンがあるときは初回表示で自動的に開く。
 */
export function setupTokenSettings(): void {
  if (document.getElementById(DIALOG_ID)) return;

  const dialog = buildDialog();
  document.body.appendChild(dialog);

  const button = document.createElement("button");
  button.className = "btn btn-ghost btn-sm btn-square token-settings-trigger";
  button.title = "GitLab トークン設定";
  button.setAttribute("aria-label", "GitLab トークン設定");
  button.innerHTML = '<i class="fa-solid fa-key"></i>';
  button.style.cssText =
    "position:fixed;right:1rem;bottom:1rem;z-index:1000;background:var(--fallback-b1,oklch(var(--b1)));box-shadow:0 1px 4px rgba(0,0,0,.3);";
  button.addEventListener("click", () => {
    fillInputs();
    dialog.showModal();
  });
  document.body.appendChild(button);

  document
    .getElementById("token-settings-save")
    ?.addEventListener("click", () => {
      for (const key of TOKEN_KEYS) {
        const input = document.getElementById(
          `token-input-${key}`,
        ) as HTMLInputElement | null;
        if (input) setToken(key, input.value);
      }
      dialog.close();
      location.reload();
    });

  document
    .getElementById("token-settings-cancel")
    ?.addEventListener("click", () => dialog.close());

  document
    .getElementById("token-settings-clear")
    ?.addEventListener("click", () => {
      for (const key of TOKEN_KEYS) setToken(key, "");
      fillInputs();
    });

  if (hasMissingTokens()) {
    fillInputs();
    dialog.showModal();
  }
}
