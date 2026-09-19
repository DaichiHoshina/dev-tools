import { describe, it, expect, vi, afterEach } from "vitest";
import { formatRelativeTime } from "./format";

describe("formatRelativeTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("空文字なら空文字を返す", () => {
    expect(formatRelativeTime("")).toBe("");
  });

  it("1分未満なら「たった今」", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T12:00:30Z"));
    expect(formatRelativeTime("2025-01-01T12:00:00Z")).toBe("たった今");
  });

  it("5分前", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T12:05:00Z"));
    expect(formatRelativeTime("2025-01-01T12:00:00Z")).toBe("5分前");
  });

  it("59分前", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T12:59:00Z"));
    expect(formatRelativeTime("2025-01-01T12:00:00Z")).toBe("59分前");
  });

  it("1時間前", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T13:00:00Z"));
    expect(formatRelativeTime("2025-01-01T12:00:00Z")).toBe("1時間前");
  });

  it("23時間前", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-02T11:00:00Z"));
    expect(formatRelativeTime("2025-01-01T12:00:00Z")).toBe("23時間前");
  });

  it("1日前", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-02T12:00:00Z"));
    expect(formatRelativeTime("2025-01-01T12:00:00Z")).toBe("1日前");
  });

  it("不正な文字列はそのまま返す", () => {
    expect(formatRelativeTime("invalid-date")).toBe("invalid-date");
  });
});
