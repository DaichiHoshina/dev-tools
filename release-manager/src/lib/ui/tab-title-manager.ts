/**
 * タブタイトル管理
 * デプロイ/MR作成中の進捗をブラウザタブに表示
 */
export class TabTitleManager {
  private readonly defaultTitle: string;
  private activeItems = new Map<string, { step: number; total: number }>();

  constructor() {
    this.defaultTitle = document.title;
  }

  update(service: string, step: number, total: number): void {
    this.activeItems.set(service, { step, total });
    this.refresh();
  }

  setComplete(service: string): void {
    this.activeItems.delete(service);
    document.title =
      this.activeItems.size > 0
        ? this.formatActive()
        : `[OK] ${service} - ${this.defaultTitle}`;
  }

  setFailed(service: string): void {
    this.activeItems.delete(service);
    document.title =
      this.activeItems.size > 0
        ? this.formatActive()
        : `[FAIL] ${service} - ${this.defaultTitle}`;
  }

  reset(): void {
    this.activeItems.clear();
    document.title = this.defaultTitle;
  }

  private refresh(): void {
    if (this.activeItems.size === 0) {
      document.title = this.defaultTitle;
      return;
    }
    document.title = this.formatActive();
  }

  private formatActive(): string {
    if (this.activeItems.size === 1) {
      const [service, { step, total }] = [...this.activeItems.entries()][0];
      return `[${step}/${total}] ${service} - ${this.defaultTitle}`;
    }
    // 複数サービスの場合は最小進捗を表示
    const entries = [...this.activeItems.values()];
    const minStep = Math.min(...entries.map((e) => e.step));
    const total = entries[0].total;
    return `[${minStep}/${total}] ${this.activeItems.size}件 - ${this.defaultTitle}`;
  }
}
