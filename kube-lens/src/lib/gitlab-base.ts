/** GitLab API の共通定数・ユーティリティ */

export const GITLAB_BASE = "/gitlab-api/api/v4";
export const GITLAB_HOST =
  import.meta.env.VITE_GITLAB_HOST ?? "gitlab.example.com";

// URL-encoded project paths (configure via VITE_ env variables)
export const INFRA_PROJECT = import.meta.env.VITE_GITLAB_INFRA_PROJECT ?? "";
export const RELEASE_TES_PROJECT =
  import.meta.env.VITE_GITLAB_RELEASE_PROJECT ?? "";

export function getReadToken(): string {
  return import.meta.env.VITE_GITLAB_READ_TOKEN ?? "";
}

export function hasGitLabTokens(): boolean {
  return getReadToken() !== "";
}
