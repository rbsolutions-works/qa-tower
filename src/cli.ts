#!/usr/bin/env node
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadCatalog, CatalogError } from "./catalog/load.js";
import { parseReportFile, ReportError, type TestResult } from "./coverage/reports.js";
import { computeCoverage } from "./coverage/coverage.js";
import { checkDrift, DriftError } from "./drift/drift.js";
import { renderVerdictHtml, buildVerdictJson } from "./report/verdict.js";

interface Flags {
  catalog: string;
  reports: string[];
  cwd: string;
  out: string;
  app: string;
  failOnGap: boolean;
  endpoint: string;
  token: string;
  commit: string;
  branch: string;
  repo: string;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    catalog: "qa/catalog",
    reports: [],
    cwd: process.cwd(),
    out: "qa-verdict",
    app: "app",
    failOnGap: false,
    // Upload target/credentials default to env so CI can set them as
    // secrets without putting them on the command line.
    endpoint: process.env.QA_TOWER_CLOUD_URL ?? "",
    token: process.env.QA_TOWER_TOKEN ?? "",
    commit: process.env.GITHUB_SHA ?? "",
    branch: process.env.GITHUB_REF_NAME ?? "",
    repo: process.env.GITHUB_REPOSITORY ?? "",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--catalog") flags.catalog = next()!;
    else if (a === "--report") flags.reports.push(next()!);
    else if (a === "--cwd") flags.cwd = next()!;
    else if (a === "--out") flags.out = next()!;
    else if (a === "--app") flags.app = next()!;
    else if (a === "--fail-on-gap") flags.failOnGap = true;
    else if (a === "--endpoint") flags.endpoint = next()!;
    else if (a === "--token") flags.token = next()!;
    else if (a === "--commit") flags.commit = next()!;
    else if (a === "--branch") flags.branch = next()!;
    else if (a === "--repo") flags.repo = next()!;
  }
  // Resolve --cwd against the process cwd exactly once, up front, so every
  // other flag (--catalog, --report, --out) composes against an absolute
  // base instead of two independently-relative paths.
  flags.cwd = resolve(process.cwd(), flags.cwd);
  return flags;
}

function fail(msg: string): never {
  console.error(`qa: ${msg}`);
  process.exit(1);
}

function cmdValidate(flags: Flags): void {
  try {
    const catalog = loadCatalog(resolve(flags.cwd, flags.catalog));
    const total = catalog.surfaces.length + catalog.actions.length + catalog.flows.length;
    console.log(
      `qa validate: OK — ${catalog.surfaces.length} surfaces, ${catalog.actions.length} actions, ` +
        `${catalog.flows.length} flows, ${catalog.fingerprints.length} fingerprints (${total} ids total)`,
    );
  } catch (e) {
    if (e instanceof CatalogError) fail(e.message);
    throw e;
  }
}

function loadResults(flags: Flags): TestResult[] {
  const results: TestResult[] = [];
  for (const r of flags.reports) {
    const path = resolve(flags.cwd, r);
    // A missing report just means that layer hasn't run yet — coverage
    // should be usable incrementally (e.g. unit tests ran, e2e didn't).
    // A report that EXISTS but fails to parse is a real problem and still
    // hard-fails below.
    if (!existsSync(path)) {
      console.error(`qa: skipping --report ${r} (not found — that test layer hasn't run yet)`);
      continue;
    }
    try {
      results.push(...parseReportFile(path));
    } catch (e) {
      if (e instanceof ReportError) fail(e.message);
      throw e;
    }
  }
  return results;
}

function cmdCoverage(flags: Flags): void {
  const catalog = safeLoadCatalog(flags);
  const results = loadResults(flags);
  const coverage = computeCoverage(catalog, results);

  // Headline is TEST-PROVEN coverage. `coveredPct` also counts covered-by-spec
  // (declared in the catalog, no executing test), so it is not a guarantee.
  for (const [cat, s] of Object.entries(coverage.byCategory)) {
    console.log(
      `${cat.padEnd(10)} ${s.testedPct.toFixed(1).padStart(5)}% proven  ` +
        `tested=${s.tested} declared=${s.coveredBySpec} failing=${s.failing} gap=${s.gap} waived=${s.waived}`,
    );
  }
  const ov = coverage.overall;
  console.log(`overall    ${ov.testedPct.toFixed(1).padStart(5)}% proven  total=${ov.total}`);
  if (ov.coveredBySpec > 0) {
    console.log(
      `\nwarning: ${ov.coveredBySpec} of ${ov.total} entries are marked 'covered' in the catalog but no test\n` +
        `executes them. They count toward coveredPct (${ov.coveredPct.toFixed(1)}%) — declared is not proven.`,
    );
  }

  if (coverage.unknownTags.length > 0) {
    console.log(`\n${coverage.unknownTags.length} test title(s) reference unknown catalog ids:`);
    for (const u of coverage.unknownTags.slice(0, 20)) {
      console.log(`  ${u.tag}  "${u.title}"  (${u.report})`);
    }
  }

  if (coverage.overall.gap > 0) {
    console.log(`\n${coverage.overall.gap} gap(s):`);
    for (const e of coverage.entries.filter((x) => x.state === "gap")) {
      console.log(`  ${e.id}  ${e.label}`);
    }
    if (flags.failOnGap) process.exit(1);
  }
  if (coverage.overall.failing > 0) process.exit(1);
}

