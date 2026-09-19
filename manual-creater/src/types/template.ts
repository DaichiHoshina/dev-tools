export type FieldType =
  | "text"
  | "textarea"
  | "select"
  | "checkbox"
  | "date"
  | "datetime"
  | "list"
  | "checklist"
  | "command-template";

export type TemplateCategory = "release" | "operation";

export interface TemplateField {
  id: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
  defaultValue?: string | boolean;
  help?: string;
  commandCategory?: "sql" | "terraform" | "git" | "gcloud";
}

export interface TemplateSection {
  id: string;
  title: string;
  description?: string;
  fields: TemplateField[];
  repeatable?: boolean;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  sections: TemplateSection[];
  outputTemplate: string;
}

export interface FormValues {
  [key: string]: string | boolean | string[];
}

