import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DialogManager } from "../dialog-manager";

describe("DialogManager", () => {
  let dialogManager: DialogManager;

  beforeEach(() => {
    // DOM環境を準備（<dialog>要素）
    document.body.innerHTML = `
      <dialog id="confirm-dialog" class="modal">
        <div class="modal-box">
          <h3 id="confirm-dialog-title"></h3>
          <div id="confirm-dialog-body"></div>
          <div class="modal-action">
            <button id="confirm-dialog-cancel">キャンセル</button>
            <button id="confirm-dialog-ok">OK</button>
          </div>
        </div>
      </dialog>
    `;

    // jsdomはshowModal/closeを実装していないためモック
    const dialog = document.getElementById(
      "confirm-dialog",
    ) as HTMLDialogElement;
    if (!dialog.showModal) {
      dialog.showModal = vi.fn(() => {
        dialog.setAttribute("open", "");
      });
    }
    if (!dialog.close) {
      dialog.close = vi.fn(() => {
        dialog.removeAttribute("open");
      });
    }

    dialogManager = new DialogManager();
    dialogManager.init();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("showConfirmDialog", () => {
    it("ダイアログを開く", async () => {
      const dialogPromise = dialogManager.showConfirmDialog(
        "テストタイトル",
        "テストメッセージ",
      );

      const dialog = document.getElementById(
        "confirm-dialog",
      ) as HTMLDialogElement;
      expect(dialog.showModal).toHaveBeenCalled();

      const titleEl = document.getElementById("confirm-dialog-title");
      expect(titleEl?.textContent).toBe("テストタイトル");

      const bodyEl = document.getElementById("confirm-dialog-body");
      expect(bodyEl?.textContent).toBe("テストメッセージ");

      // ダイアログを閉じる
      dialogManager.closeConfirmDialog(true);
      const result = await dialogPromise;
      expect(result).toBe(true);
    });

    it("改行を含むメッセージを正しく表示する", async () => {
      const dialogPromise = dialogManager.showConfirmDialog(
        "タイトル",
        "行1\n行2\n行3",
      );

      const bodyEl = document.getElementById("confirm-dialog-body");
      expect(bodyEl?.childNodes.length).toBe(5); // 3行 + 2つのbr
      expect(bodyEl?.textContent).toBe("行1行2行3");

      dialogManager.closeConfirmDialog(false);
      await dialogPromise;
    });

    it("XSSが防止される", async () => {
      const dialogPromise = dialogManager.showConfirmDialog(
        "<script>alert('xss')</script>",
        "<img src=x onerror=alert('xss')>",
      );

      const titleEl = document.getElementById("confirm-dialog-title");
      expect(titleEl?.textContent).toBe("<script>alert('xss')</script>");
      expect(titleEl?.innerHTML).not.toContain("<script>");

      const bodyEl = document.getElementById("confirm-dialog-body");
      expect(bodyEl?.innerHTML).not.toContain("<img");

      dialogManager.closeConfirmDialog(false);
      await dialogPromise;
    });
  });

  describe("closeConfirmDialog", () => {
    it("OKでtrueを返す", async () => {
      const dialogPromise = dialogManager.showConfirmDialog(
        "タイトル",
        "メッセージ",
      );
      dialogManager.closeConfirmDialog(true);

      const result = await dialogPromise;
      expect(result).toBe(true);

      const dialog = document.getElementById(
        "confirm-dialog",
      ) as HTMLDialogElement;
      expect(dialog.close).toHaveBeenCalled();
    });

    it("キャンセルでfalseを返す", async () => {
      const dialogPromise = dialogManager.showConfirmDialog(
        "タイトル",
        "メッセージ",
      );
      dialogManager.closeConfirmDialog(false);

      const result = await dialogPromise;
      expect(result).toBe(false);
    });
  });

  describe("init", () => {
    it("キャンセルボタンでダイアログを閉じる", async () => {
      const dialogPromise = dialogManager.showConfirmDialog(
        "タイトル",
        "メッセージ",
      );

      const cancelBtn = document.getElementById(
        "confirm-dialog-cancel",
      ) as HTMLButtonElement;
      cancelBtn.click();

      const result = await dialogPromise;
      expect(result).toBe(false);
    });

    it("OKボタンでダイアログを閉じる", async () => {
      const dialogPromise = dialogManager.showConfirmDialog(
        "タイトル",
        "メッセージ",
      );

      const okBtn = document.getElementById(
        "confirm-dialog-ok",
      ) as HTMLButtonElement;
      okBtn.click();

      const result = await dialogPromise;
      expect(result).toBe(true);
    });

    it("オーバーレイクリックでダイアログを閉じる", async () => {
      const dialogPromise = dialogManager.showConfirmDialog(
        "タイトル",
        "メッセージ",
      );

      const dialog = document.getElementById(
        "confirm-dialog",
      ) as HTMLDialogElement;
      dialog.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      const result = await dialogPromise;
      expect(result).toBe(false);
    });

    it("cancelイベントでダイアログを閉じる", async () => {
      const dialogPromise = dialogManager.showConfirmDialog(
        "タイトル",
        "メッセージ",
      );

      const dialog = document.getElementById(
        "confirm-dialog",
      ) as HTMLDialogElement;
      dialog.dispatchEvent(new Event("cancel"));

      const result = await dialogPromise;
      expect(result).toBe(false);
    });
  });
});
