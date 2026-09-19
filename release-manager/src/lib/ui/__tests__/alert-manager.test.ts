import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AlertManager } from "../alert-manager";

describe("AlertManager", () => {
  let alertManager: AlertManager;

  beforeEach(() => {
    // DOM環境をクリア
    document.body.innerHTML = "";
    alertManager = new AlertManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("showAlert", () => {
    it("トーストコンテナを作成する", () => {
      alertManager.showAlert("テストメッセージ", "info");

      const container = document.getElementById("toast-container");
      expect(container).not.toBeNull();
      expect(container?.className).toBe("toast toast-end");
    });

    it("トーストを表示する", () => {
      alertManager.showAlert("テストメッセージ", "success");

      const alert = document.querySelector(".alert");
      expect(alert).not.toBeNull();
      expect(alert?.classList.contains("alert-success")).toBe(true);
    });

    it("メッセージがXSSエスケープされる", () => {
      alertManager.showAlert("<script>alert('xss')</script>", "info");

      const messageEl = document.querySelector(".alert span");
      expect(messageEl?.textContent).toBe("<script>alert('xss')</script>");
      expect(messageEl?.innerHTML).not.toContain("<script>");
    });

    it("タイプに応じたアイコンを表示する", () => {
      const testCases = [
        { type: "success", icon: "fa-check-circle" },
        { type: "danger", icon: "fa-exclamation-circle" },
        { type: "warning", icon: "fa-exclamation-triangle" },
        { type: "info", icon: "fa-info-circle" },
      ];

      testCases.forEach(({ type, icon }) => {
        document.body.innerHTML = "";
        alertManager.showAlert("テスト", type);

        const iconEl = document.querySelector(".alert i");
        expect(iconEl?.classList.contains(icon)).toBe(true);
      });
    });

    it("閉じるボタンでトーストを削除する", () => {
      alertManager.showAlert("テストメッセージ", "info");

      const closeBtn = document.querySelector(
        ".btn-ghost",
      ) as HTMLButtonElement;
      expect(closeBtn).not.toBeNull();

      closeBtn.click();

      const alert = document.querySelector(".alert");
      expect(alert).toBeNull();
    });
  });

  describe("showError", () => {
    it("エラーメッセージをdangerタイプで表示する", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      alertManager.showError("test-service", new Error("テストエラー"));

      const alert = document.querySelector(".alert-error");
      expect(alert).not.toBeNull();

      const messageEl = document.querySelector(".alert span");
      expect(messageEl?.textContent).toContain("test-service");
      expect(messageEl?.textContent).toContain("テストエラー");

      expect(consoleSpy).toHaveBeenCalled();
    });

    it("サービス名がない場合はプレフィックスなし", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});

      alertManager.showError("", new Error("テストエラー"));

      const messageEl = document.querySelector(".alert span");
      expect(messageEl?.textContent).toBe("エラー: テストエラー");
    });
  });
});
