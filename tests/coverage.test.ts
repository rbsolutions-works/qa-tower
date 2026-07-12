import { describe, it, expect } from "vitest";
import { computeCoverage } from "../src/coverage/coverage.js";
import type { Catalog } from "../src/catalog/schema.js";
import type { TestResult } from "../src/coverage/reports.js";

function makeCatalog(): Catalog {
  const surfaces = [
    { id: "SUR-001", route: "/a", roles: {}, source: [], status: "gap" as const, specs: [] },
    { id: "SUR-002", route: "/b", roles: {}, source: [], status: "gap" as const, specs: [] },
    {
      id: "SUR-003",
      route: "/c",
      roles: {},
      source: [],
      status: "waived" as const,
      waived_reason: "manual only",
      specs: [],
    },
    {
      id: "SUR-004",
      route: "/d",
      roles: {},
      source: [],
      status: "covered" as const,
      specs: ["some/spec.ts"],
    },
  ];
  const byId = new Map();
  for (const s of surfaces) byId.set(s.id, s);
  return { surfaces, actions: [], flows: [], fingerprints: [], byId };
}

describe("computeCoverage", () => {
  it("classifies tested, gap, waived, and covered-by-spec", () => {
    const catalog = makeCatalog();
    const results: TestResult[] = [{ title: "loads [SUR-001]", status: "passed", report: "r.json" }];
    const cov = computeCoverage(catalog, results);

    const byId = Object.fromEntries(cov.entries.map((e) => [e.id, e.state]));
    expect(byId["SUR-001"]).toBe("tested");
    expect(byId["SUR-002"]).toBe("gap");
    expect(byId["SUR-003"]).toBe("waived");
    expect(byId["SUR-004"]).toBe("covered-by-spec");
  });

  it("marks failing over passed when both exist for the same id", () => {
    const catalog = makeCatalog();
    const results: TestResult[] = [
      { title: "first run [SUR-001]", status: "passed", report: "r1.json" },
      { title: "retry [SUR-001]", status: "failed", report: "r2.json" },
    ];
    const cov = computeCoverage(catalog, results);
    const entry = cov.entries.find((e) => e.id === "SUR-001")!;
    expect(entry.state).toBe("failing");
  });

  it("ignores skipped-only claims (still a gap)", () => {
    const catalog = makeCatalog();
    const results: TestResult[] = [{ title: "todo [SUR-002]", status: "skipped", report: "r.json" }];
    const cov = computeCoverage(catalog, results);
    expect(cov.entries.find((e) => e.id === "SUR-002")!.state).toBe("gap");
  });

  it("collects unknown tags that reference no catalog id", () => {
    const catalog = makeCatalog();
    const results: TestResult[] = [{ title: "ghost [SUR-999]", status: "passed", report: "r.json" }];
    const cov = computeCoverage(catalog, results);
    expect(cov.unknownTags).toEqual([{ tag: "SUR-999", title: "ghost [SUR-999]", report: "r.json" }]);
  });

  it("computes coveredPct excluding waived from the denominator", () => {
    const catalog = makeCatalog();
    // total=4, waived=1 -> denom=3; tested=1 (SUR-001), covered-by-spec=1 (SUR-004) -> 2/3 = 66.7
    const cov = computeCoverage(catalog, [{ title: "[SUR-001]", status: "passed", report: "r.json" }]);
    expect(cov.overall.coveredPct).toBeCloseTo(66.7, 1);
  });
});

describe("testedPct — declared is not proven", () => {
  it("excludes covered-by-spec from the proven number (the UCE trap)", () => {
    // ACT-001 is `status: covered` with a spec reference but NO executing test.
    // qa-tower counts it toward coveredPct — it must NOT count toward testedPct.
    const coverage = computeCoverage(makeCatalog(), [
      { title: "loads [SUR-001]", status: "passed", report: "r.json" },
    ]);
    const o = coverage.overall;

    expect(o.coveredBySpec).toBeGreaterThan(0); // declared, never executed
    expect(o.tested).toBe(1); // only SUR-001 actually ran

    // coveredPct is inflated by the declaration; testedPct is not.
    expect(o.coveredPct).toBeGreaterThan(o.testedPct);
    const denom = o.total - o.waived;
    expect(o.testedPct).toBeCloseTo((o.tested / denom) * 100, 1);
  });
});
