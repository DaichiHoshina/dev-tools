/**
 * アラート（トースト通知）管理クラス
 * DeployUIから抽出された責務
 */
export class AlertManager {
  private iconMap: Record<string, string> = {
    success: "fa-check-circle",
    danger: "fa-exclamation-circle",
    warning: "fa-exclamation-triangle",
    info: "fa-info-circle",
  };

  /**
   * トースト通知を表示
   */
  showAlert(message: string, type: string = "info"): void {
    const toastContainer = this.getOrCreateToastContainer();
    const toast = this.createToastElement(message, type);

    toastContainer.appendChild(toast);

    // アニメーション: スライドイン
    requestAnimationFrame(() => {
      toast.classList.add("toast-show");
    });

    // 5秒後に自動削除
    setTimeout(() => {
      toast.classList.remove("toast-show");
      toast.classList.add("toast-hide");
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  /**
   * エラーメッセージを表示
   */
  showError(service: string, error: Error): void {
    const prefix = service ? `[${service}] ` : "";
    this.showAlert(`${prefix}エラー: ${error.message}`, "danger");
    console.error(error);
  }

  /**
   * トーストコンテナを取得または作成
   */
  private getOrCreateToastContainer(): HTMLElement {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.className = "toast toast-end";
      document.body.appendChild(container);
    }
    return container;
  }

  /**
   * トースト要素を作成
   */
  private createToastElement(message: string, type: string): HTMLElement {
    const toast = document.createElement("div");
    // DaisyUI alert + 型マッピング
    const alertType = type === "danger" ? "error" : type;
    toast.className = `alert alert-${alertType} text-sm shadow-sm`;

    // アイコン
    const icon = document.createElement("i");
    icon.className = `fas ${this.iconMap[type] || this.iconMap.info}`;

    // メッセージ
    const messageSpan = document.createElement("span");
    messageSpan.textContent = message; // XSS対策: textContentを使用

    // 閉じるボタン
    const closeBtn = document.createElement("button");
    closeBtn.className = "btn btn-ghost btn-sm";
    closeBtn.addEventListener("click", () => toast.remove());
    closeBtn.textContent = "×";

    toast.appendChild(icon);
    toast.appendChild(messageSpan);
    toast.appendChild(closeBtn);

    return toast;
  }
}
