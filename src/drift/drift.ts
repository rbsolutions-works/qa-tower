import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Fingerprint } from "../catalog/schema.js";

export interface DriftResult {
  path: string;
  owners: string[];
  expected: string;
  actual: string | null;
  drifted: boolean;
  /** true when the fingerprinted file no longer exists at all. */
  missing: boolean;
}

export class DriftError extends Error {}

/**
 * Compute the current git blob hash of a file, relative to `cwd`.
 * Returns null if the file doesn't exist on disk.
 */
export function hashFile(cwd: string, relativePath: string): string | null {
  if (!existsSync(join(cwd, relativePath))) return null;
  try {
    const out = execFileSync("git", ["hash-object", relativePath], {
      cwd,
      encoding: "utf8",
    });
    return out.trim();
  } catch (e) {
    throw new DriftError(`git hash-object failed for ${relativePath}: ${(e as Error).message}`);
  }
}

/**
 * Compare each fingerprinted file's current git blob hash against the
 * recorded hash. `cwd` must be inside the git worktree the paths are
 * relative to.
 */
export function checkDrift(cwd: string, fingerprints: Fingerprint[]): DriftResult[] {
  if (!existsSync(cwd)) throw new DriftError(`cwd does not exist: ${cwd}`);
  return fingerprints.map((fp) => {
    const actual = hashFile(cwd, fp.path);
    return {
      path: fp.path,
      owners: fp.owners,
      expected: fp.hash,
      actual,
      drifted: actual !== fp.hash,
      missing: actual === null,
    };
  });
}

export function hasDrift(results: DriftResult[]): boolean {
  return results.some((r) => r.drifted);
}
