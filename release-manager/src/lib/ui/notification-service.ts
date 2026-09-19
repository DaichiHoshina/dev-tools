/**
 * デスクトップ通知サービス
 * タブがバックグラウンドの場合のみ通知を表示
 */
export class NotificationService {
  private permissionRequested = false;

  requestPermission(): void {
    if (this.permissionRequested) return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
    this.permissionRequested = true;
  }

  notify(title: string, body: string): void {
    if (document.hasFocus()) return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    new Notification(title, {
      body,
      icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%236366f1'/%3E%3Cpath d='M16 7l7 7-2 2-5-5-5 5-2-2z' fill='%23fff'/%3E%3C/svg%3E",
    });
  }
}
