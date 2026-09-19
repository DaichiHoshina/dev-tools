import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  calcAge,
  parsePod,
  parseDeployment,
  parseJob,
  parseArgoApplication,
  parseHPA,
} from "./k8s-client";

// ─── calcAge ──────────────────────────────────────────────────────────────────

describe("calcAge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("undefined → 'Unknown'", () => {
    expect(calcAge(undefined)).toBe("Unknown");
  });

  it("30秒前 → '30s'", () => {
    const ts = new Date("2026-01-01T11:59:30Z").toISOString();
    expect(calcAge(ts)).toBe("30s");
  });

  it("2分前 → '2m'", () => {
    const ts = new Date("2026-01-01T11:58:00Z").toISOString();
    expect(calcAge(ts)).toBe("2m");
  });

  it("3時間前 → '3h'", () => {
    const ts = new Date("2026-01-01T09:00:00Z").toISOString();
    expect(calcAge(ts)).toBe("3h");
  });

  it("2日前 → '2d'", () => {
    const ts = new Date("2025-12-30T12:00:00Z").toISOString();
    expect(calcAge(ts)).toBe("2d");
  });
});

// ─── parsePod ────────────────────────────────────────────────────────────────

function makeRawPod(overrides: {
  phase?: string;
  containerStatuses?: Array<{
    name: string;
    ready: boolean;
    restartCount: number;
    image: string;
    state?: {
      running?: unknown;
      waiting?: { reason?: string };
      terminated?: { reason?: string };
    };
  }>;
  containers?: Array<{
    name: string;
    image: string;
    resources?: {
      requests?: { cpu?: string; memory?: string };
      limits?: { cpu?: string; memory?: string };
    };
  }>;
}) {
  return {
    metadata: {
      name: "test-pod",
      namespace: "default",
      creationTimestamp: "2026-01-01T10:00:00Z",
    },
    spec: {
      containers: overrides.containers ?? [{ name: "app", image: "app:v1" }],
    },
    status: {
      phase: overrides.phase ?? "Running",
      containerStatuses: overrides.containerStatuses,
    },
  };
}

