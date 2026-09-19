// Container registry settings (configure via VITE_CONTAINER_REGISTRY or update directly)
export const ECR_REGISTRY =
  (import.meta.env?.VITE_CONTAINER_REGISTRY as string | undefined) ??
  "your-registry.example.com";
export const ECR_BASE_PATH = "your-org/services";

export interface ServiceDef {
  key: string;
  name: string; // K8s Deployment名
  label: string;
  namespace: string; // K8s namespace
  argoDevApp: string;
  argoTesApp: string;
  appRepo: string; // Git リポジトリパス
}

// Example service registry - replace with your own services
export const SERVICE_REGISTRY: ServiceDef[] = [
  {
    key: "web-frontend",
    name: "web-frontend",
    label: "Web Frontend",
    namespace: "frontend",
    argoDevApp: "myapp-dev-web-frontend",
    argoTesApp: "myapp-staging-web-frontend",
    appRepo: "application/frontend/web",
  },
  {
    key: "api-server",
    name: "api-server",
    label: "API Server",
    namespace: "backend",
    argoDevApp: "myapp-dev-api-server",
    argoTesApp: "myapp-staging-api-server",
    appRepo: "application/backend/api-server",
  },
  {
    key: "worker",
    name: "worker",
    label: "Worker",
    namespace: "backend",
    argoDevApp: "myapp-dev-worker",
    argoTesApp: "myapp-staging-worker",
    appRepo: "application/backend/worker",
  },
];
