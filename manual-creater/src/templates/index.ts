import type { Template } from "../types/template";
import { releaseDeploy } from "./release-deploy";
import { k8sReleaseDeploy } from "./k8s-release-deploy";
import { logInvestigation } from "./log-investigation";
import { errorResponse } from "./error-response";

export const templates: Template[] = [
  releaseDeploy,
  k8sReleaseDeploy,

  logInvestigation,
  errorResponse,
];

export function getTemplateById(id: string): Template | undefined {
  return templates.find((t) => t.id === id);
}
