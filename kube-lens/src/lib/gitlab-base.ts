/** GitLab API の共通定数・ユーティリティ */

export const GITLAB_BASE = "/gitlab-api/api/v4";
export const GITLAB_HOST =
  import.meta.env.VITE_GITLAB_HOST ?? "gitlab.example.com";

// URL-encoded project paths (configure via VITE_ env variables)
export const INFRA_PROJECT = import.meta.env.VITE_GITLAB_INFRA_PROJECT ?? "";
export const RELEASE_TES_PROJECT =
  import.meta.env.VITE_GITLAB_RELEASE_PROJECT ?? "";

// トークンの保存先。VITE_ prefix の env はビルド時に JS へ展開されるため、
// 配信物からトークンを読み取れてしまう。利用者が設定画面で入力した値を
// このブラウザにだけ保存する。
const TOKEN_STORAGE_KEY = "kube-lens:gitlab-read-token";

export function getReadToken(): string {
  try {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // Storage が使用不可なら env 側の値へ進む
  }
  // ローカル開発で .env に置いた値を使うための経路。
  // import.meta.env.DEV は本番ビルドで false に置換され、この分岐ごと
  // 削除されるため、配信物に VITE_GITLAB_READ_TOKEN の値は出力されない。
  if (import.meta.env.DEV) {
    return import.meta.env.VITE_GITLAB_READ_TOKEN ?? "";
  }
  return "";
}

export function setReadToken(token: string): void {
  try {
    const trimmed = token.trim();
    if (trimmed) {
      localStorage.setItem(TOKEN_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // 保存できない場合はこのタブ内だけの設定として扱う
  }
}

export function hasGitLabTokens(): boolean {
  return getReadToken() !== "";
}
