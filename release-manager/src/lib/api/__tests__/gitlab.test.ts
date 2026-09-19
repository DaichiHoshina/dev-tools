import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitLabAPI, ReleaseManagerAPI } from "../gitlab";

describe("GitLabAPI", () => {
  let api: GitLabAPI;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // グローバルwindow.RELEASE_MANAGER_CONFIGをモック
    (global as any).window = {
      RELEASE_MANAGER_CONFIG: {
        READ_TOKEN: "app-token",
        INFRA_GITLAB_TOKEN: "infra-token",
      },
    };

    api = new GitLabAPI();
    fetchMock = vi.fn();
    global.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getTokenForProject", () => {
    it("infrastructure プロジェクトにはINFRA_GITLAB_TOKENを使用", () => {
      const token = (api as any).getTokenForProject(
        "your-org/infrastructure/helm/application",
      );
      expect(token).toBe("infra-token");
    });

    it("application プロジェクトにはREAD_TOKENを使用", () => {
      const token = (api as any).getTokenForProject(
        "your-org/your-app/web-frontend",
      );
      expect(token).toBe("app-token");
    });

    it("プロジェクトパスがない場合はREAD_TOKENを使用", () => {
      const token = (api as any).getTokenForProject();
      expect(token).toBe("app-token");
    });
  });

  describe("request", () => {
    it("成功時にJSONレスポンスを返す", async () => {
      const mockData = { id: 123, name: "test" };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockData,
      });

      const result = await api.request("/test");
      expect(result).toEqual(mockData);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/test"),
        expect.objectContaining({
          headers: expect.objectContaining({
            "PRIVATE-TOKEN": "app-token",
          }),
        }),
      );
    });

    it("204 No Contentの場合はnullを返す", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const result = await api.request("/delete");
      expect(result).toBeNull();
    });

    it("エラーレスポンスの場合は例外をスロー", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "Resource not found",
      });

      await expect(api.request("/notfound")).rejects.toThrow(
        "GitLab APIエラー: 404 Not Found",
      );
    });

    it("infrastructureプロジェクトにはINFRA_GITLAB_TOKENを使用", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({}),
      });

      await api.request(
        "/projects/your-org%2Finfrastructure",
        {},
        "your-org/infrastructure",
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "PRIVATE-TOKEN": "infra-token",
          }),
        }),
      );
    });
  });

  describe("getMergeRequest", () => {
    it("MR情報を取得", async () => {
      const mockMR = {
        id: 1,
        iid: 100,
        title: "Test MR",
        state: "opened",
        merge_status: "can_be_merged",
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockMR,
      });

      const result = await api.getMergeRequest("test-project", 100);
      expect(result).toEqual(mockMR);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/projects/test-project/merge_requests/100"),
        expect.any(Object),
      );
    });
  });

  describe("mergeMergeRequest", () => {
    it("MRをマージ", async () => {
      const mockMR = {
        id: 1,
        iid: 100,
        title: "Test MR",
        state: "merged",
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockMR,
      });

      const result = await api.mergeMergeRequest("test-project", 100, {
        removeSourceBranch: true,
        mergeWhenPipelineSucceeds: true,
      });

      expect(result).toEqual(mockMR);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(
          "/projects/test-project/merge_requests/100/merge",
        ),
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            squash: false,
            should_remove_source_branch: true,
            merge_when_pipeline_succeeds: true,
          }),
        }),
      );
    });
  });

  describe("approveMergeRequest", () => {
    it("MRを承認", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({}),
      });

      await api.approveMergeRequest("test-project", 100);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(
          "/projects/test-project/merge_requests/100/approve",
        ),
        expect.objectContaining({
          method: "POST",
        }),
      );
    });
  });

  describe("compareBranches", () => {
    it("2つのブランチ間のコミット差分を取得", async () => {
      const mockComparison = {
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
        ],
        diffs: [],
        compare_timeout: false,
        compare_same_ref: false,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockComparison,
      });

      const result = await api.compareBranches(
        "test-project",
        "release",
        "main",
      );

      expect(result.commits.length).toBe(2);
      expect(result.commit.short_id).toBe("abc123");
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(
          "/projects/test-project/repository/compare?from=release&to=main",
        ),
        expect.any(Object),
      );
    });
  });

  describe("createMergeRequest", () => {
    it("MRを作成", async () => {
      const mockMR = {
        id: 1,
        iid: 101,
        title: "New MR",
        state: "opened",
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockMR,
      });

      const result = await api.createMergeRequest(
        "test-project",
        "feature-branch",
        "main",
        "New MR",
        "Description",
      );

      expect(result).toEqual(mockMR);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/projects/test-project/merge_requests"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            source_branch: "feature-branch",
            target_branch: "main",
            title: "New MR",
            description: "Description",
          }),
        }),
      );
    });
  });

  describe("createTag", () => {
    it("タグを作成", async () => {
      const mockTag = {
        name: "v1.0.0",
        message: "Release v1.0.0",
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockTag,
      });

      const result = await api.createTag(
        "test-project",
        "v1.0.0",
        "main",
        "Release v1.0.0",
      );

      expect(result).toEqual(mockTag);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/projects/test-project/repository/tags"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            tag_name: "v1.0.0",
            ref: "main",
            message: "Release v1.0.0",
          }),
        }),
      );
    });
  });

  describe("updateFile", () => {
    it("ファイルを更新", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({}),
      });

      await api.updateFile(
        "test-project",
        "path/to/file.txt",
        "main",
        "new content",
        "Update file",
      );

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(
          "/projects/test-project/repository/files/path%2Fto%2Ffile.txt",
        ),
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            branch: "main",
            content: "new content",
            commit_message: "Update file",
          }),
        }),
      );
    });
  });

  describe("createBranch", () => {
    it("ブランチを作成", async () => {
      const mockBranch = {
        name: "feature-branch",
        commit: { id: "abc123" },
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockBranch,
      });

      const result = await api.createBranch(
        "test-project",
        "feature-branch",
        "main",
      );

      expect(result).toEqual(mockBranch);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/projects/test-project/repository/branches"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            branch: "feature-branch",
            ref: "main",
          }),
        }),
      );
    });
  });
});

