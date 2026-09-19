import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildEcrImage,
  extractTag,
  getOverrides,
  setDeploymentImage,
  saveOverride,
  removeOverride,
} from "./image-override-client";

// ─── 純粋関数 ──────────────────────────────────────────────────────────────

describe("buildEcrImage", () => {
  it("レジストリ/ecrPath:タグ の形式で返す", () => {
    expect(buildEcrImage("your-org/services/api-server", "dev-abc1234")).toBe(
      "your-registry.example.com/your-org/services/api-server:dev-abc1234",
    );
  });

  it("サブパスが深くても正しく結合する", () => {
    const result = buildEcrImage("your-org/frontend/web", "staging-ff00112");
    expect(result).toBe(
      "your-registry.example.com/your-org/frontend/web:staging-ff00112",
    );
  });
});

describe("extractTag", () => {
  it("コンテナイメージURIからタグ部分を抽出する", () => {
    expect(
      extractTag("your-registry.example.com/your-org/services/web:dev-abc1234"),
    ).toBe("dev-abc1234");
  });

  it("コロンが複数ある場合は最後のコロン以降を返す", () => {
    expect(extractTag("registry:5000/repo/svc:v1.2.3")).toBe("v1.2.3");
  });

  it("コロンがない場合は 'unknown' を返す", () => {
    expect(extractTag("registry/repo/svc")).toBe("unknown");
  });

  it("空文字列の場合は 'unknown' を返す", () => {
    expect(extractTag("")).toBe("unknown");
  });
});

// ─── fetch系関数 ────────────────────────────────────────────────────────────

describe("getOverrides", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("version付き形式のConfigMapからオーバーライドデータを取得する", async () => {
    const wrapped = {
      version: 1,
      overrides: {
        "api-server": {
          ticket: "PROJ-100",
          namespace: "backend",
          ecr_repo: "your-org/services/api-server",
          original_tag: "dev-old1234",
          override_tag: "dev-abc1234",
          deployed_by: "kube-deploy",
          run_by: "kube-deploy",
          deployed_at: "2026-02-22T00:00:00.000Z",
          ttl_hours: 24,
          mr_url: "",
        },
      },
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { overrides: JSON.stringify(wrapped) } }),
    });

    const result = await getOverrides("default", "dev");
    expect(result).toEqual(wrapped.overrides);
    expect(mockFetch).toHaveBeenCalledWith(
      "/k8s/default/dev/api/v1/namespaces/default/configmaps/dev-image-overrides",
      undefined,
    );
  });

  it("旧 kube-lens 形式のConfigMapを正規化して返す", async () => {
    const legacy = {
      "api-server": {
        tag: "dev-abc1234",
        image:
          "your-registry.example.com/your-org/services/api-server:dev-abc1234",
        originalImage:
          "your-registry.example.com/your-org/services/api-server:dev-old1234",
        deployedAt: "2026-02-22T00:00:00.000Z",
      },
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { overrides: JSON.stringify(legacy) } }),
    });

    const result = await getOverrides("default", "dev");
    expect(result["api-server"]).toEqual({
      ticket: "",
      namespace: "",
      ecr_repo: "your-org/services/api-server",
      original_tag: "dev-old1234",
      override_tag: "dev-abc1234",
      deployed_by: "kube-lens",
      run_by: "kube-lens",
      deployed_at: "2026-02-22T00:00:00.000Z",
      ttl_hours: 0,
      mr_url: "",
    });
  });

  it("404の場合は空オブジェクトを返す", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const result = await getOverrides("default", "dev");
    expect(result).toEqual({});
  });

  it("ネットワークエラーの場合は空オブジェクトを返す", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const result = await getOverrides("default", "dev");
    expect(result).toEqual({});
  });

  it("AbortSignalを渡せる", async () => {
    const controller = new AbortController();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { overrides: "{}" } }),
    });
    await getOverrides("default", "staging", controller.signal);
    expect(mockFetch).toHaveBeenCalledWith(
      "/k8s/default/staging/api/v1/namespaces/default/configmaps/staging-image-overrides",
      { signal: controller.signal },
    );
  });

  it("ConfigMapにdataキーがない場合は空オブジェクトを返す", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    const result = await getOverrides("default", "dev");
    expect(result).toEqual({});
  });
});

