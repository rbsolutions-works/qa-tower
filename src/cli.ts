#!/usr/bin/env node
import { writeFileSync } from "node:fs";
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
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    catalog: "qa/catalog",
    reports: [],
    cwd: process.cwd(),
    out: "qa-verdict",
    app: "app",
    failOnGap: false,
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
    try {
      results.push(...parseReportFile(resolve(flags.cwd, r)));
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

  for (const [cat, s] of Object.entries(coverage.byCategory)) {
    console.log(
      `${cat.padEnd(10)} ${s.coveredPct.toFixed(1).padStart(5)}%  ` +
        `tested=${s.tested} spec=${s.coveredBySpec} failing=${s.failing} gap=${s.gap} waived=${s.waived}`,
    );
  }
  console.log(`overall    ${coverage.overall.coveredPct.toFixed(1).padStart(5)}%  total=${coverage.overall.total}`);

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

function main(): void {
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
    default:
      console.log(
        `usage: qa <validate|coverage|drift|verdict> [--catalog dir] [--report file]... [--cwd dir] [--out prefix] [--app name] [--fail-on-gap]`,
      );
      process.exit(cmd ? 1 : 0);
  }
}

main();
