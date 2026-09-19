// 設定定数（TypeScript版）

declare global {
  interface Window {
    RELEASE_MANAGER_CONFIG?: {
      TRIGGER_TOKEN?: string;
      READ_TOKEN?: string; // APP用
      INFRA_GITLAB_TOKEN?: string; // INFRA用
    };
  }
}

export const CONFIG = {
  GITLAB: {
    BASE_URL: "https://gitlab.example.com",
    API_VERSION: "v4",
    PROJECT_ID: "your-org/tools/release-manager",
    INFRASTRUCTURE_PROJECT_ID: "your-org/infrastructure/helm/application",
  },
  PIPELINE: {
    get TRIGGER_TOKEN() {
      return window.RELEASE_MANAGER_CONFIG?.TRIGGER_TOKEN || "";
    },
    get READ_TOKEN() {
      return window.RELEASE_MANAGER_CONFIG?.READ_TOKEN || "";
    },
    get INFRA_GITLAB_TOKEN() {
      return window.RELEASE_MANAGER_CONFIG?.INFRA_GITLAB_TOKEN || "";
    },
    TRIGGER_URL:
      "https://gitlab.example.com/api/v4/projects/your-org%2Ftools%2Frelease-manager/trigger/pipeline",
  },
  SERVICES: {
    CONFIG_URL: "../config/release-config.yaml",
  },
  UI: {
    MAX_LOG_LINES: 1000,
    AUTO_SCROLL: true,
    MR_POLL_INTERVAL: 3000, // 3秒（進捗更新を滑らかに）
    MR_MAX_WAIT: 1800000, // 30分
    PIPELINE_POLL_INTERVAL: 3000, // 3秒（進捗更新を滑らかに）
    PIPELINE_MAX_WAIT: 1800000, // 30分
    PIPELINE_DETECTION_INTERVAL: 3000, // 3秒（パイプライン検出リトライ間隔）
    PIPELINE_DETECTION_MAX_WAIT: 300000, // 5分（パイプライン検出タイムアウト）
  },
} as const;

export interface DeployStep {
  id: number;
  name: string;
  icon: string;
  waitForUser?: boolean;
}

export const TAG_STEPS: readonly DeployStep[] = [
  { id: 1, name: "アプリMR作成", icon: "fa-code-branch" },
  { id: 2, name: "アプリMRマージ待ち", icon: "fa-clock", waitForUser: true },
  { id: 3, name: "releaseビルド & タグ作成", icon: "fa-tag" },
  { id: 4, name: "CI/CDパイプライン", icon: "fa-cog" },
] as const;

export const HELM_STEPS: readonly DeployStep[] = [
  { id: 5, name: "Helm MR作成", icon: "fa-code-branch" },
] as const;

export const DEPLOY_STEPS: readonly DeployStep[] = [
  ...TAG_STEPS,
  ...HELM_STEPS,
] as const;

export const MR_POLLING = {
  INTERVAL: 10000, // 10秒間隔
  MAX_WAIT: 1200000, // 20分タイムアウト
} as const;

export const PIPELINE_POLLING = {
  INTERVAL: 10000, // 10秒間隔
  MAX_WAIT: 1800000, // 30分タイムアウト
} as const;

export type VersionType = "sprint" | "patch" | "custom";

export function calculateTagName(
  versionType: VersionType,
  version: string,
  prefix: string = "v",
): string {
  if (versionType === "sprint") {
    if (version.includes(".")) {
      return `${prefix}1.${version}`;
    }
    return `${prefix}1.${version}.0`;
  } else if (versionType === "patch") {
    return `${prefix}${version}`;
  } else {
    return version.startsWith(prefix) ? version : `${prefix}${version}`;
  }
}