describe("setDeploymentImage", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("正しいURLとbodyでPATCHリクエストを送る", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await setDeploymentImage(
      "default",
      "dev",
      "backend",
      "api-server",
      "registry/api:v1",
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "/k8s/default/dev/apis/apps/v1/namespaces/backend/deployments/api-server",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/strategic-merge-patch+json",
        },
        body: JSON.stringify({
          spec: {
            template: {
              spec: {
                containers: [{ name: "api-server", image: "registry/api:v1" }],
              },
            },
          },
        }),
      },
    );
  });

  it("レスポンスがエラーの場合は例外をスローする", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      text: async () => "access denied",
    });

    await expect(
      setDeploymentImage(
        "default",
        "dev",
        "backend",
        "api-server",
        "registry/api:v1",
      ),
    ).rejects.toThrow(/Deploy failed: 403 Forbidden/);
  });

  it("staging環境では /k8s/default/staging/ プレフィックスを使う", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    await setDeploymentImage(
      "default",
      "staging",
      "frontend",
      "web-frontend",
      "registry/web:v1",
    );
    const calls = mockFetch.mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[0]).toBe(
      "/k8s/default/staging/apis/apps/v1/namespaces/frontend/deployments/web-frontend",
    );
  });
});

describe("saveOverride", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-22T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("既存のオーバーライドに新しいエントリを追加してConfigMapを更新する", async () => {
    const existing = {
      version: 1,
      overrides: {
        "web-frontend": {
          ticket: "",
          namespace: "frontend",
          ecr_repo: "your-org/frontend/web",
          original_tag: "dev-orig",
          override_tag: "dev-old",
          deployed_by: "kube-lens",
          run_by: "kube-lens",
          deployed_at: "2026-02-21T00:00:00.000Z",
          ttl_hours: 0,
          mr_url: "",
        },
      },
    };

    // getOverrides呼び出し（既存データ取得）
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { overrides: JSON.stringify(existing) } }),
    });
    // saveOverrideMap PATCH呼び出し
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await saveOverride({
      project: "default",
      env: "dev",
      serviceName: "api-server",
      namespace: "backend",
      ecrRepo: "your-org/services/api-server",
      originalTag: "dev-original",
      overrideTag: "dev-abc1234",
    });

    // 2回目のfetch (PATCH) のbodyを検証
    const patchBody = JSON.parse(mockFetch.mock.calls[1][1].body as string);
    const savedWrapped = JSON.parse(patchBody.data.overrides as string);

    // version ラッパーが付いている
    expect(savedWrapped.version).toBe(1);
    // 既存のweb-frontendエントリが残っている
    expect(savedWrapped.overrides["web-frontend"]).toBeDefined();
    // 新しいapi-serverエントリが追加されている
    expect(savedWrapped.overrides["api-server"]).toEqual({
      ticket: "",
      namespace: "backend",
      ecr_repo: "your-org/services/api-server",
      original_tag: "dev-original",
      override_tag: "dev-abc1234",
      deployed_by: "kube-lens",
      run_by: "kube-lens",
      deployed_at: "2026-02-22T10:00:00.000Z",
      ttl_hours: 0,
      mr_url: "",
    });
  });
});

describe("removeOverride", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("指定サービスのオーバーライドを削除し復元先フルイメージURIを返す", async () => {
    const existing = {
      version: 1,
      overrides: {
        "api-server": {
          ticket: "",
          namespace: "backend",
          ecr_repo: "your-org/services/api-server",
          original_tag: "dev-original",
          override_tag: "dev-abc",
          deployed_by: "kube-lens",
          run_by: "kube-lens",
          deployed_at: "2026-02-22T00:00:00.000Z",
          ttl_hours: 0,
          mr_url: "",
        },
      },
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { overrides: JSON.stringify(existing) } }),
    });
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const originalImage = await removeOverride("default", "dev", "api-server");

    expect(originalImage).toBe(
      "your-registry.example.com/your-org/services/api-server:dev-original",
    );

    // PATCH bodyにapi-serverが含まれていない
    const patchBody = JSON.parse(mockFetch.mock.calls[1][1].body as string);
    const savedWrapped = JSON.parse(patchBody.data.overrides as string);
    expect(savedWrapped.version).toBe(1);
    expect(savedWrapped.overrides["api-server"]).toBeUndefined();
  });

  it("存在しないサービスの場合はnullを返す", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { overrides: "{}" } }),
    });
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await removeOverride("default", "dev", "nonexistent");
    expect(result).toBeNull();
  });
});
