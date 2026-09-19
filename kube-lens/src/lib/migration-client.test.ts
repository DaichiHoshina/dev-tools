import { describe, it, expect } from "vitest";
import { parseMigrationVersion } from "./migration-client";

// ─── parseMigrationVersion ────────────────────────────────────────────────────

describe("parseMigrationVersion", () => {
  it("'20211214111220' → { version: 20211214111220, dirty: false }", () => {
    expect(parseMigrationVersion("20211214111220")).toEqual({
      version: 20211214111220,
      dirty: false,
    });
  });

  it("'20211214111220 (dirty)' → { version: 20211214111220, dirty: true }", () => {
    expect(parseMigrationVersion("20211214111220 (dirty)")).toEqual({
      version: 20211214111220,
      dirty: true,
    });
  });

  it("'20211214111220 (Dirty)' → dirty: true（大文字も認識）", () => {
    expect(parseMigrationVersion("20211214111220 (Dirty)")).toEqual({
      version: 20211214111220,
      dirty: true,
    });
  });

  it("'' → { version: 0, dirty: false }", () => {
    expect(parseMigrationVersion("")).toEqual({
      version: 0,
      dirty: false,
    });
  });

  it("'no numbers' → { version: 0, dirty: false }", () => {
    expect(parseMigrationVersion("no numbers")).toEqual({
      version: 0,
      dirty: false,
    });
  });
});
