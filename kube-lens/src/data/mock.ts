import type {
  Pod,
  Deployment,
  K8sEvent,
  Service,
  ConfigMap,
  Secret,
} from "~/lib/types";
import type { K8sClient } from "~/lib/k8s-client";
import { DEFAULT_CONFIG } from "~/lib/types";

// ---------------------------------------------------------------------------
// mockPods (10件)
// ---------------------------------------------------------------------------
export const mockPods: Pod[] = [
  // Running: order-api (2コンテナ)
  {
    name: "order-api-7d6b9f8c4-xk9pl",
    namespace: "sample-dev",
    phase: "Running",
    readyContainers: 2,
    totalContainers: 2,
    restarts: 0,
    age: "14d",
    startTime: "2026-02-07T10:00:00Z",
    node: "ip-10-0-1-100.ap-northeast-1.compute.internal",
    containers: [
      {
        name: "order-api",
        image:
          "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/order-api:v1.4.2",
        ready: true,
        restartCount: 0,
        state: "running",
        resources: {
          requests: { cpu: "5m", memory: "128Mi" },
          limits: { cpu: "100m", memory: "256Mi" },
        },
      },
      {
        name: "envoy-sidecar",
        image: "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/envoy:v1.27.0",
        ready: true,
        restartCount: 0,
        state: "running",
        resources: {
          requests: { cpu: "10m", memory: "64Mi" },
          limits: { cpu: "50m", memory: "128Mi" },
        },
      },
    ],
    labels: {
      app: "order-api",
      version: "v1.4.2",
      environment: "dev",
    },
    ip: "10.0.1.201",
  },

  // Running: worker-service (1コンテナ)
  {
    name: "worker-service-5c8d7b6f9-mn3qr",
    namespace: "sample-dev",
    phase: "Running",
    readyContainers: 1,
    totalContainers: 1,
    restarts: 1,
    age: "3d",
    startTime: "2026-02-18T08:30:00Z",
    node: "ip-10-0-1-101.ap-northeast-1.compute.internal",
    containers: [
      {
        name: "worker-service",
        image:
          "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/worker-service:v2.1.0",
        ready: true,
        restartCount: 1,
        state: "running",
        resources: {
          requests: { cpu: "10m", memory: "256Mi" },
          limits: { cpu: "200m", memory: "512Mi" },
        },
      },
    ],
    labels: {
      app: "worker-service",
      version: "v2.1.0",
      environment: "dev",
    },
    ip: "10.0.1.202",
  },

  // Running: notification-service (2コンテナ)
  {
    name: "notification-service-6f4b2c9d1-wp7ts",
    namespace: "sample-dev",
    phase: "Running",
    readyContainers: 2,
    totalContainers: 2,
    restarts: 5,
    age: "2h",
    startTime: "2026-02-21T08:00:00Z",
    node: "ip-10-0-1-102.ap-northeast-1.compute.internal",
    containers: [
      {
        name: "notification-service",
        image:
          "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/notification-service:v1.2.3",
        ready: true,
        restartCount: 5,
        state: "running",
      },
      {
        name: "redis-exporter",
        image:
          "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/redis-exporter:v1.45.0",
        ready: true,
        restartCount: 0,
        state: "running",
      },
    ],
    labels: {
      app: "notification-service",
      version: "v1.2.3",
      environment: "dev",
    },
    ip: "10.0.1.203",
  },

  // Running: api-server (1コンテナ)
  {
    name: "api-server-9a3c5e7f2-hj4kv",
    namespace: "sample-dev",
    phase: "Running",
    readyContainers: 1,
    totalContainers: 1,
    restarts: 0,
    age: "5m",
    startTime: "2026-02-21T09:55:00Z",
    node: "ip-10-0-1-100.ap-northeast-1.compute.internal",
    containers: [
      {
        name: "api-server",
        image:
          "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/api-server:v3.0.1",
        ready: true,
        restartCount: 0,
        state: "running",
        resources: {
          requests: { cpu: "5m", memory: "128Mi" },
          limits: { cpu: "100m", memory: "256Mi" },
        },
      },
    ],
    labels: {
      app: "api-server",
      version: "v3.0.1",
      environment: "dev",
    },
    ip: "10.0.1.204",
  },

  // Running: user-service (1コンテナ)
  {
    name: "user-service-4b8e1d9c7-zr6yx",
    namespace: "sample-dev",
    phase: "Running",
    readyContainers: 1,
    totalContainers: 1,
    restarts: 23,
    age: "14d",
    startTime: "2026-02-07T10:00:00Z",
    node: "ip-10-0-1-103.ap-northeast-1.compute.internal",
    containers: [
      {
        name: "user-service",
        image:
          "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/user-service:v1.9.5",
        ready: true,
        restartCount: 23,
        state: "running",
      },
    ],
    labels: {
      app: "user-service",
      version: "v1.9.5",
      environment: "dev",
    },
    ip: "10.0.1.205",
  },

  // Running: auth-service (2コンテナ)
  {
    name: "auth-service-2d7f4a8b5-ct9mw",
    namespace: "sample-dev",
    phase: "Running",
    readyContainers: 2,
    totalContainers: 2,
    restarts: 0,
    age: "7d",
    startTime: "2026-02-14T10:00:00Z",
    node: "ip-10-0-1-101.ap-northeast-1.compute.internal",
    containers: [
      {
        name: "auth-service",
        image:
          "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/auth-service:v2.5.0",
        ready: true,
        restartCount: 0,
        state: "running",
      },
      {
        name: "token-refresher",
        image:
          "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/token-refresher:v1.1.0",
        ready: true,
        restartCount: 0,
        state: "running",
      },
    ],
    labels: {
      app: "auth-service",
      version: "v2.5.0",
      environment: "dev",
    },
    ip: "10.0.1.206",
  },

  // Pending: inventory-service
  {
    name: "inventory-service-3c6a9d2e8-lp5nq",
    namespace: "sample-dev",
    phase: "Pending",
    readyContainers: 0,
    totalContainers: 1,
    restarts: 0,
    age: "3m",
    startTime: "2026-02-21T09:57:00Z",
    node: "Unknown",
    containers: [
      {
        name: "inventory-service",
        image:
          "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/inventory-service:v1.0.0",
        ready: false,
        restartCount: 0,
        state: "waiting",
        stateReason: "ContainerCreating",
      },
    ],
    labels: {
      app: "inventory-service",
      version: "v1.0.0",
      environment: "dev",
    },
    ip: "",
  },

  // CrashLoopBackOff: legacy-connector
  {
    name: "legacy-connector-8e1b3f6d4-qs2jh",
    namespace: "sample-dev",
    phase: "CrashLoopBackOff",
    readyContainers: 0,
    totalContainers: 1,
    restarts: 45,
    age: "1d",
    startTime: "2026-02-20T10:00:00Z",
    node: "ip-10-0-1-102.ap-northeast-1.compute.internal",
    containers: [
      {
        name: "legacy-connector",
        image:
          "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/legacy-connector:v0.9.8",
        ready: false,
        restartCount: 45,
        state: "waiting",
        stateReason: "CrashLoopBackOff",
      },
    ],
    labels: {
      app: "legacy-connector",
      version: "v0.9.8",
      environment: "dev",
    },
    ip: "10.0.1.207",
  },

  // Failed: batch-processor
  {
    name: "batch-processor-job-4x7vk",
    namespace: "sample-dev",
    phase: "Failed",
    readyContainers: 0,
    totalContainers: 1,
    restarts: 3,
    age: "45m",
    startTime: "2026-02-21T09:15:00Z",
    node: "ip-10-0-1-103.ap-northeast-1.compute.internal",
    containers: [
      {
        name: "batch-processor",
        image:
          "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/batch-processor:v1.3.0",
        ready: false,
        restartCount: 3,
        state: "terminated",
        stateReason: "Error",
      },
    ],
    labels: {
      app: "batch-processor",
      version: "v1.3.0",
      environment: "dev",
      "batch-job": "true",
    },
    ip: "10.0.1.208",
  },

  // Terminating: old-service
  {
    name: "old-service-1a5c8f3b9-dg7yz",
    namespace: "sample-dev",
    phase: "Terminating",
    readyContainers: 0,
    totalContainers: 1,
    restarts: 0,
    age: "30d",
    startTime: "2026-01-22T10:00:00Z",
    node: "ip-10-0-1-100.ap-northeast-1.compute.internal",
    containers: [
      {
        name: "old-service",
        image:
          "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/old-service:v0.5.0",
        ready: false,
        restartCount: 0,
        state: "terminated",
        stateReason: "Completed",
      },
    ],
    labels: {
      app: "old-service",
      version: "v0.5.0",
      environment: "dev",
    },
    ip: "10.0.1.209",
  },
];

