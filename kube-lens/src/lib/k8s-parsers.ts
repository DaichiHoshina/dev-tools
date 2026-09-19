import type {
  Pod,
  PodPhase,
  Container,
  ContainerResources,
  EnvVar,
  EnvFromSource,
  Deployment,
  K8sEvent,
  Service,
  ArgoApplication,
  ArgoResource,
  CronJob,
  Job,
  HPA,
  ConfigMap,
  Secret,
  Ingress,
  ResourceQuota,
  LimitRange,
  PVC,
  PVCStatus,
  StorageClass,
} from "~/lib/types";

// ─── Raw 型定義 ───────────────────────────────────────────────────────────────

export interface RawPod {
  metadata: {
    name: string;
    namespace: string;
    labels?: Record<string, string>;
    creationTimestamp?: string;
  };
  spec: {
    nodeName?: string;
    containers: Array<{
      name: string;
      image: string;
      resources?: {
        requests?: { cpu?: string; memory?: string };
        limits?: { cpu?: string; memory?: string };
      };
    }>;
  };
  status: {
    phase?: string;
    podIP?: string;
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
  };
}

export interface RawDeployment {
  metadata: { name: string; namespace: string; creationTimestamp?: string };
  spec: {
    replicas?: number;
    strategy?: { type?: string };
    template?: {
      spec?: {
        containers?: Array<{
          name?: string;
          image: string;
          resources?: {
            requests?: { cpu?: string; memory?: string };
            limits?: { cpu?: string; memory?: string };
          };
          env?: Array<{
            name: string;
            value?: string;
            valueFrom?: {
              configMapKeyRef?: {
                name: string;
                key: string;
                optional?: boolean;
              };
              secretKeyRef?: { name: string; key: string; optional?: boolean };
              fieldRef?: { fieldPath: string };
              resourceFieldRef?: { resource: string };
            };
          }>;
          envFrom?: Array<{
            configMapRef?: { name: string; optional?: boolean };
            secretRef?: { name: string; optional?: boolean };
            prefix?: string;
          }>;
        }>;
      };
    };
  };
  status: {
    readyReplicas?: number;
    updatedReplicas?: number;
    availableReplicas?: number;
  };
}

export interface RawEvent {
  type?: string;
  reason?: string;
  message?: string;
  involvedObject: { kind: string; name: string };
  firstTimestamp?: string;
  lastTimestamp?: string;
  count?: number;
  metadata: { namespace: string };
}

export interface RawService {
  metadata: { name: string; namespace: string; creationTimestamp?: string };
  spec: {
    type?: string;
    clusterIP?: string;
    ports?: Array<{
      port: number;
      targetPort: number | string;
      protocol: string;
      nodePort?: number;
    }>;
  };
}

export interface RawArgoApplication {
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    source?: {
      repoURL?: string;
      targetRevision?: string;
      path?: string;
    };
    destination?: {
      server?: string;
      namespace?: string;
    };
  };
  status?: {
    sync?: {
      status?: string;
    };
    health?: {
      status?: string;
    };
    summary?: {
      images?: string[];
    };
    operationState?: {
      syncResult?: {
        revision?: string;
      };
    };
    resources?: Array<{
      group?: string;
      version?: string;
      kind?: string;
      namespace?: string;
      name?: string;
      status?: string;
      health?: {
        status?: string;
      };
      requiresPruning?: boolean;
    }>;
  };
}

export interface RawCronJob {
  metadata: { name: string; namespace: string; creationTimestamp?: string };
  spec: {
    schedule: string;
    suspend?: boolean;
  };
  status?: {
    lastScheduleTime?: string;
    lastSuccessfulTime?: string;
    active?: Array<{ name: string }>;
  };
}

export interface RawJob {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp?: string;
    ownerReferences?: Array<{ kind: string; name: string }>;
  };
  status?: {
    active?: number;
    succeeded?: number;
    failed?: number;
    startTime?: string;
    completionTime?: string;
  };
}

