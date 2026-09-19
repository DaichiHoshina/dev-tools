export type ToolCategory = "deploy" | "monitoring" | "dev-support" | "docs";

export interface ToolLink {
  label: string;
  href: string;
  icon: string;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  icon: string;
  href: string;
  status: "active" | "coming-soon";
  category: ToolCategory;
  links?: ToolLink[];
  favicon?: string;
  type?: "web" | "cli";
  installCommand?: string;
  repoUrl?: string;
  featured?: boolean;
}

export const tools: Tool[] = [
  {
    id: "kube-lens",
    name: "Kube Lens",
    description:
      "K8s初心者向けダッシュボード。Pod/Deployment/Eventをわかりやすく表示。dev/stg/prd環境切替、ログ閲覧対応。kubectl proxy必要。",
    icon: "fa-magnifying-glass",
    href: "/devtools/kube-lens/",
    status: "active",
    category: "monitoring",
  },
  {
    id: "release-manager",
    name: "Release Manager",
    description:
      "環境へのデプロイ管理UI。サービスの選択、バージョン確認、デプロイ実行が可能。",
    icon: "fa-rocket",
    href: "/devtools/release-manager/",
    status: "active",
    category: "deploy",
    featured: true,
    favicon: "favicons/release-manager.svg",
    links: [
      {
        label: "GitLab CI でデプロイ",
        href: "https://gitlab.example.com/your-org/devtools/release-manager/-/pipelines/new",
        icon: "fa-gitlab",
      },
    ],
  },
  {
    id: "kube-deploy",
    name: "Kube Deploy",
    description:
      "KubernetesのDeploymentイメージをチケット番号でオーバーライドするCLI。複数環境対応。",
    icon: "fa-terminal",
    href: "https://gitlab.example.com/your-org/devtools/kube-deploy",
    status: "active",
    category: "deploy",
    type: "cli",
    repoUrl: "https://gitlab.example.com/your-org/devtools/kube-deploy",
    installCommand:
      'curl -fsSL https://gitlab.example.com/your-org/devtools/kube-deploy/-/raw/main/install-remote.sh | GITLAB_TOKEN="$GITLAB_PERSONAL_ACCESS_TOKEN" bash',
  },
  {
    id: "manual-creater",
    name: "手順書作成ツール",
    description:
      "テンプレートから手順書を自動生成。必要な情報を入力するだけで定型フォーマットの手順書を作成。",
    icon: "fa-file-lines",
    href: "/devtools/manual-creater/",
    status: "active",
    category: "docs",
    favicon: "favicons/manual-creater.svg",
  },
  {
    id: "gitlab-grep",
    name: "GitLab Grep",
    description:
      "GitLab MR検索ツール。ユーザー別MR一覧・パイプライン状態・リベース・Slack共有。",
    icon: "fa-code-branch",
    href: "/devtools/gitlab-grep/",
    status: "active",
    category: "dev-support",
  },
  {
    id: "sql-studio",
    name: "SQL Studio",
    description:
      "dev/tes環境のDBをブラウザからクエリ実行・閲覧できるWebツール。SQLエディタとデータビューア機能を提供。",
    icon: "fa-database",
    href: "https://gitlab.example.com/your-org/devtools/sql-studio",
    status: "active",
    category: "monitoring",
  },
  {
    id: "claude-session-board",
    name: "Claude Session Board",
    description:
      "起動中のClaude Codeセッションをリアルタイムで可視化。会話履歴・Jiraチケット・リンクをダッシュボードで確認。",
    icon: "fa-display",
    href: "/devtools/claude-session-board/",
    status: "active",
    category: "dev-support",
  },
];