// ---------------------------------------------------------------------------
// mockDeployments (6件)
// ---------------------------------------------------------------------------
export const mockDeployments: Deployment[] = [
  // 正常: order-api (3レプリカ)
  {
    name: "order-api",
    namespace: "sample-dev",
    readyReplicas: 3,
    desiredReplicas: 3,
    updatedReplicas: 3,
    availableReplicas: 3,
    age: "14d",
    images: [
      "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/order-api:v1.4.2",
      "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/envoy:v1.27.0",
    ],
    containers: [
      {
        name: "order-api",
        image:
          "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/order-api:v1.4.2",
        resources: {
          requests: { cpu: "5m", memory: "128Mi" },
          limits: { cpu: "100m", memory: "256Mi" },
        },
        env: [
          { name: "APP_ENV", value: "development" },
          { name: "LOG_LEVEL", value: "" }, // 空値 → warning
          {
            name: "DB_HOST",
            valueFrom: {
              configMapKeyRef: { name: "order-api-db-config", key: "host" },
            },
          }, // 存在しないCM → error
        ],
        envFrom: [
          { configMapRef: { name: "order-api-config" } }, // 存在しないCM → error
        ],
      },
      {
        name: "envoy-sidecar",
        image: "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/envoy:v1.27.0",
        resources: {
          requests: { cpu: "10m", memory: "64Mi" },
          limits: { cpu: "50m", memory: "128Mi" },
        },
        env: [{ name: "ENVOY_LOG_LEVEL", value: "info" }],
      },
    ],
    strategy: "RollingUpdate",
  },

  // 正常: worker-service (2レプリカ)
  {
    name: "worker-service",
    namespace: "sample-dev",
    readyReplicas: 2,
    desiredReplicas: 2,
    updatedReplicas: 2,
    availableReplicas: 2,
    age: "30d",
    images: [
      "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/worker-service:v2.1.0",
    ],
    containers: [
      {
        name: "worker-service",
        image:
          "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/worker-service:v2.1.0",
        resources: {
          requests: { cpu: "10m", memory: "256Mi" },
          limits: { cpu: "200m", memory: "512Mi" },
        },
        env: [
          { name: "PAYMENT_GATEWAY_URL", value: "https://payment.example.com" },
          {
            name: "API_KEY",
            valueFrom: {
              secretKeyRef: { name: "payment-secret", key: "api-key" },
            },
          }, // 存在しないSecret → error
        ],
      },
    ],
    strategy: "RollingUpdate",
  },

  // 正常: auth-service (2レプリカ)
  {
    name: "auth-service",
    namespace: "sample-dev",
    readyReplicas: 2,
    desiredReplicas: 2,
    updatedReplicas: 2,
    availableReplicas: 2,
    age: "7d",
    images: [
      "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/auth-service:v2.5.0",
      "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/token-refresher:v1.1.0",
    ],
    containers: [
      {
        name: "auth-service",
        image:
          "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/auth-service:v2.5.0",
        resources: {
          requests: { cpu: "15m", memory: "192Mi" },
          limits: { cpu: "150m", memory: "384Mi" },
        },
        env: [
          {
            name: "AUTH_ISSUER",
            valueFrom: {
              configMapKeyRef: {
                name: "auth-service-config",
                key: "AUTH_ISSUER",
              },
            },
          },
        ],
        envFrom: [
          { secretRef: { name: "auth-service-secret" } }, // 存在するSecret → clean
        ],
      },
      {
        name: "token-refresher",
        image:
          "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/token-refresher:v1.1.0",
        resources: {
          requests: { cpu: "5m", memory: "32Mi" },
          limits: { cpu: "25m", memory: "64Mi" },
        },
        env: [
          {
            name: "TOKEN_EXPIRY",
            valueFrom: {
              configMapKeyRef: {
                name: "auth-service-config",
                key: "TOKEN_EXPIRY",
              },
            },
          },
        ],
      },
    ],
    strategy: "RollingUpdate",
  },

  // 正常: api-server (1レプリカ)
  {
    name: "api-server",
    namespace: "sample-dev",
    readyReplicas: 1,
    desiredReplicas: 1,
    updatedReplicas: 1,
    availableReplicas: 1,
    age: "5m",
    images: [
      "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/api-server:v3.0.1",
    ],
    containers: [
      {
        name: "api-server",
        image:
          "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/api-server:v3.0.1",
        resources: {
          requests: { cpu: "5m", memory: "128Mi" },
          limits: { cpu: "100m", memory: "256Mi" },
        },
        envFrom: [
          { configMapRef: { name: "api-server-config" } }, // 存在するCM → clean
        ],
      },
    ],
    strategy: "Recreate",
  },

  // 異常: legacy-connector (1/3 Ready)
  {
    name: "legacy-connector",
    namespace: "sample-dev",
    readyReplicas: 0,
    desiredReplicas: 1,
    updatedReplicas: 1,
    availableReplicas: 0,
    age: "1d",
    images: [
      "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/legacy-connector:v0.9.8",
    ],
    containers: [
      {
        name: "legacy-connector",
        image:
          "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/legacy-connector:v0.9.8",
        resources: {
          requests: { cpu: "5m", memory: "64Mi" },
          limits: { cpu: "50m", memory: "128Mi" },
        },
      },
    ],
    strategy: "RollingUpdate",
  },

  // 異常: notification-service (1/3 Ready)
  {
    name: "notification-service",
    namespace: "sample-dev",
    readyReplicas: 1,
    desiredReplicas: 3,
    updatedReplicas: 2,
    availableReplicas: 1,
    age: "2h",
    images: [
      "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/notification-service:v1.2.3",
      "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/redis-exporter:v1.45.0",
    ],
    containers: [
      {
        name: "notification-service",
        image:
          "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/notification-service:v1.2.3",
        resources: {
          requests: { cpu: "10m", memory: "128Mi" },
          limits: { cpu: "100m", memory: "256Mi" },
        },
      },
      {
        name: "redis-exporter",
        image:
          "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/redis-exporter:v1.45.0",
        resources: {
          requests: { cpu: "5m", memory: "32Mi" },
          limits: { cpu: "25m", memory: "64Mi" },
        },
      },
    ],
    strategy: "RollingUpdate",
  },
];

