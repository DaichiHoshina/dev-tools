// LocalStorage管理（TypeScript版）

export interface ServiceBranchStatus {
  serviceName: string;
  aheadCount: number;
  error?: string;
  mrs?: Array<{
    title: string;
    iid: number;
    url: string;
  }>;
}

export interface BranchComparisonCache {
  aheadCount: number;
  lastChecked: string;
  services?: ServiceBranchStatus[];
}

export class BranchComparisonStorage {
  private static readonly KEY = "branch_comparison_cache";

  static save(cache: BranchComparisonCache): void {
    Storage.set(this.KEY, cache);
  }

  static get(): BranchComparisonCache | null {
    return Storage.get<BranchComparisonCache | null>(this.KEY, null);
  }

  static clear(): void {
    Storage.remove(this.KEY);
  }
}

export interface PipelineMonitorState {
  service: string;
  tagName: string;
  pipelineId: number;
  pipelineUrl: string;
  startedAt: string;
}

export class PipelineMonitorStorage {
  private static readonly KEY_PREFIX = "deploy:pipeline:";

  static save(state: PipelineMonitorState): void {
    Storage.set(this.KEY_PREFIX + state.service, state);
  }

  static get(service: string): PipelineMonitorState | null {
    return Storage.get<PipelineMonitorState | null>(
      this.KEY_PREFIX + service,
      null,
    );
  }

  static remove(service: string): void {
    Storage.remove(this.KEY_PREFIX + service);
  }

  static getAll(): PipelineMonitorState[] {
    const results: PipelineMonitorState[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.KEY_PREFIX)) {
        const value = Storage.get<PipelineMonitorState | null>(key, null);
        if (value) results.push(value);
      }
    }
    return results;
  }
}

export interface DeployHistoryEntry {
  service: string;
  tagName: string;
  status: "success" | "failed";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  pipelineUrl?: string;
}

export class DeployHistoryStorage {
  private static readonly KEY = "deploy_history";
  private static readonly MAX_ENTRIES = 100;

  static getAll(): DeployHistoryEntry[] {
    return Storage.get<DeployHistoryEntry[]>(this.KEY, []);
  }

  static add(entry: DeployHistoryEntry): void {
    const entries = this.getAll();
    entries.unshift(entry);
    if (entries.length > this.MAX_ENTRIES) {
      entries.length = this.MAX_ENTRIES;
    }
    Storage.set(this.KEY, entries);
  }
}

export const MR_TITLE_PRESETS = {
  tes: "[TES] Release",
  prd: "[PRD] Release",
} as const;

export const DEFAULT_MR_TITLE_TEMPLATE = MR_TITLE_PRESETS.tes;

export class MrTitleTemplateStorage {
  private static readonly KEY = "mr_title_template";
  private static readonly PRD_KEY = "mr_title_template_prd";

  static get(defaultValue: string = DEFAULT_MR_TITLE_TEMPLATE): string {
    const key = defaultValue === MR_TITLE_PRESETS.prd ? this.PRD_KEY : this.KEY;
    const value = Storage.get<string>(key, defaultValue);
    // 旧形式（{service}/{tag}変数入り）が残っていたらデフォルトにフォールバック
    if (value.includes("{service}") || value.includes("{tag}")) {
      Storage.remove(key);
      return defaultValue;
    }
    return value;
  }

  static save(template: string, env: "tes" | "prd" = "tes"): void {
    const key = env === "prd" ? this.PRD_KEY : this.KEY;
    if (!template) {
      Storage.remove(key);
    } else {
      Storage.set(key, template);
    }
  }

  static resolve(template: string, service: string, tag: string): string {
    return template.replace("{service}", service).replace("{tag}", tag);
  }
}

export class Storage {
  static get<T>(key: string, defaultValue: T): T {
    const data = localStorage.getItem(key);
    if (!data) return defaultValue;
    try {
      return JSON.parse(data);
    } catch {
      console.warn(`Invalid JSON in localStorage: ${key}`);
      return defaultValue;
    }
  }

  static set<T>(key: string, value: T): void {
    localStorage.setItem(key, JSON.stringify(value));
  }

  static remove(key: string): void {
    localStorage.removeItem(key);
  }

  static clear(): void {
    localStorage.clear();
  }
}
