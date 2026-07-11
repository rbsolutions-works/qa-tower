import { readFileSync } from "node:fs";
import { TAG_PATTERN } from "../catalog/schema.js";

export type TestStatus = "passed" | "failed" | "skipped";

export interface TestResult {
  /** Full title including describe blocks / suite chain. */
  title: string;
  status: TestStatus;
  /** Report file this result came from. */
  report: string;
}

export function extractTags(title: string): string[] {
  const tags = new Set<string>();
  for (const m of title.matchAll(TAG_PATTERN)) tags.add(m[1]!);
  return [...tags];
}

/* ---------- Vitest / Jest JSON reporter shape ---------- */

interface JestAssertion {
  fullName?: string;
  title?: string;
  status?: string;
}
interface JestFileResult {
  assertionResults?: JestAssertion[];
}
interface JestReport {
  testResults?: JestFileResult[];
}

function normalizeJestStatus(s: string | undefined): TestStatus {
  if (s === "passed") return "passed";
  if (s === "failed") return "failed";
  return "skipped"; // pending, skipped, todo, disabled
}

function parseJestLike(json: JestReport, report: string): TestResult[] {
  const out: TestResult[] = [];
  for (const file of json.testResults ?? []) {
    for (const a of file.assertionResults ?? []) {
      out.push({
        title: a.fullName ?? a.title ?? "",
        status: normalizeJestStatus(a.status),
        report,
      });
    }
  }
  return out;
}

/* ---------- Playwright JSON reporter shape ---------- */

interface PwResult {
  status?: string;
}
interface PwTest {
  results?: PwResult[];
  status?: string;
}
interface PwSpec {
  title: string;
  ok?: boolean;
  tests?: PwTest[];
}
interface PwSuite {
  title?: string;
  suites?: PwSuite[];
  specs?: PwSpec[];
}
interface PwReport {
  suites?: PwSuite[];
}

function pwSpecStatus(spec: PwSpec): TestStatus {
  const statuses = (spec.tests ?? []).flatMap((t) =>
    (t.results ?? []).map((r) => r.status ?? t.status ?? "skipped"),
  );
  if (statuses.length === 0) return "skipped";
  // A spec passes if its final outcome is ok; any hard failure counts as failed.
  if (spec.ok === false || statuses.includes("failed") || statuses.includes("timedOut")) {
    return "failed";
  }
  if (statuses.includes("passed")) return "passed";
  return "skipped";
}

function walkPwSuite(suite: PwSuite, chain: string[], report: string, out: TestResult[]): void {
  const nextChain = suite.title ? [...chain, suite.title] : chain;
  for (const spec of suite.specs ?? []) {
    out.push({
      title: [...nextChain, spec.title].join(" > "),
      status: pwSpecStatus(spec),
      report,
    });
  }
  for (const child of suite.suites ?? []) walkPwSuite(child, nextChain, report, out);
}

function parsePlaywright(json: PwReport, report: string): TestResult[] {
  const out: TestResult[] = [];
  for (const suite of json.suites ?? []) walkPwSuite(suite, [], report, out);
  return out;
}

/* ---------- entry point ---------- */

export class ReportError extends Error {}

/** Parse a Vitest/Jest or Playwright JSON report file (auto-detected). */
export function parseReportFile(path: string): TestResult[] {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new ReportError(`cannot read/parse report ${path}: ${(e as Error).message}`);
  }
  if (typeof json !== "object" || json === null) {
    throw new ReportError(`report ${path}: not a JSON object`);
  }
  if ("suites" in json) return parsePlaywright(json as PwReport, path);
  if ("testResults" in json) return parseJestLike(json as JestReport, path);
  throw new ReportError(
    `report ${path}: unrecognized shape (expected Playwright "suites" or Vitest/Jest "testResults")`,
  );
}