// ---------------------------------------------------------------------------
// mockEvents (12件) - lastTime 降順
// ---------------------------------------------------------------------------
export const mockEvents: K8sEvent[] = [
  // Warning: BackOff (最新)
  {
    type: "Warning",
    reason: "BackOff",
    message:
      "Back-off restarting failed container legacy-connector in pod legacy-connector-8e1b3f6d4-qs2jh_sample-dev",
    involvedObjectKind: "Pod",
    involvedObjectName: "legacy-connector-8e1b3f6d4-qs2jh",
    firstTime: "2026-02-20T10:05:00Z",
    lastTime: "2026-02-21T10:00:00Z",
    count: 45,
    namespace: "sample-dev",
  },

  // Warning: OOMKilling
  {
    type: "Warning",
    reason: "OOMKilling",
    message:
      "Memory limit reached: container user-service in pod user-service-4b8e1d9c7-zr6yx was OOM killed",
    involvedObjectKind: "Pod",
    involvedObjectName: "user-service-4b8e1d9c7-zr6yx",
    firstTime: "2026-02-21T07:30:00Z",
    lastTime: "2026-02-21T09:50:00Z",
    count: 15,
    namespace: "sample-dev",
  },

  // Warning: Unhealthy
  {
    type: "Warning",
    reason: "Unhealthy",
    message:
      "Readiness probe failed: HTTP probe failed with statuscode: 503 for notification-service-6f4b2c9d1-wp7ts",
    involvedObjectKind: "Pod",
    involvedObjectName: "notification-service-6f4b2c9d1-wp7ts",
    firstTime: "2026-02-21T08:00:00Z",
    lastTime: "2026-02-21T09:45:00Z",
    count: 3,
    namespace: "sample-dev",
  },

  // Warning: FailedScheduling
  {
    type: "Warning",
    reason: "FailedScheduling",
    message:
      "0/3 nodes are available: 3 Insufficient cpu. preemption: 0/3 nodes are available",
    involvedObjectKind: "Pod",
    involvedObjectName: "inventory-service-3c6a9d2e8-lp5nq",
    firstTime: "2026-02-21T09:57:00Z",
    lastTime: "2026-02-21T09:57:30Z",
    count: 1,
    namespace: "sample-dev",
  },

  // Normal: Killing (Terminating pod)
  {
    type: "Normal",
    reason: "Killing",
    message:
      "Stopping container old-service. Pod is being terminated. Grace period: 30s",
    involvedObjectKind: "Pod",
    involvedObjectName: "old-service-1a5c8f3b9-dg7yz",
    firstTime: "2026-02-21T09:55:00Z",
    lastTime: "2026-02-21T09:55:00Z",
    count: 1,
    namespace: "sample-dev",
  },

  // Normal: Started (api-server 新規起動)
  {
    type: "Normal",
    reason: "Started",
    message: "Started container api-server",
    involvedObjectKind: "Pod",
    involvedObjectName: "api-server-9a3c5e7f2-hj4kv",
    firstTime: "2026-02-21T09:55:00Z",
    lastTime: "2026-02-21T09:55:00Z",
    count: 1,
    namespace: "sample-dev",
  },

  // Normal: Created
  {
    type: "Normal",
    reason: "Created",
    message: "Created container api-server",
    involvedObjectKind: "Pod",
    involvedObjectName: "api-server-9a3c5e7f2-hj4kv",
    firstTime: "2026-02-21T09:54:50Z",
    lastTime: "2026-02-21T09:54:50Z",
    count: 1,
    namespace: "sample-dev",
  },

  // Normal: Pulled
  {
    type: "Normal",
    reason: "Pulled",
    message:
      'Successfully pulled image "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/api-server:v3.0.1" in 4.321s',
    involvedObjectKind: "Pod",
    involvedObjectName: "api-server-9a3c5e7f2-hj4kv",
    firstTime: "2026-02-21T09:54:45Z",
    lastTime: "2026-02-21T09:54:45Z",
    count: 1,
    namespace: "sample-dev",
  },

  // Normal: ScalingReplicaSet (notification-service)
  {
    type: "Normal",
    reason: "ScalingReplicaSet",
    message: "Scaled up replica set notification-service-6f4b2c9d1 to 3 from 1",
    involvedObjectKind: "Deployment",
    involvedObjectName: "notification-service",
    firstTime: "2026-02-21T08:00:00Z",
    lastTime: "2026-02-21T08:00:00Z",
    count: 1,
    namespace: "sample-dev",
  },

  // Normal: Pulling
  {
    type: "Normal",
    reason: "Pulling",
    message:
      'Pulling image "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/notification-service:v1.2.3"',
    involvedObjectKind: "Pod",
    involvedObjectName: "notification-service-6f4b2c9d1-wp7ts",
    firstTime: "2026-02-21T07:59:50Z",
    lastTime: "2026-02-21T07:59:50Z",
    count: 1,
    namespace: "sample-dev",
  },

  // Normal: SuccessfulCreate (ReplicaSet)
  {
    type: "Normal",
    reason: "SuccessfulCreate",
    message: "Created pod: legacy-connector-8e1b3f6d4-qs2jh",
    involvedObjectKind: "ReplicaSet",
    involvedObjectName: "legacy-connector-8e1b3f6d4",
    firstTime: "2026-02-20T10:00:00Z",
    lastTime: "2026-02-20T10:00:00Z",
    count: 1,
    namespace: "sample-dev",
  },

  // Normal: NodeReady (古いイベント)
  {
    type: "Normal",
    reason: "NodeReady",
    message:
      "Node ip-10-0-1-103.ap-northeast-1.compute.internal status is now: NodeReady",
    involvedObjectKind: "Node",
    involvedObjectName: "ip-10-0-1-103.ap-northeast-1.compute.internal",
    firstTime: "2026-02-07T10:00:00Z",
    lastTime: "2026-02-07T10:00:00Z",
    count: 1,
    namespace: "sample-dev",
  },
];

