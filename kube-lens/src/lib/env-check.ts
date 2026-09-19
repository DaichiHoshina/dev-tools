import type { Deployment, DeploymentContainer, ConfigMap, Secret } from "~/lib/types";

// ─── 型定義 ───────────────────────────────────────────────────────────────────

export type EnvIssueLevel = "error" | "warning";

export type EnvIssueKind =
  | "ENV_EMPTY_VALUE"
  | "ENV_FROM_MISSING_REF"
  | "ENV_VALUEREF_MISSING";

export interface EnvIssue {
  level: EnvIssueLevel;
  kind: EnvIssueKind;
  message: string;
  deploymentName: string;
  containerName: string;
  /** 問題のある env 変数名 */
  envName?: string;
  /** 存在しない参照先名（ConfigMap/Secret名） */
  refName?: string;
}

export interface DeploymentEnvReport {
  deployment: Deployment;
  issues: EnvIssue[];
}

// ─── 検知ロジック ─────────────────────────────────────────────────────────────

function checkContainer(
  container: DeploymentContainer,
  deploymentName: string,
  configMapNames: Set<string>,
  secretNames: Set<string>,
): EnvIssue[] {
  const issues: EnvIssue[] = [];

  for (const env of container.env ?? []) {
    // 空値チェック
    if (env.value !== undefined && env.value.trim() === "") {
      issues.push({
        level: "warning",
        kind: "ENV_EMPTY_VALUE",
        message: `"${env.name}" の値が空です`,
        deploymentName,
        containerName: container.name,
        envName: env.name,
      });
    }

    // valueFrom.configMapKeyRef の参照先チェック
    if (env.valueFrom?.configMapKeyRef) {
      const ref = env.valueFrom.configMapKeyRef;
      if (!ref.optional && !configMapNames.has(ref.name)) {
        issues.push({
          level: "error",
          kind: "ENV_VALUEREF_MISSING",
          message: `"${env.name}" が参照する ConfigMap "${ref.name}" が存在しません`,
          deploymentName,
          containerName: container.name,
          envName: env.name,
          refName: ref.name,
        });
      }
    }

    // valueFrom.secretKeyRef の参照先チェック
    if (env.valueFrom?.secretKeyRef) {
      const ref = env.valueFrom.secretKeyRef;
      if (!ref.optional && !secretNames.has(ref.name)) {
        issues.push({
          level: "error",
          kind: "ENV_VALUEREF_MISSING",
          message: `"${env.name}" が参照する Secret "${ref.name}" が存在しません`,
          deploymentName,
          containerName: container.name,
          envName: env.name,
          refName: ref.name,
        });
      }
    }
  }

  for (const ef of container.envFrom ?? []) {
    // envFrom.configMapRef の参照先チェック
    if (ef.configMapRef && !ef.configMapRef.optional && !configMapNames.has(ef.configMapRef.name)) {
      issues.push({
        level: "error",
        kind: "ENV_FROM_MISSING_REF",
        message: `envFrom が参照する ConfigMap "${ef.configMapRef.name}" が存在しません`,
        deploymentName,
        containerName: container.name,
        refName: ef.configMapRef.name,
      });
    }

    // envFrom.secretRef の参照先チェック
    if (ef.secretRef && !ef.secretRef.optional && !secretNames.has(ef.secretRef.name)) {
      issues.push({
        level: "error",
        kind: "ENV_FROM_MISSING_REF",
        message: `envFrom が参照する Secret "${ef.secretRef.name}" が存在しません`,
        deploymentName,
        containerName: container.name,
        refName: ef.secretRef.name,
      });
    }
  }

  return issues;
}

export function checkDeploymentEnv(
  deployment: Deployment,
  configMaps: ConfigMap[],
  secrets: Secret[],
): EnvIssue[] {
  const configMapNames = new Set(configMaps.map((cm) => cm.name));
  const secretNames = new Set(secrets.map((s) => s.name));

  return deployment.containers.flatMap((container) =>
    checkContainer(container, deployment.name, configMapNames, secretNames),
  );
}

export function buildEnvReports(
  deployments: Deployment[],
  configMaps: ConfigMap[],
  secrets: Secret[],
): DeploymentEnvReport[] {
  return deployments.map((d) => ({
    deployment: d,
    issues: checkDeploymentEnv(d, configMaps, secrets),
  }));
}
