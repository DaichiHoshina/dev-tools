import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LogViewer } from "../log-viewer";

describe("LogViewer", () => {
  let logViewer: LogViewer;

  beforeEach(() => {
    // DOM環境をクリア
    document.body.innerHTML = "";
    logViewer = new LogViewer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getLogClass", () => {
    it("ERRORを含む行はlog-errorを返す", () => {
      expect(logViewer.getLogClass("[ERROR] something failed")).toBe(
        "log-error",
      );
    });

    it("[FAILを含む行はlog-errorを返す", () => {
      expect(logViewer.getLogClass("[FAIL] test failed")).toBe("log-error");
    });

    it("WARNINGを含む行はlog-warningを返す", () => {
      expect(logViewer.getLogClass("WARNING: deprecated method")).toBe(
        "log-warning",
      );
    });

    it("[WARNを含む行はlog-warningを返す", () => {
      expect(logViewer.getLogClass("[WARN] potential issue")).toBe(
        "log-warning",
      );
    });

    it("SUCCESSを含む行はlog-successを返す", () => {
      expect(logViewer.getLogClass("SUCCESS: operation completed")).toBe(
        "log-success",
      );
    });

    it("[OK]を含む行はlog-successを返す", () => {
      expect(logViewer.getLogClass("[OK] all tests passed")).toBe(
        "log-success",
      );
    });

    it("それ以外の行はlog-infoを返す", () => {
      expect(logViewer.getLogClass("regular log message")).toBe("log-info");
    });

    it("大文字小文字を区別しない", () => {
      expect(logViewer.getLogClass("error: failed")).toBe("log-error");
      expect(logViewer.getLogClass("Warning: be careful")).toBe("log-warning");
      expect(logViewer.getLogClass("success: done")).toBe("log-success");
    });
  });

  describe("linkifyUrls", () => {
    it("URLを含まないテキストはテキストノードのみ追加", () => {
      const parent = document.createElement("div");
      logViewer.linkifyUrls(parent, "plain text without url");

      expect(parent.childNodes.length).toBe(1);
      expect(parent.textContent).toBe("plain text without url");
      expect(parent.querySelector("a")).toBeNull();
    });

    it("URLを含むテキストはaタグに変換される", () => {
      const parent = document.createElement("div");
      logViewer.linkifyUrls(parent, "Check https://example.com for details");

      const link = parent.querySelector("a");
      expect(link).not.toBeNull();
      expect(link?.href).toBe("https://example.com/");
      expect(link?.target).toBe("_blank");
      expect(link?.rel).toBe("noopener noreferrer");
      expect(link?.className).toBe("log-link");
      expect(link?.textContent).toBe("https://example.com");
    });

    it("複数のURLを含むテキストをすべてリンク化", () => {
      const parent = document.createElement("div");
      logViewer.linkifyUrls(
        parent,
        "See https://example.com and http://test.org",
      );

      const links = parent.querySelectorAll("a");
      expect(links.length).toBe(2);
      expect(links[0].href).toBe("https://example.com/");
      expect(links[1].href).toBe("http://test.org/");
    });

    it("URLの前後のテキストも保持される", () => {
      const parent = document.createElement("div");
      logViewer.linkifyUrls(parent, "Before https://example.com after");

      expect(parent.textContent).toBe("Before https://example.com after");
      const link = parent.querySelector("a");
      expect(link).not.toBeNull();
    });
  });

  describe("appendLog", () => {
    beforeEach(() => {
      // モックDOM要素を作成
      const logOutput = document.createElement("div");
      logOutput.id = "log-output-test-service";
      document.body.appendChild(logOutput);

      const lineCount = document.createElement("span");
      lineCount.id = "log-line-count-test-service";
      document.body.appendChild(lineCount);
    });

    it("DOM要素が存在する場合にログ行を追加", () => {
      logViewer.appendLog("test-service", "log line 1");

      const logOutput = document.getElementById("log-output-test-service");
      expect(logOutput?.children.length).toBe(1);

      const logLine = logOutput?.firstChild as HTMLElement;
      expect(logLine.classList.contains("log-line")).toBe(true);
      expect(logLine.textContent).toBe("log line 1");
    });

    it("改行区切りで複数行を追加", () => {
      logViewer.appendLog("test-service", "line 1\nline 2\nline 3");

      const logOutput = document.getElementById("log-output-test-service");
      expect(logOutput?.children.length).toBe(3);
    });

    it("空行はスキップされる", () => {
      logViewer.appendLog("test-service", "line 1\n\nline 2");

      const logOutput = document.getElementById("log-output-test-service");
      expect(logOutput?.children.length).toBe(2);
    });

    it("ログレベルに応じたクラスが適用される", () => {
      logViewer.appendLog("test-service", "ERROR: failed");

      const logLine = document.querySelector(".log-line") as HTMLElement;
      expect(logLine.classList.contains("log-error")).toBe(true);
    });

    it("DOM要素が存在しない場合は何もしない", () => {
      expect(() => {
        logViewer.appendLog("non-existent", "log");
      }).not.toThrow();
    });
  });

  describe("updateLogLineCount", () => {
    beforeEach(() => {
      const logOutput = document.createElement("div");
      logOutput.id = "log-output-test-service";
      document.body.appendChild(logOutput);

      const lineCount = document.createElement("span");
      lineCount.id = "log-line-count-test-service";
      document.body.appendChild(lineCount);
    });

    it("行数表示が更新される", () => {
      const logOutput = document.getElementById("log-output-test-service");
      const lineCount = document.getElementById("log-line-count-test-service");

      // ログ行を追加
      logOutput?.appendChild(document.createElement("div"));
      logOutput?.appendChild(document.createElement("div"));
      logOutput?.appendChild(document.createElement("div"));

      logViewer.updateLogLineCount("test-service");

      expect(lineCount?.textContent).toBe("3行");
    });

    it("ログがない場合は0行", () => {
      const lineCount = document.getElementById("log-line-count-test-service");

      logViewer.updateLogLineCount("test-service");

      expect(lineCount?.textContent).toBe("0行");
    });

    it("DOM要素が存在しない場合は何もしない", () => {
      expect(() => {
        logViewer.updateLogLineCount("non-existent");
      }).not.toThrow();
    });
  });
});
