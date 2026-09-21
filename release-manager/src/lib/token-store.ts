// GitLab トークンの保管場所。
//
// 以前は CI が build 後の HTML の <head> に <script> でトークンを差し込み、
// GitLab Pages で配信していた。その方式ではページのソースを開いた全員が
// トークンを読めるため、利用者が自分のトークンを入力して各自のブラウザに
// 置く方式へ変更した。

export type TokenKey = "TRIGGER_TOKEN" | "READ_TOKEN" | "INFRA_GITLAB_TOKEN";

export const TOKEN_KEYS: readonly TokenKey[] = [
  "TRIGGER_TOKEN",
  "READ_TOKEN",
  "INFRA_GITLAB_TOKEN",
];

const STORAGE_PREFIX = "release-manager:token:";

/**
 * トークンを読む。localStorage を優先し、未設定なら
 * window.RELEASE_MANAGER_CONFIG を参照する (ローカル開発での差し込み用)。
 */
export function getToken(key: TokenKey): string {
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + key);
    if (stored) return stored;
  } catch {
    // Storage が使用不可 (private mode 等) のときは window 側へ進む
  }
  return window.RELEASE_MANAGER_CONFIG?.[key] ?? "";
}

export function setToken(key: TokenKey, value: string): void {
  try {
    const trimmed = value.trim();
    if (trimmed) {
      localStorage.setItem(STORAGE_PREFIX + key, trimmed);
    } else {
      localStorage.removeItem(STORAGE_PREFIX + key);
    }
  } catch {
    // 保存できない場合はこのタブ内だけの設定として扱う
  }
}

export function clearTokens(): void {
  try {
    for (const key of TOKEN_KEYS) {
      localStorage.removeItem(STORAGE_PREFIX + key);
    }
  } catch {
    // 削除できなくても表示側の動作は変わらない
  }
}

/** 必須トークンが 1 つでも未設定なら true。設定画面の誘導に使う。 */
export function hasMissingTokens(): boolean {
  return !getToken("READ_TOKEN") || !getToken("TRIGGER_TOKEN");
}
