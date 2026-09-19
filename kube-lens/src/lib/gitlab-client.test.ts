import { describe, it, expect, vi, afterEach } from "vitest";
import {
  calculateDefaultMinorVersion,
  extractImageTag,
  isValidJobStatus,
  parseMRUrl,
  isMRUrl,
  extractTicketFromTitle,
} from "./gitlab-client";

describe("calculateDefaultMinorVersion", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("基準日より前はベースバージョン（マイナスにならない）", () => {
    vi.useFakeTimers();
    // 環境変数未設定時は基準日 2026-01-01, baseMinor 0
    vi.setSystemTime(new Date("2025-12-01T00:00:00+00:00"));
    expect(calculateDefaultMinorVersion()).toBe(0);
  });

  it("基準日から1週間後は1増える", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-08T00:00:00+00:00"));
    expect(calculateDefaultMinorVersion()).toBe(1);
  });

  it("基準日から3週間後は3増える", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-22T00:00:00+00:00"));
    expect(calculateDefaultMinorVersion()).toBe(3);
  });

  it("6日23時間後はまだ0週（1週間未満）", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-07T23:00:00+00:00"));
    expect(calculateDefaultMinorVersion()).toBe(0);
  });
});

// ─── extractImageTag ──────────────────────────────────────────────────────────

describe("extractImageTag", () => {
  it("'  tag: v1.2.3' → 'v1.2.3'", () => {
    expect(extractImageTag("  tag: v1.2.3")).toBe("v1.2.3");
  });

  it("'  tag: \"v1.2.3\"' → 'v1.2.3'（ダブルクォート除去）", () => {
    expect(extractImageTag('  tag: "v1.2.3"')).toBe("v1.2.3");
  });

  it("'  imageTag: latest' → 'latest'", () => {
    expect(extractImageTag("  imageTag: latest")).toBe("latest");
  });

  it("'  imageTag: \\'main\\'' → 'main'（シングルクォート除去）", () => {
    expect(extractImageTag("  imageTag: 'main'")).toBe("main");
  });

  it("'no tag here' → '-'", () => {
    expect(extractImageTag("no tag here")).toBe("-");
  });
});

// ─── parseMRUrl ───────────────────────────────────────────────────────────────

describe("parseMRUrl", () => {
  it("正しいMR URL → { projectPath, mrIid }", () => {
    const url = "https://gitlab.example.com/my-org/my-repo/-/merge_requests/42";
    expect(parseMRUrl(url)).toEqual({
      projectPath: "my-org/my-repo",
      mrIid: 42,
    });
  });

  it("GitHubのURL → null", () => {
    const url = "https://github.com/owner/repo/pull/1";
    expect(parseMRUrl(url)).toBeNull();
  });

  it("無効なURL → null", () => {
    expect(parseMRUrl("not-a-url")).toBeNull();
  });
});

// ─── extractTicketFromTitle ───────────────────────────────────────────────────

describe("extractTicketFromTitle", () => {
  it("'PROJ-123: Fix bug' → 'PROJ-123'", () => {
    expect(extractTicketFromTitle("PROJ-123: Fix bug")).toBe("PROJ-123");
  });

  it("'No ticket' → ''", () => {
    expect(extractTicketFromTitle("No ticket")).toBe("");
  });
});

// ─── isMRUrl ─────────────────────────────────────────────────────────────────

describe("isMRUrl", () => {
  it("正しいMR URL → true", () => {
    const url = "https://gitlab.example.com/my-org/my-repo/-/merge_requests/1";
    expect(isMRUrl(url)).toBe(true);
  });

  it("merge_requests を含まないGitLab URL → false", () => {
    expect(isMRUrl("https://gitlab.example.com/my-org/my-repo")).toBe(false);
  });

  it("GitHubのURL → false", () => {
    expect(isMRUrl("https://github.com/owner/repo/pull/1")).toBe(false);
  });
});

// ─── isValidJobStatus ─────────────────────────────────────────────────────────

describe("isValidJobStatus", () => {
  it("'success' → true", () => {
    expect(isValidJobStatus("success")).toBe(true);
  });

  it("'failed' → true", () => {
    expect(isValidJobStatus("failed")).toBe(true);
  });

  it("'pending' → true", () => {
    expect(isValidJobStatus("pending")).toBe(true);
  });

  it("'running' → true", () => {
    expect(isValidJobStatus("running")).toBe(true);
  });

  it("'unknown' → false", () => {
    expect(isValidJobStatus("unknown")).toBe(false);
  });

  it("'' → false", () => {
    expect(isValidJobStatus("")).toBe(false);
  });
});
