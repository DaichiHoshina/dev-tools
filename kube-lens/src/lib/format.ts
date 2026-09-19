export function formatRelativeTime(timestamp: string): string {
  if (!timestamp) return "";
  try {
    const time = new Date(timestamp).getTime();
    if (Number.isNaN(time)) return timestamp;
    const diff = Date.now() - time;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "たった今";
    if (minutes < 60) return `${minutes}分前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}時間前`;
    return `${Math.floor(hours / 24)}日前`;
  } catch {
    return timestamp;
  }
}
