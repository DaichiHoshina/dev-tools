import { useState, useEffect, useCallback, useMemo } from "react";
import type { QueryTemplate } from "../types";
import { presetTemplates } from "../data/presetTemplates";

export function useTemplates() {
  const [userTemplates, setUserTemplates] = useState<QueryTemplate[]>([]);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/templates");
      if (!res.ok) return;
      const data = await res.json();
      setUserTemplates(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const templates = useMemo(
    () => [...presetTemplates, ...userTemplates],
    [userTemplates],
  );

  const saveTemplate = useCallback(
    async (
      template: Pick<
        QueryTemplate,
        "name" | "sql" | "description" | "category"
      >,
    ) => {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(template),
      });
      if (!res.ok) throw new Error(`Save failed: HTTP ${res.status}`);
      const saved = await res.json();
      await fetchTemplates();
      return saved as QueryTemplate;
    },
    [fetchTemplates],
  );

  const deleteTemplate = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: HTTP ${res.status}`);
      await fetchTemplates();
    },
    [fetchTemplates],
  );

  return { templates, saveTemplate, deleteTemplate, refresh: fetchTemplates };
}
