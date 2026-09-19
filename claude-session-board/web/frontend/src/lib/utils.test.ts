import { describe, it, expect } from "vitest";
import { extractText, formatDate, truncate } from "./utils";

describe("extractText", () => {
  it("文字列はそのまま返す", () => {
    expect(extractText("hello")).toBe("hello");
  });
  it("undefinedは空文字を返す", () => {
    expect(extractText(undefined)).toBe("");
  });
  it("ContentBlock配列からtextブロックを結合", () => {
    expect(
      extractText([
        { type: "text", text: "foo" },
        { type: "tool_use", name: "bash" },
        { type: "text", text: "bar" },
      ]),
    ).toBe("foo\nbar");
  });
});

describe("truncate", () => {
  it("maxLen以下はそのまま", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });
  it("超過は...で切り詰め", () => {
    expect(truncate("hello world", 5)).toBe("hello...");
  });
});

describe("formatDate", () => {
  it("空文字はハイフンを返す", () => {
    expect(formatDate("")).toBe("-");
  });
  it("ISO文字列を日本語日付フォーマットに変換", () => {
    const result = formatDate("2024-01-15T10:00:00Z");
    expect(result).toMatch(/2024/);
  });
});
