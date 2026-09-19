export interface MigrationServiceDef {
  id: string;
  namespace: string;
  podLabel: string;
  container: string;
  description: string;
}

// Example migration services - replace with your own services
export const MIGRATION_SERVICES: MigrationServiceDef[] = [
  {
    id: "api-server",
    namespace: "backend",
    podLabel: "app.kubernetes.io/name=api-server",
    container: "api-server",
    description: "API Server",
  },
  {
    id: "worker",
    namespace: "backend",
    podLabel: "app.kubernetes.io/name=worker",
    container: "worker",
    description: "Worker",
  },
];

// 全環境読み取り専用
export function isReadonlyEnv(_env: string): boolean {
  return true;
}