// ---------------------------------------------------------------------------
// mockServices (5件)
// ---------------------------------------------------------------------------
export const mockServices: Service[] = [
  // ClusterIP: order-api
  {
    name: "order-api",
    namespace: "sample-dev",
    type: "ClusterIP",
    clusterIP: "172.20.10.10",
    ports: [
      { port: 8080, targetPort: 8080, protocol: "TCP" },
      { port: 9090, targetPort: 9090, protocol: "TCP" },
    ],
    age: "14d",
  },

  // ClusterIP: worker-service
  {
    name: "worker-service",
    namespace: "sample-dev",
    type: "ClusterIP",
    clusterIP: "172.20.10.20",
    ports: [{ port: 8080, targetPort: 8080, protocol: "TCP" }],
    age: "30d",
  },

  // ClusterIP: auth-service (複数ポート)
  {
    name: "auth-service",
    namespace: "sample-dev",
    type: "ClusterIP",
    clusterIP: "172.20.10.30",
    ports: [
      { port: 8080, targetPort: 8080, protocol: "TCP" },
      { port: 5432, targetPort: 5432, protocol: "TCP" },
    ],
    age: "7d",
  },

  // NodePort: api-server
  {
    name: "api-server",
    namespace: "sample-dev",
    type: "NodePort",
    clusterIP: "172.20.10.40",
    ports: [
      { port: 80, targetPort: 8080, protocol: "TCP", nodePort: 30080 },
      { port: 443, targetPort: 8443, protocol: "TCP", nodePort: 30443 },
    ],
    age: "5m",
  },

  // LoadBalancer: public-gateway
  {
    name: "public-gateway",
    namespace: "sample-dev",
    type: "LoadBalancer",
    clusterIP: "172.20.10.50",
    ports: [
      { port: 80, targetPort: 8080, protocol: "TCP", nodePort: 31080 },
      { port: 443, targetPort: 8443, protocol: "TCP", nodePort: 31443 },
    ],
    age: "30d",
  },
];

