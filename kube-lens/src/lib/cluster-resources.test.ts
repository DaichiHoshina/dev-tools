import { describe, it, expect } from "vitest";
import {
  parseCpu,
  parseMemory,
  formatCpu,
  formatMemoryGiB,
} from "./cluster-resources";

describe("parseCpu", () => {
  it("整数コア", () => expect(parseCpu("4")).toBe(4));
  it("ミリコア", () => expect(parseCpu("500m")).toBe(0.5));
  it("ナノコア", () => expect(parseCpu("1000000000n")).toBe(1));
  it("小数コア", () => expect(parseCpu("1.5")).toBe(1.5));
  it("空文字は0", () => expect(parseCpu("")).toBe(0));
  it("0", () => expect(parseCpu("0")).toBe(0));
  it("100m", () => expect(parseCpu("100m")).toBe(0.1));
});

describe("parseMemory", () => {
  it("Ki単位", () => expect(parseMemory("1Ki")).toBe(1024));
  it("Mi単位", () => expect(parseMemory("256Mi")).toBe(256 * 1024 ** 2));
  it("Gi単位", () => expect(parseMemory("2Gi")).toBe(2 * 1024 ** 3));
  it("Ti単位", () => expect(parseMemory("1Ti")).toBe(1024 ** 4));
  it("K(10進)単位", () => expect(parseMemory("1000K")).toBe(1000 * 1000));
  it("M(10進)単位", () => expect(parseMemory("512M")).toBe(512 * 1000 ** 2));
  it("G(10進)単位", () => expect(parseMemory("1G")).toBe(1000 ** 3));
  it("バイト(サフィックスなし)", () =>
    expect(parseMemory("1048576")).toBe(1048576));
  it("空文字は0", () => expect(parseMemory("")).toBe(0));
  it("0", () => expect(parseMemory("0")).toBe(0));
});

describe("formatCpu", () => {
  it("通常コア数", () => expect(formatCpu(4)).toBe("4.00"));
  it("小数コア数", () => expect(formatCpu(0.5)).toBe("0.50"));
  it("0.01未満はミリコア表記", () => expect(formatCpu(0.005)).toBe("5m"));
  it("0はミリコア表記", () => expect(formatCpu(0)).toBe("0m"));
  it("ちょうど0.01はコア表記", () => expect(formatCpu(0.01)).toBe("0.01"));
});

describe("formatMemoryGiB", () => {
  it("0バイト", () => expect(formatMemoryGiB(0)).toBe("0.00 GiB"));
  it("1GiB", () => expect(formatMemoryGiB(1024 ** 3)).toBe("1.00 GiB"));
  it("2.5GiB", () => expect(formatMemoryGiB(2.5 * 1024 ** 3)).toBe("2.50 GiB"));
});
