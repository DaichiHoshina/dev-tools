import { useState, useEffect } from "hono/jsx/dom";
import { matchRoute, getHashPath } from "~/lib/router";
import type { RouteMatch } from "~/lib/router";

export function useRouter(): RouteMatch & { fullHash: string } {
  const [hash, setHash] = useState<string>(() => getHashPath());

  useEffect(() => {
    const handler = () => {
      setHash(getHashPath());
    };
    window.addEventListener("hashchange", handler);
    return () => {
      window.removeEventListener("hashchange", handler);
    };
  }, []);

  const route = matchRoute(hash);
  return { ...route, fullHash: hash };
}
