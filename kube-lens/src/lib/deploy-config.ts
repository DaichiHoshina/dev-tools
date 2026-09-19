export { ECR_REGISTRY } from "./service-registry";
import { ECR_BASE_PATH, SERVICE_REGISTRY } from "./service-registry";
import type { ServiceDef } from "./service-registry";

export interface DeployService extends ServiceDef {
  ecrPath: string; // コンテナレジストリ内のイメージパス（レジストリ部分を除く）
}

const ECR_PATH_MAP: Record<string, string> = {
  "web-frontend": `${ECR_BASE_PATH}/web-frontend`,
  "api-server": `${ECR_BASE_PATH}/api-server`,
  worker: `${ECR_BASE_PATH}/worker`,
};

export const DEPLOY_SERVICES: DeployService[] = SERVICE_REGISTRY.map((svc) => {
  const ecrPath = ECR_PATH_MAP[svc.key];
  if (!ecrPath) {
    throw new Error(`Missing container image path for service: ${svc.key}`);
  }
  return { ...svc, ecrPath };
});
