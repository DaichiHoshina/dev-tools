import { describe, it, expect, beforeEach } from "vitest";
import { CONFIG, calculateTagName, DEPLOY_STEPS } from "../config";

describe("CONFIG", () => {
  beforeEach(() => {
    // window.RELEASE_MANAGER_CONFIG をクリア
    (global as any).window = {
      RELEASE_MANAGER_CONFIG: undefined,
    };
  });

  describe("GITLAB設定", () => {
    it("GitLab設定が定義されている", () => {
      expect(CONFIG.GITLAB.BASE_URL).toBe("https://gitlab.example.com");
      expect(CONFIG.GITLAB.API_VERSION).toBe("v4");
      expect(CONFIG.GITLAB.PROJECT_ID).toBe("your-org/tools/release-manager");
      expect(CONFIG.GITLAB.INFRASTRUCTURE_PROJECT_ID).toBe(
        "your-org/infrastructure/helm/application",
      );
    });
  });

  describe("PIPELINE設定", () => {
    it("トークンが未設定の場合は空文字を返す", () => {
      expect(CONFIG.PIPELINE.TRIGGER_TOKEN).toBe("");
      expect(CONFIG.PIPELINE.READ_TOKEN).toBe("");
      expect(CONFIG.PIPELINE.INFRA_GITLAB_TOKEN).toBe("");
    });

    it("トークンが設定されている場合は値を返す", () => {
      (global as any).window = {
        RELEASE_MANAGER_CONFIG: {
          TRIGGER_TOKEN: "trigger-token",
          READ_TOKEN: "read-token",
          INFRA_GITLAB_TOKEN: "infra-token",
        },
      };

      expect(CONFIG.PIPELINE.TRIGGER_TOKEN).toBe("trigger-token");
      expect(CONFIG.PIPELINE.READ_TOKEN).toBe("read-token");
      expect(CONFIG.PIPELINE.INFRA_GITLAB_TOKEN).toBe("infra-token");
    });
  });

  describe("UI設定", () => {
    it("UI設定が定義されている", () => {
      expect(CONFIG.UI.MAX_LOG_LINES).toBe(1000);
      expect(CONFIG.UI.AUTO_SCROLL).toBe(true);
      expect(CONFIG.UI.MR_POLL_INTERVAL).toBe(3000); // 3秒（進捗更新を滑らかに）
      expect(CONFIG.UI.MR_MAX_WAIT).toBe(1800000);
    });
  });
});

describe("DEPLOY_STEPS", () => {
  it("5つのステップが定義されている", () => {
    expect(DEPLOY_STEPS).toHaveLength(5);
  });

  it("各ステップにid, name, iconが存在", () => {
    DEPLOY_STEPS.forEach((step) => {
      expect(step.id).toBeGreaterThan(0);
      expect(step.name).toBeTruthy();
      expect(step.icon).toBeTruthy();
    });
  });

  it("Step 2はwaitForUserがtrue", () => {
    expect(DEPLOY_STEPS[1].waitForUser).toBe(true); // Step 2
  });
});

describe("calculateTagName", () => {
  it("sprint版: バージョンにドットが含まれる場合", () => {
    const result = calculateTagName("sprint", "24.1");
    expect(result).toBe("v1.24.1");
  });

  it("sprint版: バージョンにドットが含まれない場合", () => {
    const result = calculateTagName("sprint", "24");
    expect(result).toBe("v1.24.0");
  });

  it("patch版", () => {
    const result = calculateTagName("patch", "1.24.1");
    expect(result).toBe("v1.24.1");
  });

  it("custom版: プレフィックスあり", () => {
    const result = calculateTagName("custom", "v1.0.0");
    expect(result).toBe("v1.0.0");
  });

  it("custom版: プレフィックスなし", () => {
    const result = calculateTagName("custom", "1.0.0");
    expect(result).toBe("v1.0.0");
  });

  it("カスタムプレフィックス", () => {
    const result = calculateTagName("sprint", "24", "release-");
    expect(result).toBe("release-1.24.0");
  });
});