describe("parsePod", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Running 状態のPod → phase: 'Running'", () => {
    const raw = makeRawPod({
      phase: "Running",
      containerStatuses: [
        {
          name: "app",
          ready: true,
          restartCount: 0,
          image: "app:v1",
          state: { running: {} },
        },
      ],
    });
    const pod = parsePod(raw);
    expect(pod.phase).toBe("Running");
  });

  it("waiting.reason が CrashLoopBackOff → phase: 'CrashLoopBackOff'", () => {
    const raw = makeRawPod({
      phase: "Running",
      containerStatuses: [
        {
          name: "app",
          ready: false,
          restartCount: 5,
          image: "app:v1",
          state: { waiting: { reason: "CrashLoopBackOff" } },
        },
      ],
    });
    const pod = parsePod(raw);
    expect(pod.phase).toBe("CrashLoopBackOff");
  });

  it("Pending 状態 → phase: 'Pending'", () => {
    const raw = makeRawPod({ phase: "Pending" });
    const pod = parsePod(raw);
    expect(pod.phase).toBe("Pending");
  });

  it("複数コンテナの readyCount が正しく計算される", () => {
    const raw = makeRawPod({
      phase: "Running",
      containers: [
        { name: "app", image: "app:v1" },
        { name: "sidecar", image: "sidecar:v1" },
      ],
      containerStatuses: [
        {
          name: "app",
          ready: true,
          restartCount: 0,
          image: "app:v1",
          state: { running: {} },
        },
        {
          name: "sidecar",
          ready: false,
          restartCount: 0,
          image: "sidecar:v1",
          state: { running: {} },
        },
      ],
    });
    const pod = parsePod(raw);
    expect(pod.readyContainers).toBe(1);
    expect(pod.totalContainers).toBe(2);
  });

  it("restartCount の合計計算が正しい", () => {
    const raw = makeRawPod({
      phase: "Running",
      containers: [
        { name: "app", image: "app:v1" },
        { name: "sidecar", image: "sidecar:v1" },
      ],
      containerStatuses: [
        {
          name: "app",
          ready: true,
          restartCount: 3,
          image: "app:v1",
          state: { running: {} },
        },
        {
          name: "sidecar",
          ready: true,
          restartCount: 2,
          image: "sidecar:v1",
          state: { running: {} },
        },
      ],
    });
    const pod = parsePod(raw);
    expect(pod.restarts).toBe(5);
  });

  it("containerStatuses が undefined の場合 → readyContainers: 0", () => {
    const raw = makeRawPod({
      phase: "Running",
      containerStatuses: undefined,
    });
    const pod = parsePod(raw);
    expect(pod.readyContainers).toBe(0);
  });

  it("spec.containers の resources がパススルーされる", () => {
    const raw = makeRawPod({
      phase: "Running",
      containers: [
        {
          name: "app",
          image: "app:v1",
          resources: {
            requests: { cpu: "5m", memory: "128Mi" },
            limits: { cpu: "100m", memory: "256Mi" },
          },
        },
      ],
      containerStatuses: [
        {
          name: "app",
          ready: true,
          restartCount: 0,
          image: "app:v1",
          state: { running: {} },
        },
      ],
    });
    const pod = parsePod(raw);
    expect(pod.containers[0].resources).toEqual({
      requests: { cpu: "5m", memory: "128Mi" },
      limits: { cpu: "100m", memory: "256Mi" },
    });
  });

  it("resources が未定義の場合 → undefined", () => {
    const raw = makeRawPod({
      phase: "Running",
      containers: [{ name: "app", image: "app:v1" }],
      containerStatuses: [
        {
          name: "app",
          ready: true,
          restartCount: 0,
          image: "app:v1",
          state: { running: {} },
        },
      ],
    });
    const pod = parsePod(raw);
    expect(pod.containers[0].resources).toBeUndefined();
  });

  it("resources が空オブジェクトの場合 → undefined に正規化", () => {
    const raw = makeRawPod({
      phase: "Running",
      containers: [{ name: "app", image: "app:v1", resources: {} }],
      containerStatuses: [
        {
          name: "app",
          ready: true,
          restartCount: 0,
          image: "app:v1",
          state: { running: {} },
        },
      ],
    });
    const pod = parsePod(raw);
    expect(pod.containers[0].resources).toBeUndefined();
  });
});

// ─── parseDeployment ──────────────────────────────────────────────────────────

function makeRawDeployment(overrides: {
  readyReplicas?: number;
  replicas?: number;
  strategy?: { type?: string };
  containers?: Array<{
    name?: string;
    image: string;
    resources?: {
      requests?: { cpu?: string; memory?: string };
      limits?: { cpu?: string; memory?: string };
    };
  }>;
}) {
  return {
    metadata: {
      name: "test-deployment",
      namespace: "default",
      creationTimestamp: "2026-01-01T10:00:00Z",
    },
    spec: {
      replicas: overrides.replicas ?? 3,
      strategy: overrides.strategy,
      template: {
        spec: {
          containers: overrides.containers ?? [
            { name: "app", image: "app:v1" },
            { name: "sidecar", image: "sidecar:v2" },
          ],
        },
      },
    },
    status: {
      readyReplicas: overrides.readyReplicas,
      updatedReplicas: overrides.replicas,
      availableReplicas: overrides.replicas,
    },
  };
}

