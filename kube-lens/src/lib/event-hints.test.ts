import { describe, it, expect } from "vitest";
import { getEventHint } from "./event-hints";
import type { K8sEvent } from "./types";

function makeEvent(overrides: Partial<K8sEvent>): K8sEvent {
  return {
    namespace: "default",
    type: "Warning",
    reason: "Unknown",
    message: "",
    involvedObjectKind: "Pod",
    involvedObjectName: "test-pod",
    count: 1,
    firstTime: "2025-01-01T00:00:00Z",
    lastTime: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("getEventHint", () => {
  describe("safe=true パターン", () => {
    it("Readiness probe failed は安全", () => {
      const ev = makeEvent({
        reason: "Unhealthy",
        message: "Readiness probe failed: connection refused",
      });
      const hint = getEventHint(ev);
      expect(hint.safe).toBe(true);
      expect(hint.hint).toContain("ヘルスチェック");
    });

    it("Liveness probe failed（count <= 3）は安全", () => {
      const ev = makeEvent({
        reason: "Unhealthy",
        message: "Liveness probe failed: timeout",
        count: 2,
      });
      expect(getEventHint(ev).safe).toBe(true);
    });

    it("Liveness probe failed（count > 3）は安全でない", () => {
      const ev = makeEvent({
        reason: "Unhealthy",
        message: "Liveness probe failed: timeout",
        count: 5,
      });
      expect(getEventHint(ev).safe).toBe(false);
    });

    it("Successfully pulled image は安全", () => {
      const ev = makeEvent({
        reason: "Pulled",
        message: 'Successfully pulled image "nginx:latest"',
      });
      expect(getEventHint(ev).safe).toBe(true);
    });

    it("Successfully assigned は安全", () => {
      const ev = makeEvent({
        reason: "Scheduled",
        message: "Successfully assigned default/my-pod to node-1",
      });
      expect(getEventHint(ev).safe).toBe(true);
    });

    it("ScalingReplicaSet は安全（messageを問わない）", () => {
      const ev = makeEvent({
        reason: "ScalingReplicaSet",
        message: "Scaled up replica set my-deploy-abc to 3",
      });
      expect(getEventHint(ev).safe).toBe(true);
    });
  });

  describe("safe=false パターン", () => {
    it("FailedScheduling は安全でない", () => {
      const ev = makeEvent({
        reason: "FailedScheduling",
        message: "0/3 nodes are available",
      });
      expect(getEventHint(ev).safe).toBe(false);
      expect(getEventHint(ev).hint).toBe("");
    });

    it("BackOff は安全でない", () => {
      const ev = makeEvent({
        reason: "BackOff",
        message: "Back-off restarting failed container",
      });
      expect(getEventHint(ev).safe).toBe(false);
    });

    it("Unhealthy + 不明なメッセージは安全でない", () => {
      const ev = makeEvent({
        reason: "Unhealthy",
        message: "some unknown error",
      });
      expect(getEventHint(ev).safe).toBe(false);
    });
  });
});
