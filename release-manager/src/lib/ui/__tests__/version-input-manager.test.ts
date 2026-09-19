import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  VersionInputManager,
  calculateDefaultMinorVersion,
} from "../version-input-manager";
import { ReleaseManagerAPI } from "../../api/gitlab";

describe("calculateDefaultMinorVersion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("基準日2026-01-29T16:00+09:00はv3.23を返す", () => {
    vi.setSystemTime(new Date("2026-01-29T16:00:00+09:00"));
    expect(calculateDefaultMinorVersion()).toBe(23);
  });

  it("基準日の1週間後はv3.24を返す", () => {
    vi.setSystemTime(new Date("2026-02-05T16:00:00+09:00"));
    expect(calculateDefaultMinorVersion()).toBe(24);
  });

  it("基準日の2週間後はv3.25を返す", () => {
    vi.setSystemTime(new Date("2026-02-12T16:00:00+09:00"));
    expect(calculateDefaultMinorVersion()).toBe(25);
  });

  it("基準日の1週間前でも23を返す（負の値は0扱い）", () => {
    vi.setSystemTime(new Date("2026-01-22T16:00:00+09:00"));
    expect(calculateDefaultMinorVersion()).toBe(23);
  });

  it("基準日の数時間前でも23を返す", () => {
    vi.setSystemTime(new Date("2026-01-29T10:00:00+09:00"));
    expect(calculateDefaultMinorVersion()).toBe(23);
  });

  it("基準日の数時間後も23を返す（1週間未満）", () => {
    vi.setSystemTime(new Date("2026-01-30T10:00:00+09:00"));
    expect(calculateDefaultMinorVersion()).toBe(23);
  });
});

describe("VersionInputManager", () => {
  let versionInputManager: VersionInputManager;
  let mockApi: ReleaseManagerAPI;

  beforeEach(() => {
    // DOM環境をクリア
    document.body.innerHTML = "";
    mockApi = {
      getLatestTag: vi.fn(),
    } as unknown as ReleaseManagerAPI;
    versionInputManager = new VersionInputManager(mockApi);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("fetchCurrentVersion", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-02-05T16:00:00+09:00")); // minor=24の時期

      const badge = document.createElement("span");
      badge.id = "current-ver-test-service";
      document.body.appendChild(badge);

      const minorInput = document.createElement("input");
      minorInput.id = "version-minor-test-service";
      document.body.appendChild(minorInput);

      const buildInput = document.createElement("input");
      buildInput.id = "version-build-test-service";
      document.body.appendChild(buildInput);


    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("現在のタグを取得してバッジに表示", async () => {
      vi.mocked(mockApi.getLatestTag).mockResolvedValue("v3.24.5");

      await versionInputManager.fetchCurrentVersion("test-service", {
        app_repo: "test-repo",
      } as any);

      const badge = document.getElementById("current-ver-test-service");
      expect(badge?.textContent).toBe("v3.24.5");
      expect(badge?.className).toBe("badge badge-info badge-sm font-mono");
    });

    it("タグがない場合はバッジを非表示にする", async () => {
      vi.mocked(mockApi.getLatestTag).mockResolvedValue("");

      await versionInputManager.fetchCurrentVersion("test-service", {
        app_repo: "test-repo",
      } as any);

      const badge = document.getElementById("current-ver-test-service");
      expect(badge?.style.display).toBe("none");
    });

    it("エラー時は「エラー」バッジを表示", async () => {
      vi.mocked(mockApi.getLatestTag).mockRejectedValue(new Error("API error"));

      await versionInputManager.fetchCurrentVersion("test-service", {
        app_repo: "test-repo",
      } as any);

      const badge = document.getElementById("current-ver-test-service");
      expect(badge?.textContent).toBe("エラー");
      expect(badge?.className).toBe("badge badge-error");
    });

    it("マイナーバージョンを木曜16時ベースで計算", async () => {
      vi.mocked(mockApi.getLatestTag).mockResolvedValue("v3.24.5");

      await versionInputManager.fetchCurrentVersion("test-service", {
        app_repo: "test-repo",
      } as any);

      const minorInput = document.getElementById(
        "version-minor-test-service",
      ) as HTMLInputElement;
      expect(minorInput.value).toBe("24");
    });

    it("同じminorの場合はビルド番号を+1", async () => {
      vi.mocked(mockApi.getLatestTag).mockResolvedValue("v3.24.5");

      await versionInputManager.fetchCurrentVersion("test-service", {
        app_repo: "test-repo",
      } as any);

      const buildInput = document.getElementById(
        "version-build-test-service",
      ) as HTMLInputElement;
      expect(buildInput.value).toBe("6");
    });

    it("異なるminorの場合はビルド番号を0", async () => {
      vi.mocked(mockApi.getLatestTag).mockResolvedValue("v3.23.10");

      await versionInputManager.fetchCurrentVersion("test-service", {
        app_repo: "test-repo",
      } as any);

      const buildInput = document.getElementById(
        "version-build-test-service",
      ) as HTMLInputElement;
      expect(buildInput.value).toBe("0");
    });

    it("タグがない場合はビルド番号を0", async () => {
      vi.mocked(mockApi.getLatestTag).mockResolvedValue("");

      await versionInputManager.fetchCurrentVersion("test-service", {
        app_repo: "test-repo",
      } as any);

      const buildInput = document.getElementById(
        "version-build-test-service",
      ) as HTMLInputElement;
      expect(buildInput.value).toBe("0");
    });

    it("不正なタグ形式の場合はビルド番号を0", async () => {
      vi.mocked(mockApi.getLatestTag).mockResolvedValue("invalid-tag");

      await versionInputManager.fetchCurrentVersion("test-service", {
        app_repo: "test-repo",
      } as any);

      const buildInput = document.getElementById(
        "version-build-test-service",
      ) as HTMLInputElement;
      expect(buildInput.value).toBe("0");
    });

    it("DOM要素が存在しない場合は何もしない", async () => {
      document.body.innerHTML = "";

      await expect(
        versionInputManager.fetchCurrentVersion("non-existent", {
          app_repo: "test-repo",
        } as any),
      ).resolves.not.toThrow();
    });
  });
});
