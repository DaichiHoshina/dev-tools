export interface ServiceConfig {
  name: string;
  displayName: string;
  namespace: string;
  dbName: string;
  envName?: string;
  version?: string;
}

export interface ClusterConfig {
  env: "dev" | "tes" | "prd";
  clusterName: string;
  dbHost: string;
  ecrBase: string;
}

export type Env = "dev" | "tes" | "prd";
export type ProjectId = "project-a" | "project-b";

export interface ProjectConfig {
  id: ProjectId;
  label: string;
  description: string;
  services: ServiceConfig[];
  clusters: Record<Env, ClusterConfig>;
}

const projectAServices: ServiceConfig[] = [
  {
    name: "api-server",
    displayName: "APIサーバー",
    namespace: "api",
    dbName: "api_server",
    envName: "api-server-env",
  },
  {
    name: "web-frontend",
    displayName: "Webフロントエンド",
    namespace: "web",
    dbName: "web_frontend",
    envName: "web-frontend-env",
  },
  {
    name: "worker",
    displayName: "ワーカー",
    namespace: "worker",
    dbName: "worker",
    envName: "worker-env",
  },
];

const projectBServices: ServiceConfig[] = [
  {
    name: "api-server",
    displayName: "APIサーバー",
    namespace: "api",
    dbName: "api_server",
    envName: "api-server-env",
    version: "1.0.0",
  },
  {
    name: "web-frontend",
    displayName: "Webフロントエンド",
    namespace: "web",
    dbName: "web_frontend",
    envName: "web-frontend-env",
    version: "1.0.0",
  },
  {
    name: "worker",
    displayName: "ワーカー",
    namespace: "worker",
    dbName: "worker",
    envName: "worker-env",
    version: "1.0.0",
  },
];

export const projects: Record<ProjectId, ProjectConfig> = {
  "project-a": {
    id: "project-a",
    label: "Project A",
    description: "サンプルプロジェクト A",
    services: projectAServices,
    clusters: {
      dev: {
        env: "dev",
        clusterName: "my-cluster-dev",
        dbHost: "db.dev.example.internal",
        ecrBase: "123456789012.dkr.ecr.ap-northeast-1.amazonaws.com",
      },
      tes: {
        env: "tes",
        clusterName: "my-cluster-tes",
        dbHost: "db.tes.example.internal",
        ecrBase: "123456789012.dkr.ecr.ap-northeast-1.amazonaws.com",
      },
      prd: {
        env: "prd",
        clusterName: "my-cluster-prd",
        dbHost: "db.prd.example.internal",
        ecrBase: "123456789012.dkr.ecr.ap-northeast-1.amazonaws.com",
      },
    },
  },
  "project-b": {
    id: "project-b",
    label: "Project B",
    description: "サンプルプロジェクト B",
    services: projectBServices,
    clusters: {
      dev: {
        env: "dev",
        clusterName: "my-cluster-b-dev",
        dbHost: "db.dev.example-b.internal",
        ecrBase: "123456789012.dkr.ecr.ap-northeast-1.amazonaws.com",
      },
      tes: {
        env: "tes",
        clusterName: "my-cluster-b-tes",
        dbHost: "db.tes.example-b.internal",
        ecrBase: "123456789012.dkr.ecr.ap-northeast-1.amazonaws.com",
      },
      prd: {
        env: "prd",
        clusterName: "my-cluster-b-prd",
        dbHost: "db.prd.example-b.internal",
        ecrBase: "123456789012.dkr.ecr.ap-northeast-1.amazonaws.com",
      },
    },
  },
};

export function generateRunCommand(service: ServiceConfig): string {
  const envFrom = service.envName
    ? [
        { configMapRef: { name: service.envName } },
        { secretRef: { name: service.envName, optional: true } },
      ]
    : [];

  const overrides = JSON.stringify({
    metadata: {
      annotations: { "sidecar.istio.io/inject": "false" },
    },
    spec: {
      containers: [
        {
          name: "temp-node",
          image: "alpine:3.20",
          stdin: true,
          tty: true,
          ...(envFrom.length > 0 ? { envFrom } : {}),
        },
      ],
    },
  });

  return `kubectl run temp-node \\
  --image=alpine:3.20 \\
  --namespace=${service.namespace} \\
  --overrides='${overrides}' \\
  --restart=Never --rm -it \\
  -- sh -c "apk add --no-cache mysql-client && sh"`;
}

export function generateExecCommand(service: ServiceConfig): string {
  return `# Podの一覧を確認
kubectl get pod -n ${service.namespace}

# 実行中のPodに接続（Pod名は上記で確認した名前に置き換える）
kubectl exec -it <POD_NAME> -n ${service.namespace} -- /bin/sh`;
}

export function generateDeleteCommand(service: ServiceConfig): string {
  return `# temp-node Pod削除
kubectl delete pod temp-node --namespace=${service.namespace}

# 削除確認
kubectl get pod temp-node --namespace=${service.namespace}
# "NotFound" であることを確認`;
}

export function generateLogsCommand(service: ServiceConfig): string {
  return `# Podの一覧を確認
kubectl get pod -n ${service.namespace}

# ログを表示（Pod名は上記で確認した名前に置き換える）
kubectl logs <POD_NAME> -n ${service.namespace}

# tail -f 形式でログをストリーム表示
kubectl logs -f <POD_NAME> -n ${service.namespace}`;
}

export function generateMigrationCommands(
  service: ServiceConfig,
  projectId: ProjectId,
  ecrBase: string,
  env: Env,
  version: string,
): { label: string; command: string }[] {
  const v = version || service.version || "<VERSION>";
  const tag = `${env}-v${v}`;
  const image = `${ecrBase}/${projectId}/application/micro_service/${service.name}:${tag}`;

  const envFrom = service.envName
    ? [
        { configMapRef: { name: service.envName } },
        { secretRef: { name: service.envName } },
      ]
    : [];

  const overrides = JSON.stringify(
    {
      apiVersion: "v1",
      spec: {
        containers: [
          {
            name: "temp-node",
            image,
            command: ["/bin/ash"],
            tty: true,
            stdin: true,
            ...(envFrom.length > 0 ? { envFrom } : {}),
          },
        ],
      },
    },
    null,
    2,
  );

  return [
    {
      label: "migration: kubectl run",
      command: `kubectl run temp-node --namespace=${service.namespace} --image=alpine:3.22 --restart=Never --rm -it \\\n  --overrides='${overrides}' \\\n  -- ash`,
    },
    {
      label: "migration: version",
      command: `${service.name} migrate version`,
    },
    {
      label: "migration: up",
      command: `${service.name} migrate up`,
    },
  ];
}
