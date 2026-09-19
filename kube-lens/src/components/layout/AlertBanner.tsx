import { useState, useEffect, useRef } from "hono/jsx/dom";
import type { K8sClient } from "~/lib/k8s-client";
import type { Pod } from "~/lib/types";

interface AlertItem {
  /** 一意キー: namespace/podName */
  key: string;
  podName: string;
  namespace: string;
  severity: "critical" | "warning";
  reason: string;
}

const STORAGE_KEY = "kube-lens-notifications-enabled";
const PENDING_THRESHOLD_MS = 5 * 60 * 1000; // 5分

function detectAlerts(pods: Pod[]): AlertItem[] {
  const alerts: AlertItem[] = [];
  for (const pod of pods) {
    const key = `${pod.namespace}/${pod.name}`;

    if (pod.phase === "CrashLoopBackOff") {
      alerts.push({
        key,
        podName: pod.name,
        namespace: pod.namespace,
        severity: "critical",
        reason: "CrashLoopBackOff",
      });
      continue;
    }

    // OOMKilled はコンテナの stateReason をチェック
    const oomContainer = pod.containers.find(
      (c) => c.stateReason === "OOMKilled",
    );
    if (oomContainer) {
      alerts.push({
        key,
        podName: pod.name,
        namespace: pod.namespace,
        severity: "critical",
        reason: "OOMKilled",
      });
      continue;
    }

    // Pending 長期化
    if (pod.phase === "Pending" && pod.startTime) {
      const elapsed = Date.now() - new Date(pod.startTime).getTime();
      if (elapsed > PENDING_THRESHOLD_MS) {
        alerts.push({
          key,
          podName: pod.name,
          namespace: pod.namespace,
          severity: "warning",
          reason: "Pending (5min+)",
        });
      }
    }
  }
  return alerts;
}

function isNotificationsEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== "0";
}

function sendBrowserNotification(newAlerts: AlertItem[]): void {
  if (!isNotificationsEnabled()) return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (document.hasFocus()) return;

  const critical = newAlerts.filter((a) => a.severity === "critical");
  if (critical.length === 0) return;

  const body = critical
    .map((a) => `${a.reason}: ${a.podName}`)
    .slice(0, 5)
    .join("\n");

  const notification = new Notification("Kube Lens - 異常検知", {
    body,
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='26' cy='26' r='18' fill='none' stroke='%23ee0000' stroke-width='6'/%3E%3Cline x1='38' y1='38' x2='56' y2='56' stroke='%23ee0000' stroke-width='6' stroke-linecap='round'/%3E%3C/svg%3E",
    tag: "kube-lens-alert",
  });

  notification.onclick = () => {
    window.focus();
    location.hash = "#/pods";
    notification.close();
  };
}

interface AlertBannerProps {
  client: K8sClient;
  selectedNamespaces: string[];
}

export function AlertBanner({ client, selectedNamespaces }: AlertBannerProps) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const prevKeysRef = useRef<Set<string> | null>(new Set());

  // Hono JSX workaround: async setState
  const pendingRef = useRef<AlertItem[] | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const applyPending = () => {
    if (!pendingRef.current) return;
    const newAlerts = pendingRef.current;
    pendingRef.current = null;

    // ブラウザ通知: 新規の異常のみ
    const prevKeys = prevKeysRef.current ?? new Set<string>();
    const brandNew = newAlerts.filter((a) => !prevKeys.has(a.key));
    if (brandNew.length > 0) {
      sendBrowserNotification(brandNew);
    }
    prevKeysRef.current = new Set(newAlerts.map((a) => a.key));

    setAlerts(newAlerts);
  };

  useEffect(() => {
    const nsKey = selectedNamespaces.join(",");
    if (!nsKey) return;

    let cancelled = false;

    const load = async () => {
      try {
        const results = await Promise.all(
          selectedNamespaces.map((ns) =>
            client.getPodsInNamespace(ns).catch(() => [] as Pod[]),
          ),
        );
        if (cancelled) return;
        const allPods = results.flat();
        pendingRef.current = detectAlerts(allPods);
        triggerRef.current?.click();
      } catch {
        // ignore
      }
    };

    void load();
    const id = setInterval(() => void load(), client.config.refreshInterval);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [
    selectedNamespaces.join(","),
    client.config.environment,
    client.config.refreshInterval,
  ]);

  // 初回: ブラウザ通知の許可リクエスト
  useEffect(() => {
    if (!isNotificationsEnabled()) return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  const visible = alerts.filter((a) => !dismissed.has(a.key));
  if (visible.length === 0) {
    return (
      <span ref={triggerRef} onClick={applyPending} style="display:none" />
    );
  }

  const hasCritical = visible.some((a) => a.severity === "critical");

  return (
    <>
      <span ref={triggerRef} onClick={applyPending} style="display:none" />
      <div
        class="px-4 py-2 text-xs flex items-center gap-2"
        style={`background: ${hasCritical ? "oklch(var(--er) / 0.12)" : "oklch(var(--wa) / 0.12)"}; border-bottom: 1px solid ${hasCritical ? "oklch(var(--er) / 0.3)" : "oklch(var(--wa) / 0.3)"}`}
      >
        <i
          class={`fas ${hasCritical ? "fa-circle-exclamation" : "fa-triangle-exclamation"} shrink-0`}
          style={`color: ${hasCritical ? "oklch(var(--er))" : "oklch(var(--wa))"}`}
        />
        <div class="flex-1 flex flex-wrap gap-x-3 gap-y-1">
          {visible.map((a) => (
            <a
              key={a.key}
              href="#/pods"
              class="font-medium hover:underline"
              style={`color: ${a.severity === "critical" ? "oklch(var(--er))" : "oklch(var(--wa))"}`}
            >
              {a.podName}
              <span class="font-normal ml-1" style="opacity: 0.7">
                ({a.reason})
              </span>
            </a>
          ))}
        </div>
        <button
          type="button"
          class="btn btn-ghost btn-xs rounded"
          style="color: var(--text-muted)"
          title="閉じる"
          onClick={() => {
            setDismissed(new Set([...dismissed, ...visible.map((a) => a.key)]));
          }}
        >
          <i class="fas fa-xmark" />
        </button>
      </div>
    </>
  );
}
