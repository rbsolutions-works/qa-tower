import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadCatalog, CatalogError } from "../src/catalog/load.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "fixtures", "catalog");

describe("loadCatalog", () => {
  it("loads and validates a well-formed catalog", () => {
    const catalog = loadCatalog(fixturesDir);
    expect(catalog.surfaces).toHaveLength(2);
    expect(catalog.actions).toHaveLength(2);
    expect(catalog.flows).toHaveLength(1);
    expect(catalog.fingerprints).toHaveLength(1);
    expect(catalog.byId.get("SUR-001")?.id).toBe("SUR-001");
  });

  it("throws on missing directory", () => {
    expect(() => loadCatalog(join(here, "fixtures", "does-not-exist"))).toThrow(CatalogError);
  });

  it("throws CatalogError on duplicate ids across files", () => {
    const dir = join(here, "fixtures", "catalog-dup");
    expect(() => loadCatalog(dir)).toThrow(/duplicate catalog id/);
  });

  it("throws on malformed entries (missing required field)", () => {
    const dir = join(here, "fixtures", "catalog-malformed");
    expect(() => loadCatalog(dir)).toThrow(CatalogError);
  });

  it("requires waived_reason when status is waived", () => {
    const dir = join(here, "fixtures", "catalog-bad-waive");
    expect(() => loadCatalog(dir)).toThrow(/waived_reason/);
  });

  it("rejects a fingerprint owner that isn't a catalog id", () => {
    const dir = join(here, "fixtures", "catalog-bad-owner");
    expect(() => loadCatalog(dir)).toThrow(/is not a catalog id/);
  });

  it("treats missing yaml files as empty arrays", () => {
    const dir = join(here, "fixtures", "catalog-partial");
    const catalog = loadCatalog(dir);
    expect(catalog.surfaces).toHaveLength(1);
    expect(catalog.actions).toHaveLength(0);
    expect(catalog.flows).toHaveLength(0);
  });
});
