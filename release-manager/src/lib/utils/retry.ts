export interface RetryOptions {
  maxRetries?: number; // デフォルト: 3
  baseDelay?: number; // デフォルト: 2000ms
  maxDelay?: number; // デフォルト: 30000ms
  onRetry?: (error: Error, attempt: number) => void;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 2000,
    maxDelay = 30000,
    onRetry,
  } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries || !isRetryableError(error)) {
        throw error;
      }
      const delay = Math.min(
        baseDelay * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5),
        maxDelay,
      );
      onRetry?.(error as Error, attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Unreachable");
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error) {
    const msg = error.message;
    if (/\b5\d{2}\b/.test(msg)) return true;
    if (msg.includes("405")) return true; // GitLab MR差分計算中の一時的なマージ不可
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError"))
      return true;
  }
  return false;
}
