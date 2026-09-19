import { useState, useEffect } from "hono/jsx/dom";

export interface UseK8sDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  lastUpdated: Date | null;
}

/**
 * Hono JSX は useState が多いと再レンダリングが伝播しないバグがあるため
 * 状態を 1 つのオブジェクトにまとめる
 */
interface State<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  tick: number;
}

export function useK8sData<T>(
  fetcher: () => Promise<T>,
  refreshInterval = 30000,
  deps: unknown[] = [],
): UseK8sDataResult<T> {
  const depsKey = JSON.stringify(deps);
  const [state, setState] = useState<State<T>>({
    data: null,
    loading: true,
    error: null,
    lastUpdated: null,
    tick: 0,
  });

  const refresh = () => setState((prev) => ({ ...prev, tick: prev.tick + 1 }));

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const result = await fetcher();
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            data: result,
            loading: false,
            lastUpdated: new Date(),
          }));
        }
      } catch (err) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            error: err instanceof Error ? err.message : "Unknown error",
            loading: false,
          }));
        }
      }
    };

    void load();

    if (refreshInterval > 0) {
      const intervalId = setInterval(() => {
        void load();
      }, refreshInterval);
      return () => {
        cancelled = true;
        clearInterval(intervalId);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [state.tick, depsKey]);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    refresh,
    lastUpdated: state.lastUpdated,
  };
}
