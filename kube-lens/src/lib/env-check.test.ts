import { describe, it, expect } from "vitest";
import { checkDeploymentEnv, buildEnvReports } from "./env-check";
import type { Deployment, ConfigMap, Secret } from "./types";

// ─── テスト用ヘルパー ──────────────────────────────────────────────────────────

function makeDeployment(containers: Deployment["containers"]): Deployment {
  return {
    name: "test-deployment",
    namespace: "default",
    readyReplicas: 1,
    desiredReplicas: 1,
    updatedReplicas: 1,
    availableReplicas: 1,
    age: "1d",
    images: [],
    containers,
    strategy: "RollingUpdate",
  };
}

const noConfigMaps: ConfigMap[] = [];
const noSecrets: Secret[] = [];

const someConfigMaps: ConfigMap[] = [
  { name: "app-config", namespace: "default", data: { KEY: "value" }, age: "1d" },
];

const someSecrets: Secret[] = [
  { name: "app-secret", namespace: "default", type: "Opaque", keys: ["token"], age: "1d" },
];

// ─── ENV_EMPTY_VALUE ─────────────────────────────────────────────────────────

describe("ENV_EMPTY_VALUE", () => {
  it("値が空文字の env → warning を返す", () => {
    const d = makeDeployment([
      { name: "app", image: "app:v1", env: [{ name: "LOG_LEVEL", value: "" }] },
    ]);
    const issues = checkDeploymentEnv(d, noConfigMaps, noSecrets);
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("warning");
    expect(issues[0].kind).toBe("ENV_EMPTY_VALUE");
    expect(issues[0].envName).toBe("LOG_LEVEL");
  });

  it("値が空白のみの env → warning を返す", () => {
    const d = makeDeployment([
      { name: "app", image: "app:v1", env: [{ name: "WHITESPACE", value: "   " }] },
    ]);
    const issues = checkDeploymentEnv(d, noConfigMaps, noSecrets);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("ENV_EMPTY_VALUE");
  });

  it("値が正常な env → issues なし", () => {
    const d = makeDeployment([
      { name: "app", image: "app:v1", env: [{ name: "APP_ENV", value: "production" }] },
    ]);
    const issues = checkDeploymentEnv(d, noConfigMaps, noSecrets);
    expect(issues).toHaveLength(0);
  });
});

// ─── ENV_VALUEREF_MISSING (configMapKeyRef) ───────────────────────────────────

describe("ENV_VALUEREF_MISSING - configMapKeyRef", () => {
  it("存在しない ConfigMap を参照 → error を返す", () => {
    const d = makeDeployment([
      {
        name: "app",
        image: "app:v1",
        env: [{ name: "DB_HOST", valueFrom: { configMapKeyRef: { name: "missing-cm", key: "host" } } }],
      },
    ]);
    const issues = checkDeploymentEnv(d, noConfigMaps, noSecrets);
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("error");
    expect(issues[0].kind).toBe("ENV_VALUEREF_MISSING");
    expect(issues[0].refName).toBe("missing-cm");
  });

  it("存在する ConfigMap を参照 → issues なし", () => {
    const d = makeDeployment([
      {
        name: "app",
        image: "app:v1",
        env: [{ name: "KEY", valueFrom: { configMapKeyRef: { name: "app-config", key: "KEY" } } }],
      },
    ]);
    const issues = checkDeploymentEnv(d, someConfigMaps, noSecrets);
    expect(issues).toHaveLength(0);
  });

  it("optional: true の場合は存在しなくてもエラーなし", () => {
    const d = makeDeployment([
      {
        name: "app",
        image: "app:v1",
        env: [
          { name: "OPT_KEY", valueFrom: { configMapKeyRef: { name: "missing-cm", key: "k", optional: true } } },
        ],
      },
    ]);
    const issues = checkDeploymentEnv(d, noConfigMaps, noSecrets);
    expect(issues).toHaveLength(0);
  });
});

// ─── ENV_VALUEREF_MISSING (secretKeyRef) ──────────────────────────────────────