export interface RawHPA {
  metadata: { name: string; namespace: string; creationTimestamp?: string };
  spec: {
    scaleTargetRef?: { kind?: string; name?: string };
    minReplicas?: number;
    maxReplicas: number;
    metrics?: Array<{
      type: string;
      resource?: {
        name: string;
        target?: { averageUtilization?: number };
      };
    }>;
  };
  status?: {
    currentReplicas?: number;
    desiredReplicas?: number;
    currentMetrics?: Array<{
      type: string;
      resource?: {
        name: string;
        current?: { averageUtilization?: number };
      };
    }>;
  };
}

// ─── ユーティリティ ───────────────────────────────────────────────────────────

/** 空の resources オブジェクト ({} や requests/limits が空) を undefined に正規化 */
function normalizeResources(raw?: {
  requests?: { cpu?: string; memory?: string };
  limits?: { cpu?: string; memory?: string };
}): ContainerResources | undefined {
  if (!raw) return undefined;
  const hasRequests = raw.requests?.cpu || raw.requests?.memory;
  const hasLimits = raw.limits?.cpu || raw.limits?.memory;
  if (!hasRequests && !hasLimits) return undefined;
  return raw;
}

/** 経過時間を人間が読みやすい形式に変換 */
export function calcAge(timestamp?: string): string {
  if (!timestamp) return "Unknown";
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// ─── パース関数 ───────────────────────────────────────────────────────────────

export function parsePod(raw: RawPod): Pod {
  const containerStatuses = raw.status.containerStatuses ?? [];
  const specContainers = raw.spec.containers ?? [];
  const readyCount = containerStatuses.filter((c) => c.ready).length;
  const totalRestarts = containerStatuses.reduce(
    (sum, c) => sum + (c.restartCount ?? 0),
    0,
  );

  const validPhases: Set<string> = new Set([
    "Running",
    "Pending",
    "Failed",
    "Succeeded",
    "Unknown",
    "CrashLoopBackOff",
    "Terminating",
  ]);
  let phase: PodPhase =
    raw.status.phase && validPhases.has(raw.status.phase)
      ? (raw.status.phase as PodPhase)
      : "Unknown";
  for (const cs of containerStatuses) {
    if (cs.state?.waiting?.reason === "CrashLoopBackOff") {
      phase = "CrashLoopBackOff";
      break;
    }
  }

  const containers: Container[] = specContainers.map((sc) => {
    const cs = containerStatuses.find((c) => c.name === sc.name);
    let state: Container["state"] = "waiting";
    let stateReason: string | undefined;
    if (cs?.state?.running) {
      state = "running";
    } else if (cs?.state?.terminated) {
      state = "terminated";
      stateReason = cs.state.terminated.reason;
    } else if (cs?.state?.waiting) {
      state = "waiting";
      stateReason = cs.state.waiting.reason;
    }
    return {
      name: sc.name,
      image: cs?.image ?? sc.image,
      ready: cs?.ready ?? false,
      restartCount: cs?.restartCount ?? 0,
      state,
      stateReason,
      resources: normalizeResources(sc.resources),
    };
  });

  return {
    name: raw.metadata.name,
    namespace: raw.metadata.namespace,
    phase,
    readyContainers: readyCount,
    totalContainers: specContainers.length,
    restarts: totalRestarts,
    age: calcAge(raw.metadata.creationTimestamp),
    startTime: raw.metadata.creationTimestamp,
    node: raw.spec.nodeName ?? "Unknown",
    containers,
    labels: raw.metadata.labels ?? {},
    ip: raw.status.podIP ?? "",
  };
}

export function parseDeployment(raw: RawDeployment): Deployment {
  const rawContainers = raw.spec.template?.spec?.containers ?? [];
  const images = rawContainers.map((c) => c.image);
  const containers = rawContainers.map((c) => ({
    name: c.name ?? "",
    image: c.image,
    resources: normalizeResources(c.resources),
    env: c.env as EnvVar[] | undefined,
    envFrom: c.envFrom as EnvFromSource[] | undefined,
  }));
  return {
    name: raw.metadata.name,
    namespace: raw.metadata.namespace,
    readyReplicas: raw.status.readyReplicas ?? 0,
    desiredReplicas: raw.spec.replicas ?? 0,
    updatedReplicas: raw.status.updatedReplicas ?? 0,
    availableReplicas: raw.status.availableReplicas ?? 0,
    age: calcAge(raw.metadata.creationTimestamp),
    images,
    containers,
    strategy:
      (raw.spec.strategy?.type as "RollingUpdate" | "Recreate") ??
      "RollingUpdate",
  };
}

export function parseEvent(raw: RawEvent): K8sEvent {
  return {
    type: (raw.type as "Normal" | "Warning") ?? "Normal",
    reason: raw.reason ?? "",
    message: raw.message ?? "",
    involvedObjectKind: raw.involvedObject.kind,
    involvedObjectName: raw.involvedObject.name,
    firstTime: raw.firstTimestamp ?? "",
    lastTime: raw.lastTimestamp ?? "",
    count: raw.count ?? 1,
    namespace: raw.metadata.namespace,
  };
}

export function parseArgoApplication(raw: RawArgoApplication): ArgoApplication {
  const rawSync = raw.status?.sync?.status ?? "Unknown";
  const syncStatus: ArgoApplication["syncStatus"] =
    rawSync === "Synced" || rawSync === "OutOfSync" || rawSync === "Unknown"
      ? rawSync
      : "Unknown";

  const rawHealth = raw.status?.health?.status ?? "Unknown";
  const validHealthStatuses: Set<string> = new Set([
    "Healthy",
    "Degraded",
    "Progressing",
    "Missing",
    "Suspended",
    "Unknown",
  ]);
  const healthStatus: ArgoApplication["healthStatus"] = validHealthStatuses.has(
    rawHealth,
  )
    ? (rawHealth as ArgoApplication["healthStatus"])
    : "Unknown";

  const resources = (raw.status?.resources ?? []).map((r) => {
    const rawResStatus = r.status ?? "Unknown";
    const resStatus: ArgoResource["status"] =
      rawResStatus === "Synced" || rawResStatus === "OutOfSync"
        ? rawResStatus
        : "Unknown";
    return {
      group: r.group ?? "",
      version: r.version ?? "",
      kind: r.kind ?? "",
      namespace: r.namespace ?? "",
      name: r.name ?? "",
      status: resStatus,
      healthStatus: r.health?.status ?? "",
      requiresPruning: r.requiresPruning ?? false,
    };
  });

  return {
    name: raw.metadata.name,
    namespace: raw.spec.destination?.namespace ?? "",
    syncStatus,
    healthStatus,
    images: raw.status?.summary?.images ?? [],
    repoURL: raw.spec.source?.repoURL ?? "",
    targetRevision: raw.spec.source?.targetRevision ?? "HEAD",
    path: raw.spec.source?.path ?? "",
    revision: raw.status?.operationState?.syncResult?.revision ?? "",
    destinationServer: raw.spec.destination?.server ?? "",
    destinationNamespace: raw.spec.destination?.namespace ?? "",
    resources,
  };
}

export function parseCronJob(raw: RawCronJob): CronJob {
  return {
    name: raw.metadata.name,
    namespace: raw.metadata.namespace,
    schedule: raw.spec.schedule,
    suspend: raw.spec.suspend ?? false,
    lastScheduleTime: raw.status?.lastScheduleTime,
    lastSuccessfulTime: raw.status?.lastSuccessfulTime,
    age: calcAge(raw.metadata.creationTimestamp),
    activeCount: raw.status?.active?.length ?? 0,
  };
}

export function parseJob(raw: RawJob): Job {
  const succeeded = raw.status?.succeeded ?? 0;
  const failed = raw.status?.failed ?? 0;
  const active = raw.status?.active ?? 0;

  let status: Job["status"] = "Active";
  if (active === 0) {
    status = succeeded > 0 ? "Succeeded" : "Failed";
  }

  const cronJobOwner = raw.metadata.ownerReferences?.find(
    (r) => r.kind === "CronJob",
  );

  let durationSeconds: number | undefined;
  if (raw.status?.startTime && raw.status?.completionTime) {
    durationSeconds = Math.floor(
      (new Date(raw.status.completionTime).getTime() -
        new Date(raw.status.startTime).getTime()) /
        1000,
    );
  }

  return {
    name: raw.metadata.name,
    namespace: raw.metadata.namespace,
    cronJobName: cronJobOwner?.name,
    status,
    startTime: raw.status?.startTime,
    completionTime: raw.status?.completionTime,
    durationSeconds,
    succeeded,
    failed,
    age: calcAge(raw.metadata.creationTimestamp),
  };
}

export function parseHPA(raw: RawHPA): HPA {
  const cpuMetric = raw.spec.metrics?.find(
    (m) => m.type === "Resource" && m.resource?.name === "cpu",
  );
  const cpuCurrentMetric = raw.status?.currentMetrics?.find(
    (m) => m.type === "Resource" && m.resource?.name === "cpu",
  );
  return {
    name: raw.metadata.name,
    namespace: raw.metadata.namespace,
    targetName: raw.spec.scaleTargetRef?.name ?? "",
    targetKind: raw.spec.scaleTargetRef?.kind ?? "Deployment",
    minReplicas: raw.spec.minReplicas ?? 1,
    maxReplicas: raw.spec.maxReplicas,
    currentReplicas: raw.status?.currentReplicas ?? 0,
    desiredReplicas: raw.status?.desiredReplicas ?? 0,
    cpuUtilization: cpuCurrentMetric?.resource?.current?.averageUtilization,
    cpuTarget: cpuMetric?.resource?.target?.averageUtilization,
    age: calcAge(raw.metadata.creationTimestamp),
  };
}

export function parseService(raw: RawService): Service {
  return {
    name: raw.metadata.name,
    namespace: raw.metadata.namespace,
    type: (raw.spec.type as Service["type"]) ?? "ClusterIP",
    clusterIP: raw.spec.clusterIP ?? "",
    ports: raw.spec.ports ?? [],
    age: calcAge(raw.metadata.creationTimestamp),
  };
}

// ─── 追加 Raw 型定義 ──────────────────────────────────────────────────────────

export interface RawConfigMap {
  metadata: { name: string; namespace: string; creationTimestamp?: string };
  data?: Record<string, string>;
}

export interface RawSecret {
  metadata: { name: string; namespace: string; creationTimestamp?: string };
  type?: string;
  data?: Record<string, string>;
}

export interface RawIngress {
  metadata: { name: string; namespace: string; creationTimestamp?: string };
  spec?: {
    rules?: Array<{
      host?: string;
      http?: {
        paths: Array<{
          path?: string;
          pathType?: string;
          backend?: {
            service?: {
              name: string;
              port: { number?: number; name?: string };
            };
          };
        }>;
      };
    }>;
    tls?: Array<{ hosts?: string[]; secretName?: string }>;
  };
}

export interface RawResourceQuota {
  metadata: { name: string; namespace: string; creationTimestamp?: string };
  spec?: { hard?: Record<string, string> };
  status?: { hard?: Record<string, string>; used?: Record<string, string> };
}

export interface RawLimitRange {
  metadata: { name: string; namespace: string; creationTimestamp?: string };
  spec?: {
    limits?: Array<{
      type?: string;
      max?: Record<string, string>;
      min?: Record<string, string>;
      default?: Record<string, string>;
      defaultRequest?: Record<string, string>;
    }>;
  };
}

export interface RawPVC {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp?: string;
    annotations?: Record<string, string>;
  };
  spec?: {
    accessModes?: string[];
    storageClassName?: string;
    volumeName?: string;
    resources?: { requests?: { storage?: string } };
  };
  status?: {
    phase?: string;
    capacity?: { storage?: string };
  };
}

