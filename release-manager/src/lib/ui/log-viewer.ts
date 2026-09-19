import { CONFIG } from "../config";

/**
 * ログ表示管理クラス
 * 責務: デプロイログの表示、URLリンク化、行数管理
 */
export class LogViewer {
  /**
   * ログ行を追加
   * @param service サービス名
   * @param log ログテキスト（改行区切り可）
   */
  appendLog(service: string, log: string, idPrefix: string = ""): void {
    const logOutput = document.getElementById(`${idPrefix}log-output-${service}`);
    if (!logOutput) return;

    const lines = log.split("\n");
    lines.forEach((line) => {
      if (!line.trim()) return;
      const div = document.createElement("div");
      div.className = `log-line ${this.getLogClass(line)}`;
      this.linkifyUrls(div, line);
      logOutput.appendChild(div);
    });

    if (CONFIG.UI.AUTO_SCROLL) {
      logOutput.scrollTop = logOutput.scrollHeight;
    }

    while (logOutput.children.length > CONFIG.UI.MAX_LOG_LINES) {
      logOutput.removeChild(logOutput.firstChild!);
    }

    this.updateLogLineCount(service, idPrefix);
  }

  /**
   * ログ行数表示を更新
   * @param service サービス名
   */
  updateLogLineCount(service: string, idPrefix: string = ""): void {
    const lineCountEl = document.getElementById(`${idPrefix}log-line-count-${service}`);
    const logOutput = document.getElementById(`${idPrefix}log-output-${service}`);
    if (lineCountEl && logOutput) {
      const count = logOutput.children.length;
      lineCountEl.textContent = `${count}行`;
    }
  }

  /**
   * ログレベルに応じたCSSクラスを返す
   * @param line ログ行
   * @returns CSSクラス名
   */
  getLogClass(line: string): string {
    const upper = line.toUpperCase();
    if (upper.includes("ERROR") || upper.includes("[FAIL")) return "log-error";
    if (upper.includes("WARNING") || upper.includes("[WARN"))
      return "log-warning";
    if (upper.includes("SUCCESS") || upper.includes("[OK]"))
      return "log-success";
    return "log-info";
  }

  /**
   * テキスト内のURLをリンク化
   * @param parent 親要素
   * @param text テキスト
   */
  linkifyUrls(parent: HTMLElement, text: string): void {
    const urlRegex = /(https?:\/\/[^\s<>"]+)/g;
    let lastIndex = 0;
    let match;

    while ((match = urlRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parent.appendChild(
          document.createTextNode(text.slice(lastIndex, match.index)),
        );
      }
      const link = document.createElement("a");
      link.href = match[1];
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "log-link";
      link.textContent = match[1];
      parent.appendChild(link);
      lastIndex = urlRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }
}