describe("parseDeployment", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("images 配列が正しく取得できる", () => {
    const raw = makeRawDeployment({
      containers: [{ name: "app", image: "app:v1" }, { name: "sidecar", image: "sidecar:v2" }],
    });
    const dep = parseDeployment(raw);
    expect(dep.images).toEqual(["app:v1", "sidecar:v2"]);
  });

  it("readyReplicas が undefined のとき 0", () => {
    const raw = makeRawDeployment({ readyReplicas: undefined });
    const dep = parseDeployment(raw);
    expect(dep.readyReplicas).toBe(0);
  });

  it("strategy が正しくパースされる", () => {
    const raw = makeRawDeployment({ strategy: { type: "Recreate" } });
    const dep = parseDeployment(raw);
    expect(dep.strategy).toBe("Recreate");
  });

  it("strategy が未定義のとき RollingUpdate にフォールバック", () => {
    const raw = makeRawDeployment({ strategy: undefined });
    const dep = parseDeployment(raw);
    expect(dep.strategy).toBe("RollingUpdate");
  });

  it("containers 配列が name, image, resources を含む", () => {
    const raw = makeRawDeployment({
      containers: [
        {
          name: "web",
          image: "web:v1",
          resources: {
            requests: { cpu: "5m", memory: "128Mi" },
            limits: { cpu: "100m", memory: "256Mi" },
          },
        },
        { name: "sidecar", image: "sidecar:v2" },
      ],
    });
    const dep = parseDeployment(raw);
    expect(dep.containers).toHaveLength(2);
    expect(dep.containers[0]).toEqual({
      name: "web",
      image: "web:v1",
      resources: {
        requests: { cpu: "5m", memory: "128Mi" },
        limits: { cpu: "100m", memory: "256Mi" },
      },
    });
    expect(dep.containers[1]).toEqual({
      name: "sidecar",
      image: "sidecar:v2",
      resources: undefined,
    });
  });

  it("containers の resources が未定義の場合 → undefined", () => {
    const raw = makeRawDeployment({
      containers: [{ name: "app", image: "app:v1" }],
    });
    const dep = parseDeployment(raw);
    expect(dep.containers[0].resources).toBeUndefined();
  });
});

// ─── parseJob ────────────────────────────────────────────────────────────────

function makeRawJob(overrides: {
  active?: number;
  succeeded?: number;
  failed?: number;
  startTime?: string;
  completionTime?: string;
  ownerReferences?: Array<{ kind: string; name: string }>;
}) {
  return {
    metadata: {
      name: "test-job",
      namespace: "default",
      creationTimestamp: "2026-01-01T10:00:00Z",
      ownerReferences: overrides.ownerReferences,
    },
    status: {
      active: overrides.active,
      succeeded: overrides.succeeded,
      failed: overrides.failed,
      startTime: overrides.startTime,
      completionTime: overrides.completionTime,
    },
  };
}

describe("parseJob", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("active > 0 → status: 'Active'", () => {
    const raw = makeRawJob({ active: 1, succeeded: 0, failed: 0 });
    const job = parseJob(raw);
    expect(job.status).toBe("Active");
  });

  it("succeeded > 0, active === 0 → status: 'Succeeded'", () => {
    const raw = makeRawJob({ active: 0, succeeded: 1, failed: 0 });
    const job = parseJob(raw);
    expect(job.status).toBe("Succeeded");
  });

  it("succeeded === 0, failed > 0, active === 0 → status: 'Failed'", () => {
    const raw = makeRawJob({ active: 0, succeeded: 0, failed: 1 });
    const job = parseJob(raw);
    expect(job.status).toBe("Failed");
  });

  it("durationSeconds の計算が正しい", () => {
    const raw = makeRawJob({
      startTime: "2026-01-01T10:00:00Z",
      completionTime: "2026-01-01T10:01:30Z",
    });
    const job = parseJob(raw);
    expect(job.durationSeconds).toBe(90);
  });

  it("ownerReferences から cronJobName が取得できる", () => {
    const raw = makeRawJob({
      ownerReferences: [{ kind: "CronJob", name: "my-cronjob" }],
    });
    const job = parseJob(raw);
    expect(job.cronJobName).toBe("my-cronjob");
  });

  it("CronJob以外の ownerReferences では cronJobName が undefined", () => {
    const raw = makeRawJob({
      ownerReferences: [{ kind: "ReplicaSet", name: "my-rs" }],
    });
    const job = parseJob(raw);
    expect(job.cronJobName).toBeUndefined();
  });
});

// ─── parseArgoApplication ────────────────────────────────────────────────────