export interface RawStorageClass {
  metadata: {
    name: string;
    creationTimestamp?: string;
    annotations?: Record<string, string>;
  };
  provisioner?: string;
  reclaimPolicy?: string;
  volumeBindingMode?: string;
}

// ─── 追加パース関数 ───────────────────────────────────────────────────────────

export function parseConfigMap(raw: RawConfigMap): ConfigMap {
  return {
    name: raw.metadata.name,
    namespace: raw.metadata.namespace,
    data: raw.data ?? {},
    age: calcAge(raw.metadata.creationTimestamp),
  };
}

export function parseSecret(raw: RawSecret): Secret {
  return {
    name: raw.metadata.name,
    namespace: raw.metadata.namespace,
    type: raw.type ?? "Opaque",
    keys: Object.keys(raw.data ?? {}),
    age: calcAge(raw.metadata.creationTimestamp),
  };
}

export function parseIngress(raw: RawIngress): Ingress {
  const rules = (raw.spec?.rules ?? []).map((r) => ({
    host: r.host ?? "*",
    paths: (r.http?.paths ?? []).map((p) => ({
      path: p.path ?? "/",
      pathType: p.pathType ?? "Prefix",
      serviceName: p.backend?.service?.name ?? "",
      servicePort:
        p.backend?.service?.port.number ?? p.backend?.service?.port.name ?? "",
    })),
  }));
  return {
    name: raw.metadata.name,
    namespace: raw.metadata.namespace,
    rules,
    tls: (raw.spec?.tls ?? []).map((t) => ({
      hosts: t.hosts ?? [],
      secretName: t.secretName,
    })),
    age: calcAge(raw.metadata.creationTimestamp),
  };
}

