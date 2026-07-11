import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { checkDrift, hashFile, hasDrift, DriftError } from "../src/drift/drift.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, "fixtures");

describe("hashFile", () => {
  it("returns the git blob hash for an existing file", () => {
    const hash = hashFile(fixturesRoot, "fixtures-src/status.ts");
    expect(hash).toMatch(/^[0-9a-f]{40}$/);
  });

  it("returns null for a missing file", () => {
    expect(hashFile(fixturesRoot, "fixtures-src/does-not-exist.ts")).toBeNull();
  });
});

describe("checkDrift", () => {
  it("reports no drift when the recorded hash matches", () => {
    const results = checkDrift(fixturesRoot, [
      { path: "fixtures-src/status.ts", hash: hashFile(fixturesRoot, "fixtures-src/status.ts")!, owners: [] },
    ]);
    expect(hasDrift(results)).toBe(false);
    expect(results[0]?.drifted).toBe(false);
  });

  it("reports drift when the recorded hash is stale", () => {
    const results = checkDrift(fixturesRoot, [
      { path: "fixtures-src/status.ts", hash: "00000000000000000000000000000000000000aa", owners: ["FLW-001"] },
    ]);
    expect(hasDrift(results)).toBe(true);
    expect(results[0]).toMatchObject({ drifted: true, missing: false, owners: ["FLW-001"] });
  });

  it("reports drift (and missing) for a fingerprinted file that no longer exists", () => {
    const results = checkDrift(fixturesRoot, [
      { path: "fixtures-src/gone.ts", hash: "00000000000000000000000000000000000000aa", owners: [] },
    ]);
    expect(results[0]).toMatchObject({ drifted: true, missing: true, actual: null });
  });

  it("throws DriftError for a nonexistent cwd", () => {
    expect(() => checkDrift(join(fixturesRoot, "no-such-dir"), [])).toThrow(DriftError);
  });
});
