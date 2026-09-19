export { ECR_REGISTRY, ECR_BASE_PATH } from "./service-registry";
import { SERVICE_REGISTRY } from "./service-registry";
import type { ServiceDef } from "./service-registry";

export interface ReleaseService extends ServiceDef {
  valuesFile: string;
  argoPrdApp: string;
}

const RELEASE_EXTRA_MAP: Record<
  string,
  { valuesFile: string; argoPrdApp: string }
> = {
  "web-frontend": {
    valuesFile: "web-frontend.yaml",
    argoPrdApp: "myapp-production-web-frontend",
  },
  "api-server": {
    valuesFile: "api-server.yaml",
    argoPrdApp: "myapp-production-api-server",
  },
  worker: {
    valuesFile: "worker.yaml",
    argoPrdApp: "myapp-production-worker",
  },
};

export const RELEASE_SERVICES: ReleaseService[] = SERVICE_REGISTRY.map(
  (svc) => {
    const extra = RELEASE_EXTRA_MAP[svc.key];
    if (!extra) {
      throw new Error(`Missing release config for service: ${svc.key}`);
    }
    return {
      ...svc,
      ...extra,
    };
  },
);
