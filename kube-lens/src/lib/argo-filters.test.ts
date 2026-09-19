import { describe, it, expect } from "vitest";
import { isHiddenApp } from "./argo-filters";

describe("isHiddenApp", () => {
  it("fluentbit を含む名前は非表示", () => {
    expect(isHiddenApp("myapp-staging-fluentbit-cloudwatch")).toBe(true);
  });

  it("istio を含む名前は非表示", () => {
    expect(isHiddenApp("myapp-production-istio-base")).toBe(true);
  });

  it("istio-ingressgateway は非表示", () => {
    expect(isHiddenApp("myapp-staging-istio-ingressgateway")).toBe(true);
  });

  it("prometheus を含む名前は非表示", () => {
    expect(isHiddenApp("myapp-staging-prometheus-stack")).toBe(true);
  });

  it("Prometheus（大文字混在）も非表示", () => {
    expect(isHiddenApp("Prometheus-Server")).toBe(true);
  });

  it("アプリサービスは表示", () => {
    expect(isHiddenApp("myapp-staging-api-server")).toBe(false);
  });

  it("web アプリは表示", () => {
    expect(isHiddenApp("myapp-staging-web-frontend")).toBe(false);
  });
});