export function parseResourceQuota(raw: RawResourceQuota): ResourceQuota {
  return {
    name: raw.metadata.name,
    namespace: raw.metadata.namespace,
    hard: raw.status?.hard ?? raw.spec?.hard ?? {},
    used: raw.status?.used ?? {},
    age: calcAge(raw.metadata.creationTimestamp),
  };
}

export function parseLimitRange(raw: RawLimitRange): LimitRange {
  return {
    name: raw.metadata.name,
    namespace: raw.metadata.namespace,
    limits: (raw.spec?.limits ?? []).map((l) => ({
      type: l.type ?? "Container",
      max: l.max,
      min: l.min,
      default: l.default,
      defaultRequest: l.defaultRequest,
    })),
    age: calcAge(raw.metadata.creationTimestamp),
  };
}

export function parsePVC(raw: RawPVC): PVC {
  const validStatuses: Set<string> = new Set([
    "Bound",
    "Pending",
    "Lost",
    "Released",
  ]);
  const rawStatus = raw.status?.phase ?? "";
  const status: PVCStatus = validStatuses.has(rawStatus)
    ? (rawStatus as PVCStatus)
    : "Pending";
  return {
    name: raw.metadata.name,
    namespace: raw.metadata.namespace,
    status,
    capacity:
      raw.status?.capacity?.storage ??
      raw.spec?.resources?.requests?.storage ??
      "",
    accessModes: raw.spec?.accessModes ?? [],
    storageClass: raw.spec?.storageClassName ?? "",
    volumeName: raw.spec?.volumeName ?? "",
    age: calcAge(raw.metadata.creationTimestamp),
  };
}

export function parseStorageClass(raw: RawStorageClass): StorageClass {
  const isDefault =
    raw.metadata.annotations?.[
      "storageclass.kubernetes.io/is-default-class"
    ] === "true";
  return {
    name: raw.metadata.name,
    provisioner: raw.provisioner ?? "",
    reclaimPolicy: raw.reclaimPolicy ?? "Delete",
    volumeBindingMode: raw.volumeBindingMode ?? "Immediate",
    isDefault,
    age: calcAge(raw.metadata.creationTimestamp),
  };
}
