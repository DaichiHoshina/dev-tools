import { describe, it, expect } from "vitest";
import { isHiddenContainer } from "./k8s-filters";

describe("isHiddenContainer", () => {
  it("istio-proxy は非表示", () => {
    expect(isHiddenContainer("istio-proxy")).toBe(true);
  });

  it("istio-init は非表示", () => {
    expect(isHiddenContainer("istio-init")).toBe(true);
  });

  it("otel プレフィックスは非表示", () => {
    expect(isHiddenContainer("otel-collector")).toBe(true);
  });

  it("otc- プレフィックスは非表示", () => {
    expect(isHiddenContainer("otc-agent")).toBe(true);
  });

  it("opentelemetry プレフィックスは非表示", () => {
    expect(isHiddenContainer("opentelemetry-collector")).toBe(true);
  });

  it("アプリコンテナは表示", () => {
    expect(isHiddenContainer("api-server")).toBe(false);
  });

  it("nginx は表示", () => {
    expect(isHiddenContainer("nginx")).toBe(false);
  });

  it("istio を含むがexactでないものは表示", () => {
    expect(isHiddenContainer("my-istio-app")).toBe(false);
  });
});