function safeLoadCatalog(flags: Flags) {
  try {
    return loadCatalog(resolve(flags.cwd, flags.catalog));
  } catch (e) {
    if (e instanceof CatalogError) fail(e.message);
    throw e;
  }
}

function cmdDrift(flags: Flags): void {
  const catalog = safeLoadCatalog(flags);
  try {
    const results = checkDrift(flags.cwd, catalog.fingerprints);
    const drifted = results.filter((r) => r.drifted);
    if (drifted.length === 0) {
      console.log(`qa drift: OK — ${results.length} fingerprinted file(s) unchanged`);
      return;
    }
    console.log(`qa drift: ${drifted.length} file(s) drifted:`);
    for (const d of drifted) {
      console.log(`  ${d.path}${d.missing ? " (missing)" : ""}  owners=[${d.owners.join(", ")}]`);
    }
    process.exit(1);
  } catch (e) {
    if (e instanceof DriftError) fail(e.message);
    throw e;
  }
}

function cmdVerdict(flags: Flags): void {
  const catalog = safeLoadCatalog(flags);
  const results = loadResults(flags);
  const coverage = computeCoverage(catalog, results);
  let drift: ReturnType<typeof checkDrift> = [];
  try {
    drift = checkDrift(flags.cwd, catalog.fingerprints);
  } catch (e) {
    if (e instanceof DriftError) fail(e.message);
    throw e;
  }

  const input = { appName: flags.app, coverage, drift };
  const html = renderVerdictHtml(input);
  const json = buildVerdictJson(input);

  writeFileSync(`${flags.out}.html`, html);
  writeFileSync(`${flags.out}.json`, JSON.stringify(json, null, 2));
  console.log(`qa verdict: wrote ${flags.out}.html and ${flags.out}.json — ${json.ok ? "PASS" : "NOT PASSING"}`);
  if (!json.ok) process.exit(1);
}

async function cmdUpload(flags: Flags): Promise<void> {
  if (!flags.endpoint) fail("upload: no endpoint (set --endpoint or QA_TOWER_CLOUD_URL)");
  if (!flags.token) fail("upload: no token (set --token or QA_TOWER_TOKEN)");

  // Resolve --out against process.cwd(), NOT --cwd, to match exactly where
  // `qa verdict` wrote the file: cmdVerdict does writeFileSync(`${out}.json`),
  // which Node resolves against process.cwd(). --cwd only scopes the catalog
  // and reports. Resolving against --cwd here would look in the wrong place
  // whenever --out and --cwd are both relative (e.g. UCE's src/web + ../..).
  const path = resolve(process.cwd(), `${flags.out}.json`);
  if (!existsSync(path)) fail(`upload: ${flags.out}.json not found — run 'qa verdict' first`);
  const body = readFileSync(path, "utf8");

  const url = `${flags.endpoint.replace(/\/+$/, "")}/api/v1/runs`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${flags.token}`,
    "Content-Type": "application/json",
  };
  if (flags.commit) headers["X-QA-Commit"] = flags.commit;
  if (flags.branch) headers["X-QA-Branch"] = flags.branch;
  if (flags.repo) headers["X-QA-Repo"] = flags.repo;

  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers, body });
  } catch (e) {
    fail(`upload: request failed — ${(e as Error).message}`);
  }
  const text = await res.text();
  if (!res.ok) fail(`upload: ${res.status} ${res.statusText} — ${text}`);
  console.log(`qa upload: ${res.status} — ${text}`);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);

  switch (cmd) {
    case "validate":
      return cmdValidate(flags);
    case "coverage":
      return cmdCoverage(flags);
    case "drift":
      return cmdDrift(flags);
    case "verdict":
      return cmdVerdict(flags);
    case "upload":
      return cmdUpload(flags);
    default:
      console.log(
        `usage: qa <validate|coverage|drift|verdict|upload> [--catalog dir] [--report file]... ` +
          `[--cwd dir] [--out prefix] [--app name] [--fail-on-gap] ` +
          `[--endpoint url] [--token t] [--commit sha] [--branch name] [--repo owner/name]`,
      );
      process.exit(cmd ? 1 : 0);
  }
}

main();
