import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = join(here, "..", "dist", "cli.js");

function runCli(args: string[], cwd: string): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("node", [cliPath, ...args], { cwd, encoding: "utf8" });
    return { status: 0, stdout, stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

describe("cli --cwd / --catalog composition", () => {
  beforeAll(() => {
    if (!existsSync(cliPath)) {
      throw new Error(`dist/cli.js not built — run \`npm run build\` before tests`);
    }
  });

  it("resolves --catalog relative to --cwd (not the original process cwd), invoked from a nested directory", () => {
    // Mirrors the real UCE layout: repo-root/qa/catalog, repo-root/src/web (cwd
    // when npm runs the script). --cwd is resolved to the repo root first;
    // --catalog is then relative to THAT, not to the original process cwd.
    const root = mkdtempSync(join(tmpdir(), "qa-tower-cli-"));
    mkdirSync(join(root, "qa", "catalog"), { recursive: true });
    mkdirSync(join(root, "src", "web"), { recursive: true });
    writeFileSync(
      join(root, "qa", "catalog", "surfaces.yaml"),
      "- id: SUR-001\n  route: /a\n  status: gap\n",
    );

    const result = runCli(
      ["validate", "--cwd", "../..", "--catalog", "qa/catalog"],
      join(root, "src", "web"),
    );

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("1 surfaces");
  });

  it("regression: a --catalog still relative to the pre-resolution cwd must NOT silently succeed", () => {
    // Guards the actual historical bug: before --cwd was resolved up front,
    // resolve(cwd, catalog) mis-composed two independently-relative paths
    // and silently pointed at the wrong (nonexistent, or worse, wrong-but-
    // existing) directory. Asserts the over-traversed form fails loudly.
    const root = mkdtempSync(join(tmpdir(), "qa-tower-cli-"));
    mkdirSync(join(root, "qa", "catalog"), { recursive: true });
    mkdirSync(join(root, "src", "web"), { recursive: true });
    writeFileSync(join(root, "qa", "catalog", "surfaces.yaml"), "- id: SUR-001\n  route: /a\n");

    const result = runCli(
      ["validate", "--cwd", "../..", "--catalog", "../../qa/catalog"],
      join(root, "src", "web"),
    );

    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain("catalog directory not found");
  });

  it("still resolves correctly when --cwd is omitted (defaults to process cwd)", () => {
    const root = mkdtempSync(join(tmpdir(), "qa-tower-cli-"));
    mkdirSync(join(root, "qa", "catalog"), { recursive: true });
    writeFileSync(
      join(root, "qa", "catalog", "actions.yaml"),
      "- id: ACT-001\n  name: foo\n  status: gap\n",
    );

    const result = runCli(["validate", "--catalog", "qa/catalog"], root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("1 actions");
  });
});
