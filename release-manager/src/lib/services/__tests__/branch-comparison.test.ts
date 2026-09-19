import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BranchComparisonService } from "../branch-comparison";
import { GitLabAPI, type ServiceConfig } from "../../api/gitlab";
import { BranchComparisonStorage } from "../../storage";
import type { GitLabBranchComparison } from "../../api/gitlab";

// LocalStorageモック
class SimpleLocalStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  keys(): string[] {
    return Array.from(this.store.keys());
  }
}

describe("BranchComparisonService", () => {
  let service: BranchComparisonService;
  let mockApi: GitLabAPI;
  let mockComparison: GitLabBranchComparison;
  let mockServiceConfig: ServiceConfig;

  beforeEach(() => {
    // LocalStorageモック
    const mockStorage = new SimpleLocalStorage();
    global.localStorage = mockStorage as unknown as Storage;

    // window.RELEASE_MANAGER_CONFIGモック
    (global as Record<string, unknown>).window = {
      RELEASE_MANAGER_CONFIG: {
        READ_TOKEN: "test-token",
      },
      setInterval: global.setInterval,
      clearInterval: global.clearInterval,
    };

    mockApi = new GitLabAPI();

    mockComparison = {
      commit: {
        id: "abc123def456",
        short_id: "abc123",
        title: "Latest commit",
        created_at: "2026-02-02T10:00:00Z",
        author_name: "Test Author",
        author_email: "test@example.com",
        message: "Latest commit message",
      },
      commits: [
        {
          id: "abc123def456",
          short_id: "abc123",
          title: "Commit 1",
          created_at: "2026-02-02T10:00:00Z",
          author_name: "Author 1",
          author_email: "author1@example.com",
          message: "Commit 1 message",
        },
        {
          id: "def456ghi789",
          short_id: "def456",
          title: "Commit 2",
          created_at: "2026-02-02T09:00:00Z",
          author_name: "Author 2",
          author_email: "author2@example.com",
          message: "Commit 2 message",
        },
        {
          id: "ghi789jkl012",
          short_id: "ghi789",
          title: "Commit 3",
          created_at: "2026-02-02T08:00:00Z",
          author_name: "Author 3",
          author_email: "author3@example.com",
          message: "Commit 3 message",
        },
      ],
      diffs: [],
      compare_timeout: false,
      compare_same_ref: false,
    };

    mockServiceConfig = {
      services: {
        "api-server": {
          app_repo: "your-org/your-app/api-server",
          values_file: "api-server.yaml",
          argocd_app: "your-app-staging-api-server",
          namespace: "default",
          tag_prefix: "v",
        },
        "web-frontend": {
          app_repo: "your-org/your-app/web-frontend",
          values_file: "web-frontend.yaml",
          argocd_app: "your-app-staging-web-frontend",
          namespace: "default",
          tag_prefix: "v",
        },
      },
      environments: {},
    };

    service = new BranchComparisonService(mockApi);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("setServiceConfig", () => {
    it("サービス設定をセット", () => {
      service.setServiceConfig(mockServiceConfig);
      expect(
        (service as unknown as { serviceConfig: ServiceConfig }).serviceConfig,
      ).toEqual(mockServiceConfig);
    });
  });

  describe("checkAllBranches", () => {
    it("全サービスのブランチ差分を取得してキャッシュに保存", async () => {
      service.setServiceConfig(mockServiceConfig);
      vi.spyOn(mockApi, "compareBranches").mockResolvedValue(mockComparison);

      const callback = vi.fn();
      await (
        service as unknown as {
          checkAllBranches: (cb: (r: unknown) => void) => Promise<void>;
        }
      ).checkAllBranches(callback);

      expect(callback).toHaveBeenCalledWith({
        totalAhead: 2,
        services: expect.arrayContaining([
          expect.objectContaining({ serviceName: "api-server", aheadCount: 3 }),
          expect.objectContaining({
            serviceName: "web-frontend",
            aheadCount: 3,
          }),
        ]),
      });

      const cache = BranchComparisonStorage.get();
      expect(cache).not.toBeNull();
      expect(cache!.aheadCount).toBe(2);
    });

    it("サービス設定がない場合はキャッシュから読み込み", async () => {
      BranchComparisonStorage.save({
        aheadCount: 1,
        lastChecked: "2026-02-02T09:00:00Z",
        services: [{ serviceName: "api-server", aheadCount: 5 }],
      });

      const callback = vi.fn();
      await (
        service as unknown as {
          checkAllBranches: (cb: (r: unknown) => void) => Promise<void>;
        }
      ).checkAllBranches(callback);

      expect(callback).toHaveBeenCalledWith({
        totalAhead: 1,
        services: [{ serviceName: "api-server", aheadCount: 5 }],
      });
    });

    it("main/masterの両方を試す", async () => {
      service.setServiceConfig(mockServiceConfig);

      // mainは失敗、masterは成功（各サービスで）
      const spy = vi.spyOn(mockApi, "compareBranches");
      spy.mockImplementation(async (_projectId, _from, to) => {
        if (to === "main") {
          throw new Error("main not found");
        }
        return mockComparison;
      });

      const callback = vi.fn();
      await (
        service as unknown as {
          checkAllBranches: (cb: (r: unknown) => void) => Promise<void>;
        }
      ).checkAllBranches(callback);

      expect(callback).toHaveBeenCalledWith({
        totalAhead: 2,
        services: expect.arrayContaining([
          expect.objectContaining({ aheadCount: 3 }),
        ]),
      });
    });
  });

  describe("startPolling", () => {
    it("ポーリングを開始", () => {
      service.setServiceConfig(mockServiceConfig);
      vi.spyOn(mockApi, "compareBranches").mockResolvedValue(mockComparison);
      vi.useFakeTimers();

      const callback = vi.fn();
      service.startPolling(callback);

      expect(
        (service as unknown as { intervalId: number | null }).intervalId,
      ).not.toBeNull();

      vi.restoreAllMocks();
      vi.useRealTimers();
    });
  });

  describe("stopPolling", () => {
    it("ポーリングを停止", () => {
      service.setServiceConfig(mockServiceConfig);
      vi.spyOn(mockApi, "compareBranches").mockResolvedValue(mockComparison);
      vi.useFakeTimers();

      const callback = vi.fn();
      service.startPolling(callback);

      expect(
        (service as unknown as { intervalId: number | null }).intervalId,
      ).not.toBeNull();

      service.stopPolling();
      expect(
        (service as unknown as { intervalId: number | null }).intervalId,
      ).toBeNull();

      vi.restoreAllMocks();
      vi.useRealTimers();
    });
  });
});
