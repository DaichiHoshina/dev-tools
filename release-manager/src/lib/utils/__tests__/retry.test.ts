import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { retryWithBackoff, isRetryableError } from "../retry";

describe("retryWithBackoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("成功時は即座に値を返す", async () => {
    const fn = vi.fn().mockResolvedValue("success");

    const promise = retryWithBackoff(fn);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("リトライ可能エラー（TypeError）でリトライされ最終的に成功", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Network error"))
      .mockRejectedValueOnce(new TypeError("Network error"))
      .mockResolvedValue("success");

    const onRetry = vi.fn();

    const promise = retryWithBackoff(fn, { onRetry });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, expect.any(TypeError), 1);
    expect(onRetry).toHaveBeenNthCalledWith(2, expect.any(TypeError), 2);
  });

  it("HTTP 5xxエラーメッセージでリトライされ最終的に成功", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("500 Internal Server Error"))
      .mockResolvedValue("success");

    const promise = retryWithBackoff(fn);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("4xxエラー（404）はリトライせず即座にthrow", async () => {
    const error = new Error("404 Not Found");
    const fn = vi.fn().mockRejectedValue(error);

    const promise = retryWithBackoff(fn);
    const expectPromise = expect(promise).rejects.toThrow("404 Not Found");
    await vi.runAllTimersAsync();
    await expectPromise;

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("4xxエラー（401）はリトライせず即座にthrow", async () => {
    const error = new Error("401 Unauthorized");
    const fn = vi.fn().mockRejectedValue(error);

    const promise = retryWithBackoff(fn);
    const expectPromise = expect(promise).rejects.toThrow("401 Unauthorized");
    await vi.runAllTimersAsync();
    await expectPromise;

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("maxRetries回超過でthrow", async () => {
    const error = new TypeError("Network error");
    const fn = vi.fn().mockRejectedValue(error);

    const promise = retryWithBackoff(fn, { maxRetries: 2 });
    const expectPromise = expect(promise).rejects.toThrow("Network error");
    await vi.runAllTimersAsync();
    await expectPromise;

    expect(fn).toHaveBeenCalledTimes(3); // 初回 + 2回リトライ = 3回
  });

  it("onRetryコールバックが正しい引数で呼ばれる", async () => {
    const error = new TypeError("Network error");
    const fn = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValue("success");

    const onRetry = vi.fn();

    const promise = retryWithBackoff(fn, { onRetry });
    await vi.runAllTimersAsync();
    await promise;

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, error, 1);
    expect(onRetry).toHaveBeenNthCalledWith(2, error, 2);
  });
});

describe("isRetryableError", () => {
  it("TypeError → true", () => {
    expect(isRetryableError(new TypeError("Network error"))).toBe(true);
  });

  it("AbortError → true", () => {
    const abortError = new DOMException("Aborted", "AbortError");
    expect(isRetryableError(abortError)).toBe(true);
  });

  it("500 Internal Server Error → true", () => {
    expect(isRetryableError(new Error("500 Internal Server Error"))).toBe(true);
  });

  it("503 Service Unavailable → true", () => {
    expect(isRetryableError(new Error("503 Service Unavailable"))).toBe(true);
  });

  it("405 Method Not Allowed → true（GitLab MR差分計算中の一時エラー）", () => {
    expect(isRetryableError(new Error("405 Method Not Allowed"))).toBe(true);
  });

  it("404 Not Found → false", () => {
    expect(isRetryableError(new Error("404 Not Found"))).toBe(false);
  });

  it("401 Unauthorized → false", () => {
    expect(isRetryableError(new Error("401 Unauthorized"))).toBe(false);
  });

  it("Failed to fetch → true", () => {
    expect(isRetryableError(new Error("Failed to fetch"))).toBe(true);
  });

  it("NetworkError → true", () => {
    expect(
      isRetryableError(new Error("NetworkError when attempting to fetch")),
    ).toBe(true);
  });

  it("その他のエラー → false", () => {
    expect(isRetryableError(new Error("Some other error"))).toBe(false);
  });
});
