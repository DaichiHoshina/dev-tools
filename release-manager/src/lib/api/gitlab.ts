// GitLab API Client (TypeScript版)
import { CONFIG } from "../config";

// GitLab API型定義
export interface GitLabUser {
  id: number;
  username: string;
  name: string;
  email: string;
}

export interface GitLabProject {
  id: number;
  name: string;
  path: string;
  web_url: string;
}

export interface GitLabPipeline {
  id: number;
  iid: number;
  status:
    | "created"
    | "waiting_for_resource"
    | "preparing"
    | "pending"
    | "running"
    | "success"
    | "failed"
    | "canceled"
    | "skipped"
    | "manual";
  ref: string;
  sha?: string;
  web_url: string;
  created_at: string;
  updated_at: string;
}

export interface GitLabJob {
  id: number;
  name: string;
  status: string;
  stage: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  web_url: string;
}

export interface GitLabTag {
  name: string;
  message?: string;
  target: string;
  commit: {
    id: string;
    short_id: string;
    created_at: string;
    title: string;
  };
}

export interface GitLabMergeRequest {
  id: number;
  iid: number;
  title: string;
  description: string;
  state: "opened" | "closed" | "locked" | "merged";
  source_branch: string;
  target_branch: string;
  web_url: string;
  created_at: string;
  updated_at: string;
  merge_status?:
    | "can_be_merged"
    | "cannot_be_merged"
    | "unchecked"
    | "checking";
  detailed_merge_status?: string;
  has_conflicts?: boolean;
  blocking_discussions_resolved?: boolean;
  merge_commit_sha?: string;
}

export interface GitLabBranch {
  name: string;
  merged: boolean;
  commit: {
    id: string;
    short_id: string;
    created_at: string;
    title: string;
  };
  web_url: string;
}

export interface GitLabCommit {
  id: string;
  short_id: string;
  title: string;
  created_at: string;
  author_name: string;
  author_email: string;
  message: string;
}

export interface GitLabBranchComparison {
  commit: GitLabCommit;
  commits: GitLabCommit[];
  diffs: unknown[];
  compare_timeout: boolean;
  compare_same_ref: boolean;
}

export interface ServiceConfig {
  services: Record<string, ServiceDefinition>;
  environments: Record<string, EnvironmentConfig>;
}

export interface ServiceDefinition {
  app_repo: string;
  values_file: string;
  argocd_app: string;
  namespace: string;
  tag_prefix: string;
}

export interface EnvironmentConfig {
  gitlab: {
    base_url: string;
    project_group: string;
  };
}

/**
 * GitLab API Client
 */
export class GitLabAPI {
  protected baseUrl: string;
  protected apiVersion: string;

  constructor() {
    this.baseUrl = CONFIG.GITLAB.BASE_URL;
    this.apiVersion = CONFIG.GITLAB.API_VERSION;
  }

  /**
   * プロジェクトパスからトークンを選択
   * - infrastructure/* → INFRA_GITLAB_TOKEN
   * - それ以外 → APP_GITLAB_TOKEN
   * - フォールバック: READ_TOKEN
   */
  protected getTokenForProject(projectPath?: string): string {
    // infrastructure/* → INFRA_GITLAB_TOKEN
    // それ以外 → READ_TOKEN（APP用として使用）
    let token: string;
    if (projectPath?.includes("infrastructure")) {
      token =
        CONFIG.PIPELINE.INFRA_GITLAB_TOKEN || CONFIG.PIPELINE.READ_TOKEN || "";
    } else {
      token = CONFIG.PIPELINE.READ_TOKEN || "";
    }

    if (!token) {
      const tokenType = projectPath?.includes("infrastructure")
        ? "INFRA_GITLAB_TOKEN"
        : "READ_TOKEN";
      throw new Error(
        `GitLab APIトークンが未設定です（${tokenType}）。設定画面でトークンを登録してください。`,
      );
    }

    return token;
  }