describe("ENV_VALUEREF_MISSING - secretKeyRef", () => {
  it("存在しない Secret を参照 → error を返す", () => {
    const d = makeDeployment([
      {
        name: "app",
        image: "app:v1",
        env: [{ name: "API_KEY", valueFrom: { secretKeyRef: { name: "missing-secret", key: "key" } } }],
      },
    ]);
    const issues = checkDeploymentEnv(d, noConfigMaps, noSecrets);
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("error");
    expect(issues[0].kind).toBe("ENV_VALUEREF_MISSING");
    expect(issues[0].refName).toBe("missing-secret");
  });

  it("存在する Secret を参照 → issues なし", () => {
    const d = makeDeployment([
      {
        name: "app",
        image: "app:v1",
        env: [{ name: "TOKEN", valueFrom: { secretKeyRef: { name: "app-secret", key: "token" } } }],
      },
    ]);
    const issues = checkDeploymentEnv(d, noConfigMaps, someSecrets);
    expect(issues).toHaveLength(0);
  });
});

// ─── ENV_FROM_MISSING_REF (configMapRef) ─────────────────────────────────────

describe("ENV_FROM_MISSING_REF - configMapRef", () => {
  it("存在しない ConfigMap への envFrom → error を返す", () => {
    const d = makeDeployment([
      { name: "app", image: "app:v1", envFrom: [{ configMapRef: { name: "missing-cm" } }] },
    ]);
    const issues = checkDeploymentEnv(d, noConfigMaps, noSecrets);
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("error");
    expect(issues[0].kind).toBe("ENV_FROM_MISSING_REF");
    expect(issues[0].refName).toBe("missing-cm");
  });

  it("存在する ConfigMap への envFrom → issues なし", () => {
    const d = makeDeployment([
      { name: "app", image: "app:v1", envFrom: [{ configMapRef: { name: "app-config" } }] },
    ]);
    const issues = checkDeploymentEnv(d, someConfigMaps, noSecrets);
    expect(issues).toHaveLength(0);
  });
});

// ─── ENV_FROM_MISSING_REF (secretRef) ────────────────────────────────────────

describe("ENV_FROM_MISSING_REF - secretRef", () => {
  it("存在しない Secret への envFrom → error を返す", () => {
    const d = makeDeployment([
      { name: "app", image: "app:v1", envFrom: [{ secretRef: { name: "missing-secret" } }] },
    ]);
    const issues = checkDeploymentEnv(d, noConfigMaps, noSecrets);
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("error");
    expect(issues[0].kind).toBe("ENV_FROM_MISSING_REF");
  });

  it("optional: true の envFrom は存在しなくてもエラーなし", () => {
    const d = makeDeployment([
      { name: "app", image: "app:v1", envFrom: [{ secretRef: { name: "missing-secret", optional: true } }] },
    ]);
    const issues = checkDeploymentEnv(d, noConfigMaps, noSecrets);
    expect(issues).toHaveLength(0);
  });
});

// ─── 複数コンテナ・複数 issues ────────────────────────────────────────────────

describe("複数コンテナ・複合ケース", () => {
  it("2コンテナに問題があれば両方の issues を返す", () => {
    const d = makeDeployment([
      {
        name: "main",
        image: "main:v1",
        env: [{ name: "LOG", value: "" }],
      },
      {
        name: "sidecar",
        image: "sidecar:v1",
        envFrom: [{ configMapRef: { name: "missing-cm" } }],
      },
    ]);
    const issues = checkDeploymentEnv(d, noConfigMaps, noSecrets);
    expect(issues).toHaveLength(2);
    expect(issues[0].containerName).toBe("main");
    expect(issues[1].containerName).toBe("sidecar");
  });

  it("env も envFrom も未定義のコンテナ → issues なし", () => {
    const d = makeDeployment([
      { name: "app", image: "app:v1" },
    ]);
    const issues = checkDeploymentEnv(d, noConfigMaps, noSecrets);
    expect(issues).toHaveLength(0);
  });
});

// ─── buildEnvReports ─────────────────────────────────────────────────────────

describe("buildEnvReports", () => {
  it("複数 Deployment をまとめてレポートする", () => {
    const deployments = [
      makeDeployment([{ name: "app", image: "app:v1", env: [{ name: "EMPTY", value: "" }] }]),
      { ...makeDeployment([]), name: "clean-deployment" },
    ];
    const reports = buildEnvReports(deployments, noConfigMaps, noSecrets);
    expect(reports).toHaveLength(2);
    expect(reports[0].issues).toHaveLength(1);
    expect(reports[1].issues).toHaveLength(0);
  });
});
