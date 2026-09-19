import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DeployHelmHandler } from "../deploy-helm";

// モックAPI作成
const createMockAPI = () => ({
  getFile: vi.fn(),
  updateFile: vi.fn(),
});

// モックStateManager作成
const createMockStateManager = () => ({
  deployments: new Map(),
  updateStep: vi.fn(),
  log: vi.fn(),
  onStepUpdate: vi.fn(),
  onLogUpdate: vi.fn(),
});

describe("DeployHelmHandler", () => {
  let handler: DeployHelmHandler;
  let mockAPI: ReturnType<typeof createMockAPI>;
  let mockStateManager: ReturnType<typeof createMockStateManager>;

  beforeEach(() => {
    mockAPI = createMockAPI();
    mockStateManager = createMockStateManager();
    handler = new DeployHelmHandler(mockAPI as any, mockStateManager as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("updateHelmValues", () => {
    const projectPath = "infrastructure/helm-charts";
    const filePath = "environments/tes/values/test-service.yaml";
    const branch = "deploy-branch";
    const tagName = "v1.2.3";
    const service = "test-service";

    it("形式1: image直下のtagを更新", async () => {
      const originalContent = `
image:
  repository: example.com/app
  tag: v0.0.1
  pullPolicy: IfNotPresent
`;

      const expectedContent = `
image:
  repository: example.com/app
  tag: prd-v1.2.3
  pullPolicy: IfNotPresent
`;

      mockAPI.getFile.mockResolvedValue(originalContent);
      mockAPI.updateFile.mockResolvedValue({});

      await handler.updateHelmValues(
        projectPath,
        filePath,
        branch,
        tagName,
        service,
      );

      expect(mockAPI.getFile).toHaveBeenCalledWith(
        projectPath,
        filePath,
        branch,
      );
      expect(mockAPI.updateFile).toHaveBeenCalledWith(
        projectPath,
        filePath,
        branch,
        expectedContent,
        `chore: update ${service} to prd-${tagName}`,
      );
    });

    it("形式1: imageとtagの間に他のフィールドがある場合も更新", async () => {
      const originalContent = `
image:
  repository: example.com/app
  pullPolicy: IfNotPresent
  digest: sha256:abcd1234
  tag: "v0.0.1"
`;

      mockAPI.getFile.mockResolvedValue(originalContent);
      mockAPI.updateFile.mockResolvedValue({});

      await handler.updateHelmValues(
        projectPath,
        filePath,
        branch,
        tagName,
        service,
      );

      const updateCall = mockAPI.updateFile.mock.calls[0];
      expect(updateCall[3]).toContain('tag: "prd-v1.2.3"');
    });

    it("形式1: tagがクォートなしの場合も更新", async () => {
      const originalContent = `
image:
  repository: example.com/app
  tag: v0.0.1
`;

      mockAPI.getFile.mockResolvedValue(originalContent);
      mockAPI.updateFile.mockResolvedValue({});

      await handler.updateHelmValues(
        projectPath,
        filePath,
        branch,
        tagName,
        service,
      );

      const updateCall = mockAPI.updateFile.mock.calls[0];
      expect(updateCall[3]).toContain("tag: prd-v1.2.3");
    });

    it("形式2: フォールバックパターンでtag更新", async () => {
      const originalContent = `
# シンプルな形式
tag: "v0.0.1"
`;

      const expectedContent = `
# シンプルな形式
tag: "prd-v1.2.3"
`;

      mockAPI.getFile.mockResolvedValue(originalContent);
      mockAPI.updateFile.mockResolvedValue({});

      await handler.updateHelmValues(
        projectPath,
        filePath,
        branch,
        tagName,
        service,
      );

      expect(mockStateManager.log).toHaveBeenCalledWith(
        service,
        "[INFO] フォールバックパターンでtag更新",
      );
      expect(mockAPI.updateFile).toHaveBeenCalledWith(
        projectPath,
        filePath,
        branch,
        expectedContent,
        `chore: update ${service} to prd-${tagName}`,
      );
    });

    it("形式2: tagがクォートなしのフォールバック", async () => {
      const originalContent = `
tag: v0.0.1
`;

      mockAPI.getFile.mockResolvedValue(originalContent);
      mockAPI.updateFile.mockResolvedValue({});

      await handler.updateHelmValues(
        projectPath,
        filePath,
        branch,
        tagName,
        service,
      );

      const updateCall = mockAPI.updateFile.mock.calls[0];
      expect(updateCall[3]).toContain("tag: prd-v1.2.3");
      expect(mockStateManager.log).toHaveBeenCalledWith(
        service,
        "[INFO] フォールバックパターンでtag更新",
      );
    });

    it("tagが見つからない場合はエラーをスロー", async () => {
      const originalContent = `
image:
  repository: example.com/app
  pullPolicy: IfNotPresent
# tag フィールドがない
`;

      mockAPI.getFile.mockResolvedValue(originalContent);

      await expect(
        handler.updateHelmValues(
          projectPath,
          filePath,
          branch,
          tagName,
          service,
        ),
      ).rejects.toThrow(
        `values.yamlのtag形式が見つかりません（${filePath}）。手動でtag値を更新してください。`,
      );

      expect(mockAPI.updateFile).not.toHaveBeenCalled();
    });

    it("複雑なYAML構造でも最初のimage直下のtagを更新", async () => {
      const originalContent = `
global:
  image:
    tag: global-tag
image:
  repository: example.com/app
  tag: "v0.0.1"
sidecar:
  image:
    tag: sidecar-tag
`;

      mockAPI.getFile.mockResolvedValue(originalContent);
      mockAPI.updateFile.mockResolvedValue({});

      await handler.updateHelmValues(
        projectPath,
        filePath,
        branch,
        tagName,
        service,
      );

      const updateCall = mockAPI.updateFile.mock.calls[0];
      const updatedContent = updateCall[3];

      // 正規表現は最初に見つかったimage:のtagを更新する（この場合はglobal.image.tag）
      expect(updatedContent).toContain("tag: prd-v1.2.3");
      // 他のtagは変更されない
      expect(updatedContent).toContain('tag: "v0.0.1"');
      expect(updatedContent).toContain("tag: sidecar-tag");
    });

    it("getFileが失敗した場合はエラーを伝播", async () => {
      const error = new Error("ファイル取得エラー");
      mockAPI.getFile.mockRejectedValue(error);

      await expect(
        handler.updateHelmValues(
          projectPath,
          filePath,
          branch,
          tagName,
          service,
        ),
      ).rejects.toThrow("ファイル取得エラー");

      expect(mockAPI.updateFile).not.toHaveBeenCalled();
    });

    it("updateFileが失敗した場合はエラーを伝播", async () => {
      const originalContent = `
image:
  tag: v0.0.1
`;

      const error = new Error("ファイル更新エラー");
      mockAPI.getFile.mockResolvedValue(originalContent);
      mockAPI.updateFile.mockRejectedValue(error);

      await expect(
        handler.updateHelmValues(
          projectPath,
          filePath,
          branch,
          tagName,
          service,
        ),
      ).rejects.toThrow("ファイル更新エラー");
    });
  });
});
