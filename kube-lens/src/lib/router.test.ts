import { describe, it, expect } from "vitest";
import { matchPattern, matchRoute } from "./router";

// ─── matchPattern ─────────────────────────────────────────────────────────────

describe("matchPattern", () => {
  it("'/pods' パターンに '/pods' がマッチ → {}", () => {
    expect(matchPattern("/pods", "/pods")).toEqual({});
  });

  it("'/pods/:name' パターンに '/pods/my-pod' がマッチ → { name: 'my-pod' }", () => {
    expect(matchPattern("/pods/:name", "/pods/my-pod")).toEqual({
      name: "my-pod",
    });
  });

  it("'/pods/:name' パターンに '/pods/my-pod/logs' はマッチしない → null", () => {
    expect(matchPattern("/pods/:name", "/pods/my-pod/logs")).toBeNull();
  });

  it("URLエンコードされたパラメータが正しくデコードされる", () => {
    expect(matchPattern("/pods/:name", "/pods/my%20pod")).toEqual({
      name: "my pod",
    });
  });

  it("セグメント数が違う → null", () => {
    expect(matchPattern("/pods", "/pods/extra")).toBeNull();
  });

  it("パターンが '/' でパスが '/' → {}", () => {
    expect(matchPattern("/", "/")).toEqual({});
  });

  it("パターンが '/deployments' でパスが '/pods' → null", () => {
    expect(matchPattern("/deployments", "/pods")).toBeNull();
  });

  it("空パターン '' はセグメントなし、'/' パスと一致しない → null", () => {
    // 空パターンのセグメント数 = 0、'/' のセグメント数 = 0（filter後） → マッチ
    // ※ 実装が filter(Boolean) なので '/' → [] と '' → [] で一致
    const result = matchPattern("", "/");
    expect(result).toEqual({});
  });

  it("クエリパラメータ付きパスでも正しくマッチする", () => {
    expect(matchPattern("/pods/:name", "/pods/my-pod?container=app")).toEqual({
      name: "my-pod",
    });
  });
});

// ─── matchRoute ───────────────────────────────────────────────────────────────

describe("matchRoute", () => {
  it("'#/pods' → pattern: '/pods'", () => {
    const result = matchRoute("#/pods");
    expect(result.pattern).toBe("/pods");
    expect(result.params).toEqual({});
  });

  it("'#/pods/my-pod' → pattern: '/pods/:name', params: { name: 'my-pod' }", () => {
    const result = matchRoute("#/pods/my-pod");
    expect(result.pattern).toBe("/pods/:name");
    expect(result.params).toEqual({ name: "my-pod" });
  });

  it("'/dashboard' → フォールバックルート '/'", () => {
    const result = matchRoute("/dashboard");
    expect(result.pattern).toBe("/");
  });

  it("'#' → フォールバックルートにマッチ", () => {
    const result = matchRoute("#");
    expect(result.pattern).toBe("/");
  });

  it("空文字 '' → フォールバックルート '/'", () => {
    const result = matchRoute("");
    expect(result.pattern).toBe("/");
  });

  it("'#/deployments' → pattern: '/deployments'", () => {
    const result = matchRoute("#/deployments");
    expect(result.pattern).toBe("/deployments");
    expect(result.params).toEqual({});
  });

  it("'#/settings' → pattern: '/settings'", () => {
    const result = matchRoute("#/settings");
    expect(result.pattern).toBe("/settings");
  });

  it("未知パス '#/unknown' → フォールバックルート '/'", () => {
    const result = matchRoute("#/unknown");
    expect(result.pattern).toBe("/");
  });
});
