import type {
  RedashDataSource,
  RedashJob,
  RedashQueryResult,
} from "./types.js";

export class RedashClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Key ${this.apiKey}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Redash API error ${res.status}: ${body}`);
    }

    return res.json() as Promise<T>;
  }

  async getDataSources(): Promise<RedashDataSource[]> {
    return this.request<RedashDataSource[]>("/api/data_sources");
  }

  async executeQuery(
    dataSourceId: number,
    query: string,
  ): Promise<{
    job?: { id: string };
    query_result?: { id: number; data: RedashQueryResult };
  }> {
    return this.request("/api/query_results", {
      method: "POST",
      body: JSON.stringify({
        data_source_id: dataSourceId,
        query,
        max_age: 0,
      }),
    });
  }

  async getJob(jobId: string): Promise<{ job: RedashJob }> {
    return this.request<{ job: RedashJob }>(`/api/jobs/${jobId}`);
  }

  async getQueryResult(
    resultId: number,
  ): Promise<{ query_result: { data: RedashQueryResult } }> {
    return this.request(`/api/query_results/${resultId}`);
  }

  async getSavedQueries(
    page = 1,
    pageSize = 100,
    q?: string,
  ): Promise<{
    count: number;
    results: Array<{
      id: number;
      name: string;
      query: string;
      data_source_id: number;
      tags: string[];
    }>;
  }> {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });
    if (q) params.set("q", q);
    return this.request(`/api/queries?${params.toString()}`);
  }

  async getQueryById(id: number): Promise<{
    id: number;
    name: string;
    query: string;
    data_source_id: number;
    tags: string[];
  }> {
    return this.request(`/api/queries/${id}`);
  }

  async getDataSourceSchema(
    dataSourceId: number,
  ): Promise<Array<{ name: string; columns: string[] }>> {
    const data = await this.request<{
      schema: Array<{ name: string; columns: string[] }>;
    }>(`/api/data_sources/${dataSourceId}/schema`);
    return data.schema;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}
