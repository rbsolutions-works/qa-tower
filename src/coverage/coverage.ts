import type { Catalog, CatalogEntry } from "../catalog/schema.js";
import { extractTags, type TestResult } from "./reports.js";

/**
 * How an entry stands after joining catalog against test results:
 * - tested        ≥1 passing test claims the ID, none failing
 * - failing       ≥1 failing test claims the ID
 * - covered-by-spec  no tagged test ran, but the entry declares status: covered with specs
 * - waived        explicitly waived with a reason
 * - gap           nothing covers it
 */
export type CoverageState = "tested" | "failing" | "covered-by-spec" | "waived" | "gap";

export interface EntryCoverage {
  id: string;
  category: "surfaces" | "actions" | "flows";
  label: string;
  state: CoverageState;
  claimedBy: TestResult[];
  waivedReason?: string;
  specs: string[];
}

export interface CategorySummary {
  total: number;
  tested: number;
  failing: number;
  coveredBySpec: number;
  waived: number;
  gap: number;
  /**
   * "Not-a-gap" percentage: counts tested + covered-by-spec (+ waived).
   * WARNING: `covered-by-spec` entries are DECLARED covered in the catalog
   * with no executing test, so this is NOT a coverage guarantee. A catalog
   * that marks everything `covered` reads 100% here while nothing runs.
   * Prefer `testedPct` as the headline.
   */
  coveredPct: number;
  /** TEST-PROVEN coverage: tested / total, 0-100. Only what a test executes. */
  testedPct: number;
}

export interface CoverageResult {
  entries: EntryCoverage[];
  byCategory: Record<"surfaces" | "actions" | "flows", CategorySummary>;
  overall: CategorySummary;
  /** Tags found in test titles that match no catalog entry. */
  unknownTags: { tag: string; title: string; report: string }[];
  totalTests: number;
}

function entryLabel(e: CatalogEntry): string {
  if ("route" in e) return e.route;
  if ("name" in e) return e.name;
  return e.title ?? e.id;
}

function summarize(entries: EntryCoverage[]): CategorySummary {
  const s: CategorySummary = {
    total: entries.length,
    tested: 0,
    failing: 0,
    coveredBySpec: 0,
    waived: 0,
    gap: 0,
    coveredPct: 0,
    testedPct: 0,
  };
  for (const e of entries) {
    if (e.state === "tested") s.tested++;
    else if (e.state === "failing") s.failing++;
    else if (e.state === "covered-by-spec") s.coveredBySpec++;
    else if (e.state === "waived") s.waived++;
    else s.gap++;
  }
  const denom = s.total - s.waived;
  s.coveredPct = denom === 0 ? 100 : Math.round(((s.tested + s.coveredBySpec) / denom) * 1000) / 10;
  // TEST-PROVEN: only entries an actual test executes. `covered-by-spec` is a
  // catalog declaration, not evidence, so it is deliberately excluded.
  s.testedPct = denom === 0 ? 100 : Math.round((s.tested / denom) * 1000) / 10;
  return s;
}

export function computeCoverage(catalog: Catalog, results: TestResult[]): CoverageResult {
  const claims = new Map<string, TestResult[]>();
  const unknownTags: CoverageResult["unknownTags"] = [];

  for (const r of results) {
    for (const tag of extractTags(r.title)) {
      if (!catalog.byId.has(tag)) {
        unknownTags.push({ tag, title: r.title, report: r.report });
        continue;
      }
      const list = claims.get(tag) ?? [];
      list.push(r);
      claims.set(tag, list);
    }
  }

  const entries: EntryCoverage[] = [];
  const categorize = (
    list: CatalogEntry[],
    category: EntryCoverage["category"],
  ): EntryCoverage[] =>
    list.map((e) => {
      const claimedBy = claims.get(e.id) ?? [];
      const ran = claimedBy.filter((c) => c.status !== "skipped");
      let state: CoverageState;
      if (ran.some((c) => c.status === "failed")) state = "failing";
      else if (ran.some((c) => c.status === "passed")) state = "tested";
      else if (e.status === "covered" && e.specs.length > 0) state = "covered-by-spec";
      else if (e.status === "waived") state = "waived";
      else state = "gap";
      return {
        id: e.id,
        category,
        label: entryLabel(e),
        state,
        claimedBy,
        waivedReason: e.waived_reason,
        specs: e.specs,
      };
    });

  const surfaces = categorize(catalog.surfaces, "surfaces");
  const actions = categorize(catalog.actions, "actions");
  const flows = categorize(catalog.flows, "flows");
  entries.push(...surfaces, ...actions, ...flows);

  return {
    entries,
    byCategory: {
      surfaces: summarize(surfaces),
      actions: summarize(actions),
      flows: summarize(flows),
    },
    overall: summarize(entries),
    unknownTags,
    totalTests: results.length,
  };
}
