export type Project = string;
export type Environment = "dev" | "staging" | "production";
export type PodPhase =
  | "Running"
  | "Pending"
  | "Failed"
  | "Succeeded"
  | "Unknown"
  | "CrashLoopBackOff"
  | "Terminating";

export interface K8sConfig {
  project: Project;
  apiUrls: Record<Environment, string>;
  environment: Environment;
  namespaces: string[];
  refreshInterval: number; // ms
}

export const DEFAULT_CONFIG: K8sConfig = {
  project: "default",
  apiUrls: { dev: "", staging: "", production: "" },
  environment: "dev",
  namespaces: ["default"],
  refreshInterval: 30000,
};

export interface ContainerResources {
  requests?: { cpu?: string; memory?: string };
  limits?: { cpu?: string; memory?: string };
}

export interface Container {
  name: string;
  image: string;
  ready: boolean;
  restartCount: number;
  state: "running" | "waiting" | "terminated";
  stateReason?: string;
  resources?: ContainerResources;
}

export interface Pod {
  name: string;
  namespace: string;
  phase: PodPhase;
  readyContainers: number;
  totalContainers: number;
  restarts: number;
  age: string;
  startTime?: string;
  node: string;
  containers: Container[];
  labels: Record<string, string>;
  ip: string;
}

export interface EnvVar {
  name: string;
  value?: string;
  valueFrom?: {
    configMapKeyRef?: { name: string; key: string; optional?: boolean };
    secretKeyRef?: { name: string; key: string; optional?: boolean };
    fieldRef?: { fieldPath: string };
    resourceFieldRef?: { resource: string };
  };
}

export interface EnvFromSource {
  configMapRef?: { name: string; optional?: boolean };
  secretRef?: { name: string; optional?: boolean };
  prefix?: string;
}

export interface DeploymentContainer {
  name: string;
  image: string;
  resources?: ContainerResources;
  env?: EnvVar[];
  envFrom?: EnvFromSource[];
}

export interface Deployment {
  name: string;
  namespace: string;
  readyReplicas: number;
  desiredReplicas: number;
  updatedReplicas: number;
  availableReplicas: number;
  age: string;
  images: string[];
  containers: DeploymentContainer[];
  strategy: "RollingUpdate" | "Recreate";
}

export interface K8sEvent {
  type: "Normal" | "Warning";
  reason: string;
  message: string;
  involvedObjectKind: string;
  involvedObjectName: string;
  firstTime: string;
  lastTime: string;
  count: number;
  namespace: string;
}

export interface Service {
  name: string;
  namespace: string;
  type: "ClusterIP" | "NodePort" | "LoadBalancer" | "ExternalName";
  clusterIP: string;
  ports: Array<{
    port: number;
    targetPort: number | string;
    protocol: string;
    nodePort?: number;
  }>;
  age: string;
}

export interface K8sList<T> {
  kind: string;
  apiVersion: string;
  items: T[];
}

export interface CronJob {
  name: string;
  namespace: string;
  schedule: string;
  suspend: boolean;
  lastScheduleTime?: string;
  lastSuccessfulTime?: string;
  age: string;
  activeCount: number;
}

export interface Job {
  name: string;
  namespace: string;
  /** 対応するCronJob名（存在する場合） */
  cronJobName?: string;
  status: "Active" | "Succeeded" | "Failed";
  startTime?: string;
  completionTime?: string;
  /** 実行時間（秒） */
  durationSeconds?: number;
  succeeded: number;
  failed: number;
  age: string;
}

export interface HPA {
  name: string;
  namespace: string;
  /** 対象のDeployment/StatefulSet名 */
  targetName: string;
  targetKind: string;
  minReplicas: number;
  maxReplicas: number;
  currentReplicas: number;
  desiredReplicas: number;
  /** CPU使用率 (%) */
  cpuUtilization?: number;
  /** CPU目標 (%) */
  cpuTarget?: number;
  age: string;
}

export interface ArgoResource {
  group: string;
  version: string;
  kind: string;
  namespace: string;
  name: string;
  status: "Synced" | "OutOfSync" | "Unknown";
  healthStatus: string;
  requiresPruning: boolean;
}

export interface ArgoApplication {
  name: string;
  namespace: string; // destination namespace
  syncStatus: "Synced" | "OutOfSync" | "Unknown";
  healthStatus:
    | "Healthy"
    | "Degraded"
    | "Progressing"
    | "Missing"
    | "Suspended"
    | "Unknown";
  images: string[];
  repoURL: string;
  targetRevision: string;
  path: string;
  revision: string; // 実際の commit SHA
  destinationServer: string;
  destinationNamespace: string;
  resources: ArgoResource[];
}

export interface ArgoManagedResource {
  group: string;
  kind: string;
  namespace: string;
  name: string;
  liveState: string; // JSON文字列
  targetState: string; // JSON文字列
}

export interface ConfigMap {
  name: string;
  namespace: string;
  data: Record<string, string>;
  age: string;
}

export interface Secret {
  name: string;
  namespace: string;
  type: string;
  keys: string[];
  age: string;
}

export interface IngressRule {
  host: string;
  paths: Array<{
    path: string;
    pathType: string;
    serviceName: string;
    servicePort: number | string;
  }>;
}

export interface Ingress {
  name: string;
  namespace: string;
  rules: IngressRule[];
  tls: Array<{ hosts: string[]; secretName?: string }>;
  age: string;
}

export interface ResourceQuota {
  name: string;
  namespace: string;
  hard: Record<string, string>;
  used: Record<string, string>;
  age: string;
}

export interface LimitRangeItem {
  type: string;
  max?: Record<string, string>;
  min?: Record<string, string>;
  default?: Record<string, string>;
  defaultRequest?: Record<string, string>;
}

export interface LimitRange {
  name: string;
  namespace: string;
  limits: LimitRangeItem[];
  age: string;
}

export type PVCStatus = "Bound" | "Pending" | "Lost" | "Released";

export interface PVC {
  name: string;
  namespace: string;
  status: PVCStatus;
  capacity: string;
  accessModes: string[];
  storageClass: string;
  volumeName: string;
  age: string;
}

export interface StorageClass {
  name: string;
  provisioner: string;
  reclaimPolicy: string;
  volumeBindingMode: string;
  isDefault: boolean;
  age: string;
}
