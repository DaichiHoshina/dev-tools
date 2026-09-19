import { describe, it, expect, beforeEach } from "vitest";
import {
  Storage,
  BranchComparisonStorage,
} from "../storage";
import type {
  BranchComparisonCache,
} from "../storage";

// シンプルなLocalStorageモック
class SimpleLocalStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  keys(): string[] {
    return Array.from(this.store.keys());
  }
}

beforeEach(() => {
  const mockStorage = new SimpleLocalStorage();
  global.localStorage = mockStorage as any;

  // Object.keys(localStorage)が機能するようにする
  const originalObjectKeys = Object.keys;
  Object.keys = function (obj: any) {
    if (obj === global.localStorage) {
      return (obj as SimpleLocalStorage).keys();
    }
    return originalObjectKeys(obj);
  };
});

describe("BranchComparisonStorage", () => {
  const sampleCache: BranchComparisonCache = {
    aheadCount: 3,
    lastChecked: "2026-02-02T10:00:00Z",
    services: [{ serviceName: "web", aheadCount: 3 }],
  };

  describe("save", () => {
    it("ブランチ比較キャッシュを保存", () => {
      BranchComparisonStorage.save(sampleCache);

      const saved = localStorage.getItem("branch_comparison_cache");
      expect(saved).toBeTruthy();
      expect(JSON.parse(saved!)).toEqual(sampleCache);
    });
  });

  describe("get", () => {
    it("保存されたキャッシュを取得", () => {
      BranchComparisonStorage.save(sampleCache);

      const retrieved = BranchComparisonStorage.get();
      expect(retrieved).toEqual(sampleCache);
    });

    it("キャッシュが存在しない場合はnullを返す", () => {
      const retrieved = BranchComparisonStorage.get();
      expect(retrieved).toBeNull();
    });
  });

  describe("clear", () => {
    it("キャッシュを削除", () => {
      BranchComparisonStorage.save(sampleCache);
      BranchComparisonStorage.clear();

      const retrieved = BranchComparisonStorage.get();
      expect(retrieved).toBeNull();
    });
  });
});

describe("Storage", () => {
  describe("get", () => {
    it("値が存在する場合は取得", () => {
      localStorage.setItem("test_key", JSON.stringify({ value: 123 }));

      const result = Storage.get("test_key", { value: 0 });
      expect(result).toEqual({ value: 123 });
    });

    it("値が存在しない場合はデフォルト値を返す", () => {
      const result = Storage.get("nonexistent_key", { value: 0 });
      expect(result).toEqual({ value: 0 });
    });
  });

  describe("set", () => {
    it("値を保存", () => {
      Storage.set("test_key", { value: 456 });

      const saved = localStorage.getItem("test_key");
      expect(JSON.parse(saved!)).toEqual({ value: 456 });
    });
  });

  describe("remove", () => {
    it("値を削除", () => {
      Storage.set("test_key", { value: 789 });
      Storage.remove("test_key");

      const result = localStorage.getItem("test_key");
      expect(result).toBeNull();
    });
  });

  describe("clear", () => {
    it("すべてクリア", () => {
      Storage.set("key1", "value1");
      Storage.set("key2", "value2");
      Storage.clear();

      expect(localStorage.length).toBe(0);
    });
  });
});
