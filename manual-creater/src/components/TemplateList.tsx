import { useNavigate } from "react-router";
import { Plus } from "lucide-react";
import { templates } from "../templates";
import type { Template, TemplateCategory } from "../types/template";

const categoryLabels: Record<TemplateCategory, string> = {
  release: "デプロイ",
  operation: "運用",
};

function TemplateCard({ template }: { template: Template }) {
  const navigate = useNavigate();

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="font-medium text-base text-foreground mb-2">
        {template.name}
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">
        {template.description}
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(`/template/${template.id}`)}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          新規作成
        </button>
      </div>
    </div>
  );
}

export function TemplateList() {
  const categories = [...new Set(templates.map((t) => t.category))];

  return (
    <div>
      <div className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          手順書作成
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          テンプレートを選択して手順書を作成
        </p>
      </div>
      {categories.map((category) => (
        <div key={category} className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            {categoryLabels[category]}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates
              .filter((t) => t.category === category)
              .map((template) => (
                <TemplateCard key={template.id} template={template} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