  /**
   * トークンが設定されているか確認
   */
  hasToken(): boolean {
    return !!(CONFIG.PIPELINE.READ_TOKEN || CONFIG.PIPELINE.INFRA_GITLAB_TOKEN);
  }

  /**
   * トークンを設定（互換性のため維持・非推奨）
   * @deprecated CI/CD変数でトークンを管理してください
   */
  setToken(_token: string): void {
    console.warn("setToken is deprecated. Use CI/CD variables instead.");
  }

  /**
   * API リクエスト
   * @param endpoint APIエンドポイント
   * @param options fetch オプション
   * @param projectPath プロジェクトパス（トークン選択用）
   */
  async request<T = unknown>(
    endpoint: string,
    options: RequestInit = {},
    projectPath?: string,
  ): Promise<T> {
    const url = `${this.baseUrl}/api/${this.apiVersion}${endpoint}`;
    const token = this.getTokenForProject(projectPath);
    const headers: HeadersInit = {
      "PRIVATE-TOKEN": token,
      "Content-Type": "application/json",
      ...options.headers,
    };

    try {
      const response = await fetch(url, { ...options, headers });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `GitLab APIエラー: ${response.status} ${response.statusText}\n${errorText}`,
        );
      }

      // 204 No Content の場合は null を返す
      if (response.status === 204) {
        return null as T;
      }

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        return response.json() as Promise<T>;
      } else {
        return response.text() as unknown as T;
      }
    } catch (error) {
      console.error("GitLab API request error:", error);
      throw error;
    }
  }

  /**
   * 現在のユーザー情報を取得（トークン検証用）
   */
  async getCurrentUser(): Promise<GitLabUser> {
    return this.request<GitLabUser>("/user");
  }

  /**
   * プロジェクト情報を取得
   */
  async getProject(projectId: string): Promise<GitLabProject> {
    return this.request<GitLabProject>(
      `/projects/${encodeURIComponent(projectId)}`,
      {},
      projectId,
    );
  }

  /**
   * パイプライン一覧を取得
   */
  async getPipelines(
    projectId: string,
    params: Record<string, string> = {},
  ): Promise<GitLabPipeline[]> {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = `/projects/${encodeURIComponent(projectId)}/pipelines${
      queryString ? "?" + queryString : ""
    }`;
    return this.request<GitLabPipeline[]>(endpoint, {}, projectId);
  }

  /**
   * パイプライン実行をトリガー
   */
  async triggerPipeline(
    projectId: string,
    ref: string,
    variables: Array<{ key: string; value: string }> = [],
  ): Promise<GitLabPipeline> {
    const endpoint = `/projects/${encodeURIComponent(projectId)}/pipeline`;
    return this.request<GitLabPipeline>(
      endpoint,
      {
        method: "POST",
        body: JSON.stringify({
          ref,
          variables,
        }),
      },
      projectId,
    );
  }

  /**
   * パイプライン状態を取得
   */
  async getPipelineStatus(
    projectId: string,
    pipelineId: number,
  ): Promise<GitLabPipeline> {
    const endpoint = `/projects/${encodeURIComponent(projectId)}/pipelines/${pipelineId}`;
    return this.request<GitLabPipeline>(endpoint, {}, projectId);
  }

  /**
   * パイプラインジョブ一覧を取得
   */
  async getPipelineJobs(
    projectId: string,
    pipelineId: number,
  ): Promise<GitLabJob[]> {
    const endpoint = `/projects/${encodeURIComponent(projectId)}/pipelines/${pipelineId}/jobs`;
    return this.request<GitLabJob[]>(endpoint, {}, projectId);
  }

  /**
   * ジョブログを取得
   */
  async getJobLog(projectId: string, jobId: number): Promise<string> {
    const endpoint = `/projects/${encodeURIComponent(projectId)}/jobs/${jobId}/trace`;
    return this.request<string>(endpoint, {}, projectId);
  }

  /**
   * パイプラインをキャンセル
   */
  async cancelPipeline(
    projectId: string,
    pipelineId: number,
  ): Promise<GitLabPipeline> {
    const endpoint = `/projects/${encodeURIComponent(projectId)}/pipelines/${pipelineId}/cancel`;
    return this.request<GitLabPipeline>(
      endpoint,
      { method: "POST" },
      projectId,
    );
  }

  /**
   * リポジトリのタグ一覧を取得
   */
  async getTags(
    projectId: string,
    params: Record<string, string> = {},
  ): Promise<GitLabTag[]> {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = `/projects/${encodeURIComponent(projectId)}/repository/tags${
      queryString ? "?" + queryString : ""
    }`;
    return this.request<GitLabTag[]>(endpoint, {}, projectId);
  }

  /**
   * 特定のタグ情報を取得
   */
  async getTag(projectId: string, tagName: string): Promise<GitLabTag> {
    const endpoint = `/projects/${encodeURIComponent(
      projectId,
    )}/repository/tags/${encodeURIComponent(tagName)}`;
    return this.request<GitLabTag>(endpoint, {}, projectId);
  }

  /**
   * ファイル内容を取得
   */
  async getFile(
    projectId: string,
    filePath: string,
    ref: string = "master",
  ): Promise<string> {
    const endpoint = `/projects/${encodeURIComponent(
      projectId,
    )}/repository/files/${encodeURIComponent(filePath)}/raw?ref=${encodeURIComponent(ref)}`;
    return this.request<string>(endpoint, {}, projectId);
  }

  /**
   * ファイルに関連するコミット履歴を取得
   */
  async getFileCommits(
    projectId: string,
    filePath: string,
    params: Record<string, string> = {},
  ): Promise<GitLabCommit[]> {
    const queryParams = new URLSearchParams({
      path: filePath,
      ...params,
    }).toString();
    const endpoint = `/projects/${encodeURIComponent(
      projectId,
    )}/repository/commits?${queryParams}`;
    return this.request<GitLabCommit[]>(endpoint, {}, projectId);
  }

  /**
   * マージリクエスト一覧を取得
   */
  async getMergeRequests(
    projectId: string,
    params: Record<string, string> = {},
  ): Promise<GitLabMergeRequest[]> {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = `/projects/${encodeURIComponent(projectId)}/merge_requests${
      queryString ? "?" + queryString : ""
    }`;
    return this.request<GitLabMergeRequest[]>(endpoint, {}, projectId);
  }

  /**
   * マージリクエストを作成
   */
  async createMergeRequest(
    projectId: string,
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description: string = "",
  ): Promise<GitLabMergeRequest> {
    const endpoint = `/projects/${encodeURIComponent(projectId)}/merge_requests`;
    return this.request<GitLabMergeRequest>(
      endpoint,
      {
        method: "POST",
        body: JSON.stringify({
          source_branch: sourceBranch,
          target_branch: targetBranch,
          title,
          description,
        }),
      },
      projectId,
    );
  }

  /**
   * マージリクエストを取得
   */
  async getMergeRequest(
    projectId: string,
    mrIid: number,
  ): Promise<GitLabMergeRequest> {
    const endpoint = `/projects/${encodeURIComponent(projectId)}/merge_requests/${mrIid}`;
    return this.request<GitLabMergeRequest>(endpoint, {}, projectId);
  }

  /**
   * MRをマージ
   */
  async mergeMergeRequest(
    projectId: string,
    mrIid: number,
    options: {
      squash?: boolean;
      removeSourceBranch?: boolean;
      mergeWhenPipelineSucceeds?: boolean;
    } = {},
  ): Promise<GitLabMergeRequest> {
    const endpoint = `/projects/${encodeURIComponent(projectId)}/merge_requests/${mrIid}/merge`;
    return this.request<GitLabMergeRequest>(
      endpoint,
      {
        method: "PUT",
        body: JSON.stringify({
          squash: options.squash ?? false,
          should_remove_source_branch: options.removeSourceBranch ?? true,
          merge_when_pipeline_succeeds:
            options.mergeWhenPipelineSucceeds ?? true,
        }),
      },
      projectId,
    );
  }

  /**
   * MRを承認（Approve）
   */
  async approveMergeRequest(
    projectId: string,
    mrIid: number,
  ): Promise<unknown> {
    const endpoint = `/projects/${encodeURIComponent(projectId)}/merge_requests/${mrIid}/approve`;
    return this.request(endpoint, { method: "POST" }, projectId);
  }

  /**
   * MRをクローズ
   */
  async closeMergeRequest(
    projectId: string,
    mrIid: number,
  ): Promise<GitLabMergeRequest> {
    const endpoint = `/projects/${encodeURIComponent(projectId)}/merge_requests/${mrIid}`;
    return this.request<GitLabMergeRequest>(
      endpoint,
      {
        method: "PUT",
        body: JSON.stringify({
          state_event: "close",
        }),
      },
      projectId,
    );
  }

  /**
   * タグを作成
   */
  async createTag(
    projectId: string,
    tagName: string,
    ref: string,
    message: string = "",
  ): Promise<GitLabTag> {
    const endpoint = `/projects/${encodeURIComponent(projectId)}/repository/tags`;
    return this.request<GitLabTag>(
      endpoint,
      {
        method: "POST",
        body: JSON.stringify({
          tag_name: tagName,
          ref,
          message,
        }),
      },
      projectId,
    );
  }

  /**
   * ファイルを更新（コミット）
   */
  async updateFile(
    projectId: string,
    filePath: string,
    branch: string,
    content: string,
    commitMessage: string,
  ): Promise<unknown> {
    const endpoint = `/projects/${encodeURIComponent(
      projectId,
    )}/repository/files/${encodeURIComponent(filePath)}`;
    return this.request(
      endpoint,
      {
        method: "PUT",
        body: JSON.stringify({
          branch,
          content,
          commit_message: commitMessage,
        }),
      },
      projectId,
    );
  }

  /**
   * ブランチを作成
   */
  async createBranch(
    projectId: string,
    branchName: string,
    ref: string,
  ): Promise<GitLabBranch> {
    const endpoint = `/projects/${encodeURIComponent(projectId)}/repository/branches`;
    return this.request<GitLabBranch>(
      endpoint,
      {
        method: "POST",
        body: JSON.stringify({
          branch: branchName,
          ref,
        }),
      },
      projectId,
    );
  }

  async searchBranches(
    projectId: string,
    search: string,
  ): Promise<GitLabBranch[]> {
    const endpoint = `/projects/${encodeURIComponent(projectId)}/repository/branches?search=${encodeURIComponent(search)}`;
    return this.request<GitLabBranch[]>(endpoint, {}, projectId);
  }

  /**
   * ブランチを削除
   */
  async deleteBranch(projectId: string, branchName: string): Promise<void> {
    const endpoint = `/projects/${encodeURIComponent(projectId)}/repository/branches/${encodeURIComponent(branchName)}`;
    await this.request<void>(endpoint, { method: "DELETE" }, projectId);
  }

  /**
   * 2つのブランチ間のコミット差分を取得
   * @param projectId プロジェクトID
   * @param from 比較元ブランチ
   * @param to 比較先ブランチ
   * @returns コミット差分情報
   */
  async compareBranches(
    projectId: string,
    from: string,
    to: string,
  ): Promise<GitLabBranchComparison> {
    const endpoint = `/projects/${encodeURIComponent(projectId)}/repository/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    return this.request<GitLabBranchComparison>(endpoint, {}, projectId);
  }

  /**
   * コミットに関連するMR一覧を取得
   * @param projectId プロジェクトID
   * @param sha コミットSHA
   * @returns 関連するMR一覧
   */
  async getCommitMergeRequests(
    projectId: string,
    sha: string,
  ): Promise<GitLabMergeRequest[]> {
    const endpoint = `/projects/${encodeURIComponent(projectId)}/repository/commits/${sha}/merge_requests`;
    return this.request<GitLabMergeRequest[]>(endpoint, {}, projectId);
  }
}

/**
 * Release Manager 固有の操作を行うラッパークラス
 */
export class ReleaseManagerAPI extends GitLabAPI {
  private projectId: string;
  private infraProjectId: string;

  constructor() {
    super();
    this.projectId = CONFIG.GITLAB.PROJECT_ID;
    this.infraProjectId = CONFIG.GITLAB.INFRASTRUCTURE_PROJECT_ID;
  }

  /**
   * サービス設定を取得（config/release-config.yamlから）
   */
  async getServiceConfig(): Promise<ServiceConfig> {
    try {
      // YAMLファイルを取得してパース
      const yamlContent = await this.getFile(
        this.projectId,
        "config/release-config.yaml",
        "master",
      );

      return this._parseSimpleYAML(yamlContent);
    } catch (error) {
      console.error("サービス設定の取得に失敗しました:", error);
      // フォールバック: ハードコーディング
      return this._getDefaultServiceConfig();
    }
  }

  /**
   * デプロイを実行（CIパイプライン経由）
   * tagName: "v3.24.0" → VERSION: "3.24.0" に変換してCIに渡す
   */
  async deploy(service: string, tagName: string): Promise<GitLabPipeline> {
    const version = tagName.replace(/^v/, "");
    const variables = [
      { key: "SERVICE_NAME", value: service },
      { key: "VERSION", value: version },
      { key: "TARGET", value: "tes" },
    ];
    return this.triggerPipeline(this.projectId, "master", variables);
  }

  async syncArgoCD(
    serviceName: string,
    target: "tes" | "prd" = "tes",
  ): Promise<GitLabPipeline> {
    const variables = [
      { key: "SERVICE_NAME", value: serviceName },
      { key: "ARGOCD_SYNC", value: "true" },
      { key: "TARGET", value: target },
    ];

    return this.triggerPipeline(this.projectId, "master", variables);
  }

  /**
   * CIパイプライン経由でArgoCD APIからライブimage.tagを取得する
   * 1. ARGOCD_GET_TAG=true でパイプラインをトリガー
  /**
   * サービスの最新タグを取得
   */
  async getLatestTag(
    appRepo: string,
    tagPrefix: string = "v",
  ): Promise<string | null> {
    try {
      const projectPath = appRepo;
      const tags = await this.getTags(projectPath, {
        order_by: "updated",
        sort: "desc",
        per_page: "10",
      });

      const matchedTags = tags.filter((tag) => tag.name.startsWith(tagPrefix));
      return matchedTags.length > 0 ? matchedTags[0].name : null;
    } catch (error) {
      console.error("最新タグの取得に失敗しました:", error);
      return null;
    }
  }

  /**
   * YAMLパーサー（js-yaml使用）
   */
  private _parseSimpleYAML(yamlContent: string): ServiceConfig {
    // グローバルのjsyamlを使用（CDNから読み込み）
    if (typeof (window as any).jsyaml === "undefined") {
      throw new Error(
        "js-yamlが読み込まれていません。index.htmlにCDNスクリプトを追加してください。",
      );
    }
    return (window as any).jsyaml.load(yamlContent) as ServiceConfig;
  }

  /**
   * デフォルトサービス設定
   */
  private _getDefaultServiceConfig(): ServiceConfig {
    return {
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
        worker: {
          app_repo: "your-org/your-app/worker",
          values_file: "worker.yaml",
          argocd_app: "your-app-staging-worker",
          namespace: "default",
          tag_prefix: "v",
        },
      },
      environments: {
        tes: {
          gitlab: {
            base_url: "https://gitlab.example.com",
            project_group: "your-org",
          },
        },
      },
    };
  }
}