// ---------------------------------------------------------------------------
// モックログ (100行程度)
// ---------------------------------------------------------------------------
export const MOCK_LOG = `{"timestamp":"2026-02-21T10:00:01.234Z","level":"info","service":"api-server","message":"Server started on port 8080","version":"v3.0.1"}
{"timestamp":"2026-02-21T10:00:01.567Z","level":"info","service":"api-server","message":"Connected to database","host":"postgres.sample-dev.svc.cluster.local","port":5432}
{"timestamp":"2026-02-21T10:00:02.001Z","level":"info","service":"api-server","message":"Redis connection established","host":"redis.sample-dev.svc.cluster.local"}
{"timestamp":"2026-02-21T10:00:02.345Z","level":"info","service":"api-server","message":"Health check endpoint registered","path":"/healthz"}
{"timestamp":"2026-02-21T10:00:03.012Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/healthz","status":200,"latency_ms":2}
{"timestamp":"2026-02-21T10:00:05.678Z","level":"info","service":"api-server","message":"HTTP request","method":"POST","path":"/api/v1/shipments","status":201,"latency_ms":45,"request_id":"req-001-abc"}
{"timestamp":"2026-02-21T10:00:06.123Z","level":"info","service":"api-server","message":"Shipment created","shipment_id":"SHP-20260221-001","carrier":"yamato","destination":"Tokyo"}
{"timestamp":"2026-02-21T10:00:08.456Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/api/v1/shipments/SHP-20260221-001","status":200,"latency_ms":12,"request_id":"req-002-def"}
{"timestamp":"2026-02-21T10:00:10.789Z","level":"info","service":"api-server","message":"HTTP request","method":"PUT","path":"/api/v1/shipments/SHP-20260221-001/status","status":200,"latency_ms":28,"request_id":"req-003-ghi"}
{"timestamp":"2026-02-21T10:00:11.234Z","level":"info","service":"api-server","message":"Shipment status updated","shipment_id":"SHP-20260221-001","old_status":"pending","new_status":"processing"}
{"timestamp":"2026-02-21T10:00:15.567Z","level":"warn","service":"api-server","message":"Slow query detected","query":"SELECT * FROM shipments","latency_ms":350,"threshold_ms":300}
{"timestamp":"2026-02-21T10:00:20.012Z","level":"info","service":"api-server","message":"HTTP request","method":"POST","path":"/api/v1/shipments","status":201,"latency_ms":38,"request_id":"req-004-jkl"}
{"timestamp":"2026-02-21T10:00:20.567Z","level":"info","service":"api-server","message":"Shipment created","shipment_id":"SHP-20260221-002","carrier":"sagawa","destination":"Osaka"}
{"timestamp":"2026-02-21T10:00:25.890Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/api/v1/shipments","status":200,"latency_ms":18,"request_id":"req-005-mno"}
{"timestamp":"2026-02-21T10:00:30.123Z","level":"error","service":"api-server","message":"Failed to send notification","error":"connection refused","endpoint":"http://notification-service:8080/api/v1/notify","shipment_id":"SHP-20260221-001"}
{"timestamp":"2026-02-21T10:00:30.456Z","level":"warn","service":"api-server","message":"Notification retry scheduled","shipment_id":"SHP-20260221-001","retry_count":1,"next_retry_ms":5000}
{"timestamp":"2026-02-21T10:00:31.012Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/api/v1/carriers","status":200,"latency_ms":8,"request_id":"req-006-pqr"}
{"timestamp":"2026-02-21T10:00:35.345Z","level":"info","service":"api-server","message":"HTTP request","method":"POST","path":"/api/v1/shipments","status":422,"latency_ms":15,"request_id":"req-007-stu"}
{"timestamp":"2026-02-21T10:00:35.456Z","level":"warn","service":"api-server","message":"Validation failed","request_id":"req-007-stu","errors":["destination is required","weight must be positive"]}
{"timestamp":"2026-02-21T10:00:40.789Z","level":"info","service":"api-server","message":"HTTP request","method":"DELETE","path":"/api/v1/shipments/SHP-20260221-002","status":204,"latency_ms":22,"request_id":"req-008-vwx"}
{"timestamp":"2026-02-21T10:00:41.012Z","level":"info","service":"api-server","message":"Shipment cancelled","shipment_id":"SHP-20260221-002","reason":"customer_request"}
{"timestamp":"2026-02-21T10:00:45.678Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/metrics","status":200,"latency_ms":5}
{"timestamp":"2026-02-21T10:00:50.123Z","level":"error","service":"api-server","message":"Database connection pool exhausted","pool_size":20,"active_connections":20,"waiting_requests":5}
{"timestamp":"2026-02-21T10:00:50.234Z","level":"error","service":"api-server","message":"HTTP request","method":"POST","path":"/api/v1/shipments","status":503,"latency_ms":5001,"request_id":"req-009-yza"}
{"timestamp":"2026-02-21T10:00:51.345Z","level":"warn","service":"api-server","message":"Circuit breaker opened for downstream service","service":"order-api","threshold_failures":5}
{"timestamp":"2026-02-21T10:00:55.678Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/healthz","status":200,"latency_ms":3}
{"timestamp":"2026-02-21T10:01:00.012Z","level":"info","service":"api-server","message":"HTTP request","method":"POST","path":"/api/v1/shipments","status":201,"latency_ms":52,"request_id":"req-010-bcd"}
{"timestamp":"2026-02-21T10:01:00.567Z","level":"info","service":"api-server","message":"Shipment created","shipment_id":"SHP-20260221-003","carrier":"jppost","destination":"Fukuoka"}
{"timestamp":"2026-02-21T10:01:05.890Z","level":"info","service":"api-server","message":"Notification retry succeeded","shipment_id":"SHP-20260221-001","retry_count":1}
{"timestamp":"2026-02-21T10:01:10.123Z","level":"info","service":"api-server","message":"HTTP request","method":"PUT","path":"/api/v1/shipments/SHP-20260221-001/status","status":200,"latency_ms":31,"request_id":"req-011-efg"}
{"timestamp":"2026-02-21T10:01:10.456Z","level":"info","service":"api-server","message":"Shipment status updated","shipment_id":"SHP-20260221-001","old_status":"processing","new_status":"shipped"}
{"timestamp":"2026-02-21T10:01:15.789Z","level":"debug","service":"api-server","message":"Cache hit","key":"carrier:yamato:config","ttl_remaining":285}
{"timestamp":"2026-02-21T10:01:20.012Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/api/v1/shipments","status":200,"latency_ms":14,"request_id":"req-012-hij"}
{"timestamp":"2026-02-21T10:01:25.345Z","level":"info","service":"api-server","message":"HTTP request","method":"POST","path":"/api/v1/bulk-shipments","status":202,"latency_ms":89,"request_id":"req-013-klm"}
{"timestamp":"2026-02-21T10:01:25.678Z","level":"info","service":"api-server","message":"Bulk shipment job enqueued","job_id":"bulk-job-001","count":15}
{"timestamp":"2026-02-21T10:01:30.012Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/api/v1/shipments/SHP-20260221-003","status":200,"latency_ms":9,"request_id":"req-014-nop"}
{"timestamp":"2026-02-21T10:01:35.345Z","level":"warn","service":"api-server","message":"Rate limit approaching for carrier API","carrier":"yamato","requests_remaining":50,"window":"1m"}
{"timestamp":"2026-02-21T10:01:40.678Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/api/v1/shipments","status":200,"latency_ms":16,"request_id":"req-015-qrs"}
{"timestamp":"2026-02-21T10:01:45.012Z","level":"info","service":"api-server","message":"Bulk shipment job completed","job_id":"bulk-job-001","succeeded":14,"failed":1}
{"timestamp":"2026-02-21T10:01:45.345Z","level":"error","service":"api-server","message":"Bulk shipment item failed","job_id":"bulk-job-001","item_index":7,"error":"invalid postal code: 9999999"}
{"timestamp":"2026-02-21T10:01:50.678Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/healthz","status":200,"latency_ms":2}
{"timestamp":"2026-02-21T10:01:55.012Z","level":"info","service":"api-server","message":"HTTP request","method":"POST","path":"/api/v1/shipments","status":201,"latency_ms":41,"request_id":"req-016-tuv"}
{"timestamp":"2026-02-21T10:01:55.345Z","level":"info","service":"api-server","message":"Shipment created","shipment_id":"SHP-20260221-004","carrier":"yamato","destination":"Sapporo"}
{"timestamp":"2026-02-21T10:02:00.678Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/api/v1/shipments","status":200,"latency_ms":11,"request_id":"req-017-wxy"}
{"timestamp":"2026-02-21T10:02:05.012Z","level":"debug","service":"api-server","message":"Background job triggered","job":"shipment_status_sync","interval_sec":300}
{"timestamp":"2026-02-21T10:02:10.345Z","level":"info","service":"api-server","message":"Shipment status synced from carrier","synced":12,"updated":3}
{"timestamp":"2026-02-21T10:02:15.678Z","level":"info","service":"api-server","message":"HTTP request","method":"PUT","path":"/api/v1/shipments/SHP-20260221-003/status","status":200,"latency_ms":26,"request_id":"req-018-zab"}
{"timestamp":"2026-02-21T10:02:15.890Z","level":"info","service":"api-server","message":"Shipment status updated","shipment_id":"SHP-20260221-003","old_status":"pending","new_status":"delivered"}
{"timestamp":"2026-02-21T10:02:20.012Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/api/v1/reports/daily","status":200,"latency_ms":234,"request_id":"req-019-cde"}
{"timestamp":"2026-02-21T10:02:25.345Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/metrics","status":200,"latency_ms":4}
{"timestamp":"2026-02-21T10:02:30.678Z","level":"info","service":"api-server","message":"HTTP request","method":"POST","path":"/api/v1/webhooks/carrier-update","status":200,"latency_ms":18,"request_id":"req-020-fgh"}
{"timestamp":"2026-02-21T10:02:31.012Z","level":"info","service":"api-server","message":"Carrier webhook processed","carrier":"sagawa","event":"status_update","affected_shipments":3}
{"timestamp":"2026-02-21T10:02:35.345Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/api/v1/shipments","status":200,"latency_ms":13,"request_id":"req-021-ijk"}
{"timestamp":"2026-02-21T10:02:40.678Z","level":"warn","service":"api-server","message":"Cache miss","key":"carrier:sagawa:config","fetching_from_db":true}
{"timestamp":"2026-02-21T10:02:41.012Z","level":"info","service":"api-server","message":"Cache populated","key":"carrier:sagawa:config","ttl_sec":300}
{"timestamp":"2026-02-21T10:02:45.345Z","level":"info","service":"api-server","message":"HTTP request","method":"POST","path":"/api/v1/shipments","status":201,"latency_ms":44,"request_id":"req-022-lmn"}
{"timestamp":"2026-02-21T10:02:45.678Z","level":"info","service":"api-server","message":"Shipment created","shipment_id":"SHP-20260221-005","carrier":"sagawa","destination":"Nagoya"}
{"timestamp":"2026-02-21T10:02:50.012Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/healthz","status":200,"latency_ms":2}
{"timestamp":"2026-02-21T10:02:55.345Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/api/v1/shipments/SHP-20260221-005","status":200,"latency_ms":10,"request_id":"req-023-opq"}
{"timestamp":"2026-02-21T10:03:00.678Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/api/v1/shipments","status":200,"latency_ms":15,"request_id":"req-024-rst"}
{"timestamp":"2026-02-21T10:03:05.012Z","level":"error","service":"api-server","message":"Unhandled exception in request handler","request_id":"req-025-uvw","error":"TypeError: Cannot read properties of null (reading 'id')","stack":"at ShipmentService.getById (shipment.service.ts:142)"}
{"timestamp":"2026-02-21T10:03:05.345Z","level":"error","service":"api-server","message":"HTTP request","method":"GET","path":"/api/v1/shipments/SHP-00000000-000","status":500,"latency_ms":7,"request_id":"req-025-uvw"}
{"timestamp":"2026-02-21T10:03:10.678Z","level":"info","service":"api-server","message":"HTTP request","method":"POST","path":"/api/v1/shipments","status":201,"latency_ms":39,"request_id":"req-026-xyz"}
{"timestamp":"2026-02-21T10:03:10.901Z","level":"info","service":"api-server","message":"Shipment created","shipment_id":"SHP-20260221-006","carrier":"jppost","destination":"Hiroshima"}
{"timestamp":"2026-02-21T10:03:15.012Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/api/v1/shipments","status":200,"latency_ms":12,"request_id":"req-027-abc"}
{"timestamp":"2026-02-21T10:03:20.345Z","level":"debug","service":"api-server","message":"Goroutine pool stats","workers":8,"active":3,"idle":5,"queue_depth":0}
{"timestamp":"2026-02-21T10:03:25.678Z","level":"info","service":"api-server","message":"HTTP request","method":"PUT","path":"/api/v1/shipments/SHP-20260221-004/status","status":200,"latency_ms":29,"request_id":"req-028-def"}
{"timestamp":"2026-02-21T10:03:25.901Z","level":"info","service":"api-server","message":"Shipment status updated","shipment_id":"SHP-20260221-004","old_status":"pending","new_status":"shipped"}
{"timestamp":"2026-02-21T10:03:30.012Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/metrics","status":200,"latency_ms":4}
{"timestamp":"2026-02-21T10:03:35.345Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/api/v1/shipments","status":200,"latency_ms":14,"request_id":"req-029-ghi"}
{"timestamp":"2026-02-21T10:03:40.678Z","level":"info","service":"api-server","message":"HTTP request","method":"POST","path":"/api/v1/shipments","status":201,"latency_ms":43,"request_id":"req-030-jkl"}
{"timestamp":"2026-02-21T10:03:40.901Z","level":"info","service":"api-server","message":"Shipment created","shipment_id":"SHP-20260221-007","carrier":"yamato","destination":"Sendai"}
{"timestamp":"2026-02-21T10:03:45.012Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/healthz","status":200,"latency_ms":2}
{"timestamp":"2026-02-21T10:03:50.345Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/api/v1/shipments/SHP-20260221-006","status":200,"latency_ms":9,"request_id":"req-031-mno"}
{"timestamp":"2026-02-21T10:03:55.678Z","level":"warn","service":"api-server","message":"Disk usage high","path":"/data/logs","used_percent":82,"threshold_percent":80}
{"timestamp":"2026-02-21T10:04:00.012Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/api/v1/shipments","status":200,"latency_ms":13,"request_id":"req-032-pqr"}
{"timestamp":"2026-02-21T10:04:05.345Z","level":"info","service":"api-server","message":"HTTP request","method":"POST","path":"/api/v1/shipments","status":201,"latency_ms":47,"request_id":"req-033-stu"}
{"timestamp":"2026-02-21T10:04:05.678Z","level":"info","service":"api-server","message":"Shipment created","shipment_id":"SHP-20260221-008","carrier":"sagawa","destination":"Kobe"}
{"timestamp":"2026-02-21T10:04:10.012Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/api/v1/reports/weekly","status":200,"latency_ms":412,"request_id":"req-034-vwx"}
{"timestamp":"2026-02-21T10:04:15.345Z","level":"info","service":"api-server","message":"HTTP request","method":"DELETE","path":"/api/v1/shipments/SHP-20260221-007","status":204,"latency_ms":20,"request_id":"req-035-yza"}
{"timestamp":"2026-02-21T10:04:15.678Z","level":"info","service":"api-server","message":"Shipment cancelled","shipment_id":"SHP-20260221-007","reason":"duplicate_order"}
{"timestamp":"2026-02-21T10:04:20.012Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/api/v1/shipments","status":200,"latency_ms":11,"request_id":"req-036-bcd"}
{"timestamp":"2026-02-21T10:04:25.345Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/healthz","status":200,"latency_ms":2}
{"timestamp":"2026-02-21T10:04:30.678Z","level":"info","service":"api-server","message":"HTTP request","method":"POST","path":"/api/v1/webhooks/carrier-update","status":200,"latency_ms":21,"request_id":"req-037-efg"}
{"timestamp":"2026-02-21T10:04:31.012Z","level":"info","service":"api-server","message":"Carrier webhook processed","carrier":"jppost","event":"delivered","affected_shipments":1}
{"timestamp":"2026-02-21T10:04:35.345Z","level":"info","service":"api-server","message":"HTTP request","method":"PUT","path":"/api/v1/shipments/SHP-20260221-005/status","status":200,"latency_ms":27,"request_id":"req-038-hij"}
{"timestamp":"2026-02-21T10:04:35.678Z","level":"info","service":"api-server","message":"Shipment status updated","shipment_id":"SHP-20260221-005","old_status":"processing","new_status":"delivered"}
{"timestamp":"2026-02-21T10:04:40.012Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/metrics","status":200,"latency_ms":3}
{"timestamp":"2026-02-21T10:04:45.345Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/api/v1/shipments","status":200,"latency_ms":12,"request_id":"req-039-klm"}
{"timestamp":"2026-02-21T10:04:50.678Z","level":"info","service":"api-server","message":"HTTP request","method":"POST","path":"/api/v1/shipments","status":201,"latency_ms":40,"request_id":"req-040-nop"}
{"timestamp":"2026-02-21T10:04:50.901Z","level":"info","service":"api-server","message":"Shipment created","shipment_id":"SHP-20260221-009","carrier":"yamato","destination":"Kyoto"}
{"timestamp":"2026-02-21T10:04:55.012Z","level":"info","service":"api-server","message":"HTTP request","method":"GET","path":"/api/v1/shipments/SHP-20260221-009","status":200,"latency_ms":8,"request_id":"req-041-qrs"}
{"timestamp":"2026-02-21T10:05:00.345Z","level":"info","service":"api-server","message":"Graceful shutdown signal received","signal":"SIGTERM"}
{"timestamp":"2026-02-21T10:05:00.678Z","level":"info","service":"api-server","message":"Draining active connections","active_requests":2}
{"timestamp":"2026-02-21T10:05:02.012Z","level":"info","service":"api-server","message":"All connections drained","elapsed_ms":1367}
{"timestamp":"2026-02-21T10:05:02.345Z","level":"info","service":"api-server","message":"Server shutdown complete"}`;

