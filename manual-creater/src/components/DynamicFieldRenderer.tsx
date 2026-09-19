import type { TemplateField } from "../types/template";

interface Props {
  field: TemplateField;
  value: string;
  onChange: (value: string) => void;
}

export function DynamicFieldRenderer({ field, value, onChange }: Props) {
  const inputClass =
    "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

  const renderInput = () => {
    switch (field.type) {
      case "text":
        return (
          <input
            type="text"
            id={field.id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className={inputClass}
          />
        );

      case "datetime":
        return (
          <input
            type="datetime-local"
            id={field.id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          />
        );

      case "date":
        return (
          <input
            type="date"
            id={field.id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          />
        );

      case "textarea":
        return (
          <textarea
            id={field.id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            rows={4}
            className={inputClass}
          />
        );

      case "select":
        return (
          <select
            id={field.id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          >
            <option value="">選択してください</option>
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case "checkbox":
        return (
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input
              type="checkbox"
              id={field.id}
              checked={value === "true"}
              onChange={(e) => onChange(e.target.checked ? "true" : "false")}
              className="rounded border-input"
            />
            {field.label}
          </label>
        );

      case "checklist":
        return (
          <textarea
            id={field.id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || "1行1項目で入力"}
            rows={5}
            className={inputClass}
          />
        );

      case "command-template":
        return (
          <textarea
            id={field.id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            rows={6}
            className={`${inputClass} font-mono`}
          />
        );

      case "list":
        return (
          <textarea
            id={field.id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || "1行1項目で入力"}
            rows={4}
            className={inputClass}
          />
        );

      default:
        return (
          <input
            type="text"
            id={field.id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className={inputClass}
          />
        );
    }
  };

  // checkbox はラベルを内部に含むため、外側のラベルは不要
  if (field.type === "checkbox") {
    return <div>{renderInput()}</div>;
  }

  return (
    <div>
      <label
        htmlFor={field.id}
        className="block text-sm font-medium text-foreground mb-2"
      >
        {field.label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {renderInput()}
      {field.help && (
        <p className="mt-1.5 text-xs text-muted-foreground">{field.help}</p>
      )}
    </div>
  );
}
