import { describe, it, expect, beforeAll } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = join(here, "..", "dist", "cli.js");

// Async spawn (not spawnSync): the mock HTTP server runs in THIS process, so
// the event loop must stay free to serve the CLI's request. spawnSync would
// block the loop and deadlock against the in-process server.
function runCli(
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
): Promise<{ status: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("node", [cliPath, ...args], { cwd, env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    child.on("close", (code) => resolve({ status: code ?? 1, stdout, stderr }));
  });
}

const sampleVerdict = {
  appName: "demo",
  generatedAt: "2026-07-12T00:00:00.000Z",
  overall: { coveredPct: 90, total: 10, gap: 1, failing: 0 },
  byCategory: {},
  totalTests: 5,
  unknownTagCount: 0,
  driftedCount: 0,
  ok: false,
};

function tmpWithVerdict(): string {
  const root = mkdtempSync(join(tmpdir(), "qa-upload-"));
  writeFileSync(join(root, "qa-verdict.json"), JSON.stringify(sampleVerdict));
  return root;
}

describe("qa upload", () => {
  beforeAll(() => {
    if (!existsSync(cliPath)) throw new Error("dist/cli.js not built — run `npm run build` before tests");
  });

  it("fails clearly when no endpoint is configured", async () => {
    const r = await runCli(["upload", "--token", "x"], tmpWithVerdict(), { QA_TOWER_CLOUD_URL: "" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no endpoint");
  });

  it("fails clearly when no token is configured", async () => {
    const r = await runCli(["upload", "--endpoint", "http://localhost:1"], tmpWithVerdict(), { QA_TOWER_TOKEN: "" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no token");
  });

  it("fails clearly when the verdict file is missing", async () => {
    const root = mkdtempSync(join(tmpdir(), "qa-upload-"));
    const r = await runCli(["upload", "--endpoint", "http://localhost:1", "--token", "x"], root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("qa-verdict.json not found");
  });

  it("POSTs the verdict with bearer token + commit/branch headers", async () => {
    const received: { auth?: string; commit?: string; branch?: string; repo?: string; body?: string; path?: string } = {};
    const server: Server = createServer((req, res) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => {
        received.path = req.url;
        received.auth = req.headers["authorization"] as string;
        received.commit = req.headers["x-qa-commit"] as string;
        received.branch = req.headers["x-qa-branch"] as string;
        received.repo = req.headers["x-qa-repo"] as string;
        received.body = data;
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, runId: 7 }));
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as { port: number }).port;

    const r = await runCli(
      ["upload", "--endpoint", `http://localhost:${port}`, "--token", "sekret", "--commit", "abc1234", "--branch", "master", "--repo", "acme/app"],
      tmpWithVerdict(),
    );
    await new Promise<void>((r) => server.close(() => r()));

    expect(r.status).toBe(0);
    expect(r.stdout).toContain("201");
    expect(received.path).toBe("/api/v1/runs");
    expect(received.auth).toBe("Bearer sekret");
    expect(received.commit).toBe("abc1234");
    expect(received.branch).toBe("master");
    expect(received.repo).toBe("acme/app");
    expect(JSON.parse(received.body!).appName).toBe("demo");
  });

  it("propagates a non-2xx response as a failure", async () => {
    const server: Server = createServer((_req, res) => {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid token" }));
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as { port: number }).port;

    const r = await runCli(["upload", "--endpoint", `http://localhost:${port}`, "--token", "bad"], tmpWithVerdict());
    await new Promise<void>((r) => server.close(() => r()));

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("401");
  });

  it("finds the verdict written by `qa verdict` when --out and --cwd are both relative (UCE layout)", async () => {
    // Mirrors UCE CI: run from repo-root/src/web with `--cwd ../.. --out
    // ../../qa-verdict`. `qa verdict` writes the file relative to cwd
    // (repo root); upload must resolve --out the same way, not against --cwd.
    const root = mkdtempSync(join(tmpdir(), "qa-upload-uce-"));
    const web = join(root, "src", "web");
    mkdirSync(web, { recursive: true });
    writeFileSync(join(root, "qa-verdict.json"), JSON.stringify(sampleVerdict));

    let gotBody = "";
    const server: Server = createServer((req, res) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => {
        gotBody = data;
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, runId: 1 }));
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as { port: number }).port;

    const r = await runCli(
      ["upload", "--cwd", "../..", "--out", "../../qa-verdict", "--endpoint", `http://localhost:${port}`, "--token", "t"],
      web,
    );
    await new Promise<void>((r) => server.close(() => r()));

    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(JSON.parse(gotBody).appName).toBe("demo");
  });
});
