import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type {
  DataSource,
  Environment,
  QueryResult,
  ExecuteResponse,
  JobStatus,
  SchemaTable,
} from "../types";

export function useDataSources(refreshKey = 0) {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!hasLoadedRef.current) {
      setLoading(true);
    }
    fetch("/api/data-sources")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setDataSources(data);
          hasLoadedRef.current = true;
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  return { dataSources, loading, error };
}

export function useConfig(refreshKey = 0) {
  const [configured, setConfigured] = useState(false);
  const [redashUrl, setRedashUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!hasLoadedRef.current) {
      setLoading(true);
    }
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        setConfigured(data.configured);
        setRedashUrl(data.redashUrl || "");
        hasLoadedRef.current = true;
      })
      .catch(() => setConfigured(false))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  return { configured, redashUrl, loading };
}

export function useEnvironment() {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [currentEnv, setCurrentEnv] = useState("");

  useEffect(() => {
    fetch("/api/environments")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setEnvironments(data.environments);
        setCurrentEnv(data.current);
      })
      .catch((e) => {
        console.warn("[useEnvironment] Failed to fetch environments:", e);
      });
  }, []);

  const switchEnvironment = useCallback(async (name: string) => {
    try {
      const res = await fetch("/api/environment", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        console.warn(
          "[useEnvironment] Failed to switch environment:",
          res.status,
        );
        return;
      }
      setCurrentEnv(name);
    } catch (e) {
      console.warn("[useEnvironment] Failed to switch environment:", e);
    }
  }, []);

  return { environments, currentEnv, switchEnvironment };
}

export function useSchemaTree(dataSourceId: number | null) {
  const [rawSchema, setRawSchema] = useState<
    Array<{ name: string; columns: string[] }>
  >([]);

  useEffect(() => {
    if (!dataSourceId) {
      setRawSchema([]);
      return;
    }
    fetch(`/api/data-sources/${dataSourceId}/schema`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((tables: Array<{ name: string; columns: string[] }>) => {
        setRawSchema(tables);
      })
      .catch((e) => {
        console.warn("[useSchemaTree] Failed to fetch schema:", e);
        setRawSchema([]);
      });
  }, [dataSourceId]);

  const schema = useMemo(() => {
    const record: Record<string, string[]> = {};
    for (const t of rawSchema) {
      record[t.name] = t.columns;
    }
    return record;
  }, [rawSchema]);

  const schemaMap = useMemo(() => {
    const map = new Map<string, SchemaTable[]>();
    for (const t of rawSchema) {
      const dotIndex = t.name.indexOf(".");
      const schemaName = dotIndex >= 0 ? t.name.slice(0, dotIndex) : "_default";
      const table = dotIndex >= 0 ? t.name.slice(dotIndex + 1) : t.name;
      const entry: SchemaTable = {
        schema: schemaName,
        table,
        fullName: t.name,
        columns: t.columns,
      };
      const existing = map.get(schemaName);
      if (existing) {
        existing.push(entry);
      } else {
        map.set(schemaName, [entry]);
      }
    }
    for (const tables of map.values()) {
      tables.sort((a, b) => a.table.localeCompare(b.table));
    }
    return map;
  }, [rawSchema]);

  return { schema, schemaMap };
}

export function useQueryExecution() {
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [executionTimeMs, setExecutionTimeMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);

  const clearPolling = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const pollJob = useCallback(
    async (jobId: string, dataSourceId: number, sql: string) => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const job: JobStatus = await res.json();

        if (job.status === 3 && job.query_result_id) {
          // SUCCESS
          const resultRes = await fetch(`/api/results/${job.query_result_id}`);
          if (!resultRes.ok) throw new Error(`HTTP ${resultRes.status}`);
          const data: QueryResult = await resultRes.json();
          const elapsed = Date.now() - startTimeRef.current;
          setResult(data);
          setExecutionTimeMs(elapsed);
          setIsExecuting(false);
        } else if (job.status === 4) {
          // FAILURE
          setError(job.error || "Query execution failed");
          setIsExecuting(false);
        } else {
          // PENDING or STARTED - continue polling
          pollingRef.current = setTimeout(
            () => pollJob(jobId, dataSourceId, sql),
            1000,
          );
        }
      } catch (e) {
        setError(String(e));
        setIsExecuting(false);
      }
    },
    [],
  );

  const execute = useCallback(
    async (dataSourceId: number, sql: string) => {
      clearPolling();
      setIsExecuting(true);
      setResult(null);
      setExecutionTimeMs(null);
      setError(null);
      startTimeRef.current = Date.now();

      try {
        const res = await fetch("/api/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataSourceId, query: sql }),
        });

        const data: ExecuteResponse | { error: string } = await res.json();

        if ("error" in data) {
          setError(data.error);
          setIsExecuting(false);
          return;
        }

        if (data.status === "done") {
          setResult(data.data);
          setExecutionTimeMs(data.executionTimeMs);
          setIsExecuting(false);
        } else if (data.status === "pending") {
          pollJob(data.jobId, dataSourceId, sql);
        }
      } catch (e) {
        setError(String(e));
        setIsExecuting(false);
      }
    },
    [clearPolling, pollJob],
  );

  useEffect(() => {
    return clearPolling;
  }, [clearPolling]);

  return {
    execute,
    isExecuting,
    result,
    executionTimeMs,
    error,
  };
}
