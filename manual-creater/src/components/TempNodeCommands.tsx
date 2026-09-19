import { useState } from "react";
import { Copy, Check, ChevronRight, ChevronDown, Terminal } from "lucide-react";
import { copyToClipboard } from "../lib/clipboard";
import {
  projects,
  generateRunCommand,
  generateMigrationCommands,
  type Env,
  type ProjectId,
} from "../data/services";

const projectIds: ProjectId[] = ["project-a", "project-b"];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      title="コピー"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function CommandBlock({
  label,
  command,
  defaultOpen = true,
}: {
  label: string;
  command: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-border/50 first:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-accent/30 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="font-mono text-xs text-muted-foreground">{label}</span>
        <div className="ml-auto">
          <CopyButton text={command} />
        </div>
      </button>
      {open && (
        <div className="px-4 pb-3">
          <pre className="p-3 rounded-lg bg-zinc-950 text-zinc-200 text-xs font-mono leading-relaxed overflow-x-auto">
            {command}
          </pre>
        </div>
      )}
    </div>
  );
}

export function TempNodeCommands() {
  const [projectId, setProjectId] = useState<ProjectId>("project-a");
  const [env, setEnv] = useState<Env>("dev");
  const [version, setVersion] = useState("");

  const project = projects[projectId];

  const envTabs: { value: Env; label: string }[] = [
    { value: "dev", label: "dev" },
    { value: "tes", label: "tes" },
    { value: "prd", label: "prd" },
  ];

  return (
    <div>
      <div className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          temp-node コマンド一覧
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          サービスごとの temp-node 起動・接続・削除コマンド
        </p>
      </div>

      {/* プロジェクト切替 + 環境切替 */}
      <div className="flex flex-wrap items-center gap-4 mb-8">
        {/* プロジェクト切替 */}
        <div className="flex gap-1 p-1 bg-accent/50 rounded-lg">
          {projectIds.map((id) => (
            <button
              key={id}
              onClick={() => setProjectId(id)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                projectId === id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {projects[id].label}
              <span className="ml-1.5 text-xs opacity-70">
                {projects[id].description}
              </span>
            </button>
          ))}
        </div>

        {/* 環境切替 */}
        <div className="flex gap-1 p-1 bg-accent/50 rounded-lg">
          {envTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setEnv(tab.value)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                env === tab.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* バージョン入力 */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground whitespace-nowrap">
            version
          </label>
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="例: 2.161.1"
            className="w-36 px-3 py-1.5 text-sm font-mono rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      {/* サービスカード一覧 */}
      <div className="grid gap-4">
        {project.services.map((service) => (
          <div
            key={service.name}
            className="rounded-xl border border-border bg-card overflow-hidden"
          >
            {/* カードヘッダー */}
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border/50">
              <Terminal className="h-4 w-4 text-primary shrink-0" />
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-sm text-foreground">
                  {service.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {service.displayName}
                </span>
              </div>
              <span className="ml-auto text-xs font-mono text-muted-foreground bg-accent/50 px-2 py-0.5 rounded">
                {service.namespace}
              </span>
            </div>

            {/* コマンド一覧 */}
            <CommandBlock
              label="kubectl run"
              command={generateRunCommand(service)}
            />

            {generateMigrationCommands(
              service,
              project.id,
              project.clusters[env].ecrBase,
              env,
              version,
            ).map((cmd) => (
              <CommandBlock
                key={cmd.label}
                label={cmd.label}
                command={cmd.command}
              />
            ))}
            {service.envName && (
              <CommandBlock
                label="mysql 接続"
                command={`mysql -h $DB_HOST -u $DB_USER -p$DB_PASSWORD $DB_NAME`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
