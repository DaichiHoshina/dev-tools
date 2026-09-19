import { useState, useEffect, useCallback } from "react";
import type { SavedQuery } from "../types";

export function useLocalQueries() {
  const [queries, setQueries] = useState<SavedQuery[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQueries = useCallback(async () => {
    try {
      const res = await fetch("/api/queries");
      if (!res.ok) return;
      const data = await res.json();
      setQueries(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueries();
  }, [fetchQueries]);

  const saveQuery = useCallback(
    async (query: Omit<SavedQuery, "id" | "createdAt" | "updatedAt">) => {
      const res = await fetch("/api/queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query),
      });
      if (!res.ok) throw new Error(`Save failed: HTTP ${res.status}`);
      const saved = await res.json();
      await fetchQueries();
      return saved as SavedQuery;
    },
    [fetchQueries],
  );

  const updateQuery = useCallback(
    async (id: string, updates: Partial<SavedQuery>) => {
      const res = await fetch(`/api/queries/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(`Update failed: HTTP ${res.status}`);
      const updated = await res.json();
      await fetchQueries();
      return updated as SavedQuery;
    },
    [fetchQueries],
  );

  const deleteQuery = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/queries/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: HTTP ${res.status}`);
      await fetchQueries();
    },
    [fetchQueries],
  );

  const importFromRedash = useCallback(
    async (
      redashQueryIds: number[],
    ): Promise<{ imported: number; skipped: number }> => {
      const res = await fetch("/api/import-from-redash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redashQueryIds }),
      });
      if (!res.ok) throw new Error(`Import failed: HTTP ${res.status}`);
      const data = (await res.json()) as {
        imported: number;
        skipped: number;
        items: unknown[];
      };
      await fetchQueries();
      return { imported: data.imported, skipped: data.skipped };
    },
    [fetchQueries],
  );

  return {
    queries,
    loading,
    saveQuery,
    updateQuery,
    deleteQuery,
    importFromRedash,
    refresh: fetchQueries,
  };
}