function makeRawArgoApp(overrides: {
  syncStatus?: string;
  healthStatus?: string;
}) {
  return {
    metadata: { name: "my-app", namespace: "argocd" },
    spec: {
      source: {
        repoURL: "https://gitlab.example.com/repo",
        targetRevision: "HEAD",
        path: "k8s/overlays/dev",
      },
      destination: {
        server: "https://kubernetes.default.svc",
        namespace: "default",
      },
    },
    status: {
      sync: { status: overrides.syncStatus ?? "Synced" },
      health: { status: overrides.healthStatus ?? "Healthy" },
      summary: { images: ["app:v1"] },
      operationState: { syncResult: { revision: "abc123" } },
    },
  };
}

describe("parseArgoApplication", () => {
  it("syncStatus が Synced → 'Synced'", () => {
    const app = parseArgoApplication(makeRawArgoApp({ syncStatus: "Synced" }));
    expect(app.syncStatus).toBe("Synced");
  });

  it("syncStatus が OutOfSync → 'OutOfSync'", () => {
    const app = parseArgoApplication(
      makeRawArgoApp({ syncStatus: "OutOfSync" }),
    );
    expect(app.syncStatus).toBe("OutOfSync");
  });

  it("syncStatus が未知の値 → 'Unknown'", () => {
    const app = parseArgoApplication(
      makeRawArgoApp({ syncStatus: "SomethingElse" }),
    );
    expect(app.syncStatus).toBe("Unknown");
  });

  it("healthStatus が Healthy → 'Healthy'", () => {
    const app = parseArgoApplication(
      makeRawArgoApp({ healthStatus: "Healthy" }),
    );
    expect(app.healthStatus).toBe("Healthy");
  });

  it("healthStatus が Degraded → 'Degraded'", () => {
    const app = parseArgoApplication(
      makeRawArgoApp({ healthStatus: "Degraded" }),
    );
    expect(app.healthStatus).toBe("Degraded");
  });

  it("healthStatus が無効な値 → 'Unknown'", () => {
    const app = parseArgoApplication(
      makeRawArgoApp({ healthStatus: "Invalid" }),
    );
    expect(app.healthStatus).toBe("Unknown");
  });
});

// ─── parseHPA ────────────────────────────────────────────────────────────────

function makeRawHPA(overrides: {
  metrics?: Array<{
    type: string;
    resource?: { name: string; target?: { averageUtilization?: number } };
  }>;
  currentMetrics?: Array<{
    type: string;
    resource?: { name: string; current?: { averageUtilization?: number } };
  }>;
}) {
  return {
    metadata: {
      name: "test-hpa",
      namespace: "default",
      creationTimestamp: "2026-01-01T10:00:00Z",
    },
    spec: {
      scaleTargetRef: { kind: "Deployment", name: "my-app" },
      minReplicas: 2,
      maxReplicas: 10,
      metrics: overrides.metrics,
    },
    status: {
      currentReplicas: 3,
      desiredReplicas: 3,
      currentMetrics: overrides.currentMetrics,
    },
  };
}

describe("parseHPA", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("cpuUtilization が currentMetrics から取得できる", () => {
    const raw = makeRawHPA({
      currentMetrics: [
        {
          type: "Resource",
          resource: { name: "cpu", current: { averageUtilization: 60 } },
        },
      ],
    });
    const hpa = parseHPA(raw);
    expect(hpa.cpuUtilization).toBe(60);
  });

  it("spec.metrics が未定義の場合 → cpuTarget: undefined", () => {
    const raw = makeRawHPA({ metrics: undefined });
    const hpa = parseHPA(raw);
    expect(hpa.cpuTarget).toBeUndefined();
  });

  it("spec.metrics に CPU ターゲットがある場合 → cpuTarget が取得できる", () => {
    const raw = makeRawHPA({
      metrics: [
        {
          type: "Resource",
          resource: { name: "cpu", target: { averageUtilization: 80 } },
        },
      ],
    });
    const hpa = parseHPA(raw);
    expect(hpa.cpuTarget).toBe(80);
  });

  it("currentMetrics が undefined の場合 → cpuUtilization: undefined", () => {
    const raw = makeRawHPA({ currentMetrics: undefined });
    const hpa = parseHPA(raw);
    expect(hpa.cpuUtilization).toBeUndefined();
  });
});
