import { describe, it, expect } from "vitest";
import { computeCoverage } from "../src/coverage/coverage.js";
import { buildVerdictJson, renderVerdictHtml } from "../src/report/verdict.js";
import type { Catalog } from "../src/catalog/schema.js";

function makeCatalog(): Catalog {
  const surfaces = [
    { id: "SUR-001", route: "/a", roles: {}, source: [], status: "gap" as const, specs: [] },
  ];
  const byId = new Map();
  for (const s of surfaces) byId.set(s.id, s);
  return { surfaces, actions: [], flows: [], fingerprints: [], byId };
}

describe("buildVerdictJson", () => {
  it("is ok:false when there are gaps", () => {
    const coverage = computeCoverage(makeCatalog(), []);
    const v = buildVerdictJson({ appName: "test-app", coverage, drift: [] });
    expect(v.ok).toBe(false);
    expect(v.appName).toBe("test-app");
  });

  it("is ok:true when everything is tested and nothing drifted", () => {
    const coverage = computeCoverage(makeCatalog(), [
      { title: "[SUR-001]", status: "passed", report: "r.json" },
    ]);
    const v = buildVerdictJson({ appName: "test-app", coverage, drift: [] });
    expect(v.ok).toBe(true);
  });

  it("is ok:false when a fingerprinted file has drifted", () => {
    const coverage = computeCoverage(makeCatalog(), [
      { title: "[SUR-001]", status: "passed", report: "r.json" },
    ]);
    const v = buildVerdictJson({
      appName: "test-app",
      coverage,
      drift: [{ path: "a.ts", owners: [], expected: "x", actual: "y", drifted: true, missing: false }],
    });
    expect(v.ok).toBe(false);
    expect(v.driftedCount).toBe(1);
  });
});

describe("renderVerdictHtml", () => {
  it("renders a self-contained HTML document embedding the app name and entries", () => {
    const coverage = computeCoverage(makeCatalog(), []);
    const html = renderVerdictHtml({ appName: "My App & Co", coverage, drift: [] });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("My App &amp; Co");
    expect(html).toContain("SUR-001");
    expect(html).not.toContain("<script"); // no external/inline scripts needed
  });

  it("renders the dashboard chrome: hero %, per-category bars, and a gaps section", () => {
    const coverage = computeCoverage(makeCatalog(), []); // SUR-001 is a gap
    const html = renderVerdictHtml({ appName: "Demo", coverage, drift: [] });
    expect(html).toContain('class="hero"');
    expect(html).toContain('class="bar"'); // per-category coverage bar
    expect(html).toContain("Coverage by category");
    expect(html).toContain("Gaps to close");
    expect(html).toContain("prefers-color-scheme"); // theme-aware
    expect(html).toContain("viewport"); // responsive
  });

  it("celebrates when there are no gaps", () => {
    const coverage = computeCoverage(makeCatalog(), [
      { title: "[SUR-001]", status: "passed", report: "r.json" },
    ]);
    const html = renderVerdictHtml({ appName: "Demo", coverage, drift: [] });
    expect(html).toContain("every catalogued item is covered");
  });
});
