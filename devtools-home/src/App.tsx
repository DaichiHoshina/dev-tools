import { Header } from "~/components/Header";
import { Footer } from "~/components/Footer";
import { ToolCard } from "~/components/ToolCard";
import { CliSetupBanner } from "~/components/CliSetupBanner";
import { tools } from "~/data/tools";

const USECASE_LINKS = [
  { label: "デプロイしたい", icon: "fa-rocket", href: "#section-deploy" },
  {
    label: "K8s・DBを見たい",
    icon: "fa-magnifying-glass",
    href: "#section-monitoring",
  },
  {
    label: "MRを管理したい",
    icon: "fa-code-branch",
    href: "#section-dev-support",
  },
  { label: "ドキュメントを見たい", icon: "fa-book", href: "#section-docs" },
  { label: "CLIをセットアップ", icon: "fa-terminal", href: "#cli-setup" },
];

function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div class="section-header">
      <div class="section-title">{title}</div>
      <div class="section-desc">{desc}</div>
    </div>
  );
}

export function App() {
  const deployTools = tools.filter((t) => t.category === "deploy");
  const monitoringTools = tools.filter((t) => t.category === "monitoring");
  const devSupportTools = tools.filter((t) => t.category === "dev-support");
  const docTools = tools.filter((t) => t.category === "docs");

  return (
    <div class="min-h-screen flex flex-col">
      <Header />

      <main class="flex-1 py-12 animate-fade-in">
        <div class="max-w-5xl mx-auto px-6">
          {/* Hero */}
          <section class="hero-section">
            <div class="hero-glow hero-glow-1" aria-hidden="true"></div>
            <div class="hero-glow hero-glow-2" aria-hidden="true"></div>
            <h1 class="hero-title">DevTools</h1>
            <p class="hero-subtitle">
              開発・デプロイ・監視をまとめたチーム内ツールポータル
            </p>
            <nav class="usecase-bar" aria-label="ユースケース別ナビゲーション">
              {USECASE_LINKS.map((link) => (
                <a href={link.href} class="usecase-pill">
                  <i class={`fas ${link.icon}`}></i>
                  {link.label}
                </a>
              ))}
            </nav>
          </section>

          {/* CLI Setup Banner */}
          <CliSetupBanner />

          {/* Deploy & Release */}
          <section id="section-deploy" class="mb-12">
            <SectionHeader
              title="デプロイ・リリース"
              desc="環境へのデプロイ・リリース管理、dev 環境のイメージ切替"
            />
            <div class="grid gap-4 sm:grid-cols-2">
              {deployTools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} />
              ))}
            </div>
          </section>

          {/* Monitoring & DB */}
          <section id="section-monitoring" class="mb-12">
            <SectionHeader
              title="環境・モニタリング"
              desc="Pod・ログの確認、dev / tes / prd の DB クエリ実行"
            />
            <div class="grid gap-4 sm:grid-cols-2">
              {monitoringTools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} />
              ))}
            </div>
          </section>

          {/* Dev Support */}
          <section id="section-dev-support" class="mb-12">
            <SectionHeader
              title="開発支援"
              desc="MR の一覧・リベース、開発環境の起動 / 停止、バナー画像管理"
            />
            <div class="grid gap-4 sm:grid-cols-2">
              {devSupportTools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} />
              ))}
            </div>
          </section>

          {/* Docs */}
          <section id="section-docs" class="mb-12">
            <SectionHeader
              title="ドキュメント"
              desc="リリース手順書の作成、仕様書・インフラ手順書の参照"
            />
            <div class="grid gap-4 sm:grid-cols-2">
              {docTools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} />
              ))}
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
