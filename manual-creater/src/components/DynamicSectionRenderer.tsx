import type { TemplateSection } from "../types/template";
import { DynamicFieldRenderer } from "./DynamicFieldRenderer";

interface Props {
  section: TemplateSection;
  values: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
}

export function DynamicSectionRenderer({ section, values, onChange }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card p-8 mb-8">
      <h2 className="text-base font-semibold text-card-foreground mb-1">
        {section.title}
      </h2>
      {section.description && (
        <p className="text-xs text-muted-foreground mb-6">
          {section.description}
        </p>
      )}
      {!section.description && <div className="mb-6" />}
      <div className="space-y-6">
        {section.fields.map((field) => (
          <DynamicFieldRenderer
            key={field.id}
            field={field}
            value={values[field.id] ?? ""}
            onChange={(val) => onChange(field.id, val)}
          />
        ))}
      </div>
    </div>
  );
}
