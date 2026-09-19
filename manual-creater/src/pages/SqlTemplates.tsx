import { useState } from "react";
import {
  Copy,
  Check,
  ChevronRight,
  ChevronDown,
  Database,
} from "lucide-react";
import { copyToClipboard } from "../lib/clipboard";
import { SQL_TEMPLATES } from "../data/sql-templates";

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

function SqlCard({
  label,
  description,
  sql,
}: {
  label: string;
  description: string;
  sql: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-accent/30 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <Database className="h-4 w-4 text-primary shrink-0" />
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-sm text-foreground">{label}</span>
          <span className="text-xs text-muted-foreground">{description}</span>
        </div>
        <div className="ml-auto" onClick={(e) => e.stopPropagation()}>
          <CopyButton text={sql} />
        </div>
      </button>
      {open && (
        <div className="px-4 pb-3 border-t border-border/50">
          <pre className="mt-3 p-3 rounded-lg bg-zinc-950 text-zinc-200 text-xs font-mono leading-relaxed overflow-x-auto">
            {sql}
          </pre>
        </div>
      )}
    </div>
  );
}

export function SqlTemplates() {
  return (
    <div>
      <div className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          SQL テンプレート
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          頻出の DB 操作パターン（プレースホルダーを書き換えて使用）
        </p>
      </div>

      <div className="grid gap-4">
        {SQL_TEMPLATES.map((tmpl) => (
          <SqlCard
            key={tmpl.label}
            label={tmpl.label}
            description={tmpl.description}
            sql={tmpl.sql}
          />
        ))}
      </div>
    </div>
  );
}
