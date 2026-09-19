/**
 * 確認ダイアログ管理クラス
 * DeployUIから抽出された責務
 */
export class DialogManager {
  private confirmResolve: ((value: boolean) => void) | null = null;

  /**
   * ダイアログの初期化（イベントリスナー設定）
   */
  init(): void {
    const dialog = document.getElementById(
      "confirm-dialog",
    ) as HTMLDialogElement | null;
    const cancelBtn = document.getElementById("confirm-dialog-cancel");
    const okBtn = document.getElementById("confirm-dialog-ok");

    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        this.closeConfirmDialog(false);
      });
    }

    if (okBtn) {
      okBtn.addEventListener("click", () => {
        this.closeConfirmDialog(true);
      });
    }

    if (dialog) {
      dialog.addEventListener("click", (e) => {
        if (e.target === dialog) {
          this.closeConfirmDialog(false);
        }
      });
    }

    // Escapeキー対応 (WCAG 2.2 AA)
    // <dialog>はEscapeで自動的に閉じるが、resolveを呼ぶ必要がある
    if (dialog) {
      dialog.addEventListener("cancel", (e) => {
        e.preventDefault();
        this.closeConfirmDialog(false);
      });
    }
  }

  /**
   * 確認ダイアログを表示
   */
  showConfirmDialog(
    title: string,
    message: string,
    options?: { html?: boolean },
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const dialog = document.getElementById(
        "confirm-dialog",
      ) as HTMLDialogElement | null;
      if (!dialog) {
        console.warn("confirm-dialog element not found");
        resolve(false);
        return;
      }

      this.confirmResolve = resolve;

      const titleEl = document.getElementById("confirm-dialog-title");
      const bodyEl = document.getElementById("confirm-dialog-body");

      if (titleEl) titleEl.textContent = title;
      if (bodyEl) {
        if (options?.html) {
          bodyEl.innerHTML = message;
        } else {
          // XSS対策: textContentで設定後、改行をbrに変換
          bodyEl.textContent = "";
          message.split("\n").forEach((line, i, arr) => {
            bodyEl.appendChild(document.createTextNode(line));
            if (i < arr.length - 1)
              bodyEl.appendChild(document.createElement("br"));
          });
        }
      }
      dialog.showModal();
    });
  }

  /**
   * 確認ダイアログを閉じる
   */
  closeConfirmDialog(result: boolean): void {
    const dialog = document.getElementById(
      "confirm-dialog",
    ) as HTMLDialogElement | null;
    if (dialog) dialog.close();

    if (this.confirmResolve) {
      this.confirmResolve(result);
      this.confirmResolve = null;
    }
  }
}
