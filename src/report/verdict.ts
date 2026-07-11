import type { CoverageResult } from "../coverage/coverage.js";
import type { DriftResult } from "../drift/drift.js";

export interface VerdictInput {
  appName: string;
  generatedAt?: Date;
  coverage: CoverageResult;
  drift: DriftResult[];
}

export interface VerdictJson {
  appName: string;
  generatedAt: string;
  overall: CoverageResult["overall"];
  byCategory: CoverageResult["byCategory"];
  totalTests: number;
  unknownTagCount: number;
  driftedCount: number;
  ok: boolean;
}

export function buildVerdictJson(input: VerdictInput): VerdictJson {
  const driftedCount = input.drift.filter((d) => d.drifted).length;
  return {
    appName: input.appName,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    overall: input.coverage.overall,
    byCategory: input.coverage.byCategory,
    totalTests: input.coverage.totalTests,
    unknownTagCount: input.coverage.unknownTags.length,
    driftedCount,
    ok: input.coverage.overall.failing === 0 && input.coverage.overall.gap === 0 && driftedCount === 0,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stateBadge(state: string): string {
  const cls =
    state === "tested" || state === "covered-by-spec"
      ? "ok"
      : state === "failing"
        ? "fail"
        : state === "waived"
          ? "waived"
          : "gap";
  return `<span class="badge ${cls}">${escapeHtml(state)}</span>`;
}

function categoryTable(title: string, entries: CoverageResult["entries"]): string {
  const rows = entries
    .map(
      (e) => `<tr>
        <td class="mono">${escapeHtml(e.id)}</td>
        <td>${escapeHtml(e.label)}</td>
        <td>${stateBadge(e.state)}</td>
        <td>${e.waivedReason ? escapeHtml(e.waivedReason) : ""}</td>
      </tr>`,
    )
    .join("\n");
  return `<h3>${escapeHtml(title)}</h3>
  <table>
    <thead><tr><th>ID</th><th>Label</th><th>State</th><th>Notes</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4" class="empty">none</td></tr>'}</tbody>
  </table>`;
}

/** Render a single self-contained HTML file — no external assets, works offline. */
export function renderVerdictHtml(input: VerdictInput): string {
  const v = buildVerdictJson(input);
  const { coverage, drift } = input;

  const driftRows = drift
    .filter((d) => d.drifted)
    .map(
      (d) => `<tr>
        <td class="mono">${escapeHtml(d.path)}</td>
        <td>${d.missing ? "missing" : "changed"}</td>
        <td class="mono">${escapeHtml(d.owners.join(", ") || "—")}</td>
      </tr>`,
    )
    .join("\n");

  const unknownRows = coverage.unknownTags
    .map(
      (u) => `<tr>
        <td class="mono">${escapeHtml(u.tag)}</td>
        <td>${escapeHtml(u.title)}</td>
        <td class="mono">${escapeHtml(u.report)}</td>
      </tr>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>QA Verdict — ${escapeHtml(v.appName)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, system-ui, sans-serif; margin: 2rem; max-width: 960px; }
  h1 { margin-bottom: 0.2rem; }
  .meta { color: #888; margin-bottom: 1.5rem; }
  .verdict { font-size: 1.4rem; font-weight: 600; padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1.5rem; }
  .verdict.pass { background: #14532d22; color: #16a34a; }
  .verdict.fail { background: #7f1d1d22; color: #dc2626; }
  .summary { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 2rem; }
  .stat { border: 1px solid #8884; border-radius: 8px; padding: 0.75rem 1rem; min-width: 120px; }
  .stat .n { font-size: 1.6rem; font-weight: 700; display: block; }
  .stat .l { font-size: 0.8rem; color: #888; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; font-size: 0.9rem; }
  th, td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid #8883; }
  .mono { font-family: ui-monospace, monospace; }
  .empty { color: #888; font-style: italic; }
  .badge { padding: 0.1rem 0.5rem; border-radius: 999px; font-size: 0.78rem; font-weight: 600; }
  .badge.ok { background: #16a34a22; color: #16a34a; }
  .badge.fail { background: #dc262622; color: #dc2626; }
  .badge.gap { background: #f59e0b22; color: #d97706; }
  .badge.waived { background: #6b728022; color: #6b7280; }
</style>
</head>
<body>
  <h1>QA Verdict — ${escapeHtml(v.appName)}</h1>
  <div class="meta">generated ${escapeHtml(v.generatedAt)}</div>
  <div class="verdict ${v.ok ? "pass" : "fail"}">${v.ok ? "✓ PASS" : "✗ NOT PASSING"}</div>

  <div class="summary">
    <div class="stat"><span class="n">${coverage.overall.coveredPct}%</span><span class="l">coverage</span></div>
    <div class="stat"><span class="n">${coverage.overall.tested + coverage.overall.coveredBySpec}</span><span class="l">tested</span></div>
    <div class="stat"><span class="n">${coverage.overall.failing}</span><span class="l">failing</span></div>
    <div class="stat"><span class="n">${coverage.overall.gap}</span><span class="l">gaps</span></div>
    <div class="stat"><span class="n">${coverage.overall.waived}</span><span class="l">waived</span></div>
    <div class="stat"><span class="n">${v.driftedCount}</span><span class="l">drifted files</span></div>
    <div class="stat"><span class="n">${v.totalTests}</span><span class="l">tests run</span></div>
  </div>

  ${categoryTable("Surfaces", coverage.entries.filter((e) => e.category === "surfaces"))}
  ${categoryTable("Actions", coverage.entries.filter((e) => e.category === "actions"))}
  ${categoryTable("Flows", coverage.entries.filter((e) => e.category === "flows"))}

  <h3>Drifted source files</h3>
  <table>
    <thead><tr><th>Path</th><th>State</th><th>Owning IDs</th></tr></thead>
    <tbody>${driftRows || '<tr><td colspan="3" class="empty">none</td></tr>'}</tbody>
  </table>

  <h3>Unrecognized catalog tags in test titles</h3>
  <table>
    <thead><tr><th>Tag</th><th>Test title</th><th>Report</th></tr></thead>
    <tbody>${unknownRows || '<tr><td colspan="3" class="empty">none</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}