// ---------------------------------------------------------------------------
// mockConfigMaps (2件)
// ---------------------------------------------------------------------------
export const mockConfigMaps: ConfigMap[] = [
  {
    name: "api-server-config",
    namespace: "sample-dev",
    data: { APP_ENV: "development", LOG_LEVEL: "info" },
    age: "5m",
  },
  {
    name: "auth-service-config",
    namespace: "sample-dev",
    data: { AUTH_ISSUER: "https://auth.example.com", TOKEN_EXPIRY: "3600" },
    age: "7d",
  },
];

// ---------------------------------------------------------------------------
// mockSecrets (1件)
// ---------------------------------------------------------------------------
export const mockSecrets: Secret[] = [
  {
    name: "auth-service-secret",
    namespace: "sample-dev",
    type: "Opaque",
    keys: ["jwt-secret", "admin-token"],
    age: "7d",
  },
];

// ---------------------------------------------------------------------------
// K8sClient モック
// ---------------------------------------------------------------------------
export function createMockK8sClient(): K8sClient {
  return {
    config: {
      ...DEFAULT_CONFIG,
      environment: "dev",
    },

    testConnection: async () => true,

    getServerVersion: async () => "v1.28.0-mock",

    getNamespaces: async () => [
      "ambassador",
      "default",
      "istio-system",
      "kube-system",
      "mail",
      "order",
      "payment",
      "pdf",
      "shipping",
      "store",
      "web",
    ],

    getPodsInNamespace: async (_namespace: string) => [...mockPods],

    getDeploymentsInNamespace: async (_namespace: string) => [
      ...mockDeployments,
    ],

    getEventsInNamespace: async (_namespace: string) => [...mockEvents],

    deletePod: async (_namespace: string, _podName: string) => {},

    getPodEvents: async (_namespace: string, _podName: string) => [
      ...mockEvents.slice(0, 3),
    ],

    getExecWebSocketUrl: (
      _namespace: string,
      podName: string,
      container?: string,
    ) =>
      `ws://localhost:8001/api/v1/namespaces/shipping/pods/${podName}/exec?command=/bin/sh&stdin=true&stdout=true&stderr=true&tty=true${container ? `&container=${container}` : ""}`,

    getPodLogs: async (
      _namespace: string,
      _podName: string,
      _container?: string,
      _tailLines?: number,
    ) => MOCK_LOG,

    getArgoApplications: async () => [],

    rolloutRestart: async (_namespace: string, _deploymentName: string) => {},

    syncArgoApplication: async (_appName: string) => {},

    getCronJobsInNamespace: async (_namespace: string) => [],

    getJobsInNamespace: async (_namespace: string) => [],

    getHPAsInNamespace: async (_namespace: string) => [],

    getConfigMapsInNamespace: async (_namespace: string) => [...mockConfigMaps],

    getSecretsInNamespace: async (_namespace: string) => [...mockSecrets],

    getIngressesInNamespace: async (_namespace: string) => [],

    getResourceQuotasInNamespace: async (_namespace: string) => [],

    getLimitRangesInNamespace: async (_namespace: string) => [],

    getPVCsInNamespace: async (_namespace: string) => [],

    getStorageClasses: async () => [],

    getArgoManagedResources: async (_appName: string) => [],
  };
}