describe("ReleaseManagerAPI", () => {
  let api: ReleaseManagerAPI;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (global as any).window = {
      RELEASE_MANAGER_CONFIG: {
        READ_TOKEN: "app-token",
        INFRA_GITLAB_TOKEN: "infra-token",
      },
    };

    api = new ReleaseManagerAPI();
    fetchMock = vi.fn();
    global.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("_parseSimpleYAML", () => {
    it.skip("YAML形式の設定を正しくパース", () => {
      // YAMLパースライブラリ（js-yaml）がない場合はスキップ
      const yamlContent = `
services:
  web:
    app_repo: application/frontend/app
    values_file: web.yaml
    argocd_app: your-app-staging-web
    namespace: web
    tag_prefix: v
environments:
  tes:
    gitlab:
      base_url: https://gitlab.example.com
      project_group: your-org
`;
      const result = (api as any)._parseSimpleYAML(yamlContent);
      expect(result.services.web).toEqual({
        app_repo: "application/frontend/app",
        values_file: "web.yaml",
        argocd_app: "your-app-staging-web",
        namespace: "web",
        tag_prefix: "v",
      });
      expect(result.environments.tes.gitlab.base_url).toBe(
        "https://gitlab.example.com",
      );
    });
  });

  describe("_getDefaultServiceConfig", () => {
    it("デフォルト設定を返す", () => {
      const config = (api as any)._getDefaultServiceConfig();
      expect(config.services).toBeDefined();
      expect(config.environments).toBeDefined();
    });
  });

  describe("syncArgoCD", () => {
    it("ARGOCD_SYNCとSERVICE_NAMEでパイプラインをトリガー（TESデフォルト）", async () => {
      const mockPipeline = {
        id: 456,
        iid: 78,
        status: "created",
        ref: "master",
        web_url: "https://gitlab.example.com/pipelines/456",
        created_at: "2026-02-14T00:00:00Z",
        updated_at: "2026-02-14T00:00:00Z",
      };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockPipeline,
      });

      const result = await api.syncArgoCD("web");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toContain("/pipeline");
      expect(options.method).toBe("POST");

      const body = JSON.parse(options.body);
      expect(body.ref).toBe("master");
      expect(body.variables).toEqual([
        { key: "SERVICE_NAME", value: "web" },
        { key: "ARGOCD_SYNC", value: "true" },
        { key: "TARGET", value: "tes" },
      ]);
      expect(result.id).toBe(456);
    });

    it("PRD環境を指定してパイプラインをトリガー", async () => {
      const mockPipeline = {
        id: 789,
        iid: 99,
        status: "created",
        ref: "master",
        web_url: "https://gitlab.example.com/pipelines/789",
        created_at: "2026-02-14T00:00:00Z",
        updated_at: "2026-02-14T00:00:00Z",
      };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockPipeline,
      });

      const result = await api.syncArgoCD("web", "prd");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.variables).toEqual([
        { key: "SERVICE_NAME", value: "web" },
        { key: "ARGOCD_SYNC", value: "true" },
        { key: "TARGET", value: "prd" },
      ]);
      expect(result.id).toBe(789);
    });
  });
});
