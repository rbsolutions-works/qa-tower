import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractTags, parseReportFile, ReportError } from "../src/coverage/reports.js";

function tmpFile(name: string, contents: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "qa-tower-"));
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(contents));
  return path;
}

describe("extractTags", () => {
  it("extracts one or more bracketed catalog ids", () => {
    expect(extractTags("driver delivers [ACT-041] [FLW-09]")).toEqual(["ACT-041", "FLW-09"]);
  });
  it("dedupes repeated tags", () => {
    expect(extractTags("[SUR-001] retried [SUR-001]")).toEqual(["SUR-001"]);
  });
  it("returns empty for untagged titles", () => {
    expect(extractTags("plain test title")).toEqual([]);
  });
  it("ignores brackets that aren't catalog-id shaped", () => {
    expect(extractTags("array access [0] works")).toEqual([]);
  });
});

describe("parseReportFile — Vitest/Jest shape", () => {
  it("parses passed/failed/skipped statuses", () => {
    const path = tmpFile("vitest.json", {
      testResults: [
        {
          assertionResults: [
            { fullName: "a [ACT-001]", status: "passed" },
            { fullName: "b [ACT-002]", status: "failed" },
            { fullName: "c [ACT-003]", status: "pending" },
          ],
        },
      ],
    });
    const results = parseReportFile(path);
    expect(results).toEqual([
      { title: "a [ACT-001]", status: "passed", report: path },
      { title: "b [ACT-002]", status: "failed", report: path },
      { title: "c [ACT-003]", status: "skipped", report: path },
    ]);
  });
});

describe("parseReportFile — Playwright shape", () => {
  it("walks nested suites and flattens spec titles", () => {
    const path = tmpFile("pw.json", {
      suites: [
        {
          title: "scenarios/23-onward.spec.ts",
          suites: [
            {
              title: "onward leg",
              specs: [
                { title: "handover [ACT-002]", ok: true, tests: [{ results: [{ status: "passed" }] }] },
                { title: "fails without truck [ACT-002]", ok: false, tests: [{ results: [{ status: "failed" }] }] },
              ],
            },
          ],
        },
      ],
    });
    const results = parseReportFile(path);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      title: "scenarios/23-onward.spec.ts > onward leg > handover [ACT-002]",
      status: "passed",
    });
    expect(results[1]?.status).toBe("failed");
  });
});

describe("parseReportFile — errors", () => {
  it("throws ReportError on unrecognized shape", () => {
    const path = tmpFile("weird.json", { something: "else" });
    expect(() => parseReportFile(path)).toThrow(ReportError);
  });
  it("throws ReportError on invalid JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "qa-tower-"));
    const path = join(dir, "broken.json");
    writeFileSync(path, "{not json");
    expect(() => parseReportFile(path)).toThrow(ReportError);
  });
});
