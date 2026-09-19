export interface Tool {
  name: string;
  description: string;
  urls: {
    dev?: string;
    tes?: string;
    prd?: string;
  };
}

export interface ToolCategory {
  name: string;
  tools: Tool[];
}

export const toolCategories: ToolCategory[] = [
  {
    name: "モニタリング",
    tools: [
      {
        name: "Cloud Logging",
        description: "GCPログ閲覧",
        urls: {
          dev: "https://console.cloud.google.com/logs",
          tes: "https://console.cloud.google.com/logs",
          prd: "https://console.cloud.google.com/logs",
        },
      },
      {
        name: "Cloud Monitoring",
        description: "GCPメトリクス・アラート",
        urls: {
          dev: "https://console.cloud.google.com/monitoring",
          tes: "https://console.cloud.google.com/monitoring",
          prd: "https://console.cloud.google.com/monitoring",
        },
      },
    ],
  },
  {
    name: "CI/CD",
    tools: [
      {
        name: "CI/CD パイプライン",
        description: "パイプライン管理",
        urls: {
          dev: "https://gitlab.example.com",
        },
      },
    ],
  },
  {
    name: "データベース",
    tools: [
      {
        name: "Cloud SQL",
        description: "データベース管理",
        urls: {
          dev: "https://console.cloud.google.com/sql",
          tes: "https://console.cloud.google.com/sql",
          prd: "https://console.cloud.google.com/sql",
        },
      },
    ],
  },
  {
    name: "インフラ",
    tools: [
      {
        name: "Cloud Run",
        description: "サービス管理",
        urls: {
          dev: "https://console.cloud.google.com/run",
          tes: "https://console.cloud.google.com/run",
          prd: "https://console.cloud.google.com/run",
        },
      },
      {
        name: "Terraform Cloud",
        description: "IaC管理",
        urls: {
          dev: "https://app.terraform.io",
        },
      },
    ],
  },
  {
    name: "ドキュメント",
    tools: [
      {
        name: "Confluence",
        description: "ドキュメント管理",
        urls: {
          prd: "https://your-domain.atlassian.net/wiki",
        },
      },
      {
        name: "Jira",
        description: "チケット管理",
        urls: {
          prd: "https://your-domain.atlassian.net",
        },
      },
    ],
  },
];
