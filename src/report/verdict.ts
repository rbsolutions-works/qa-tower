import type { CoverageResult } from "../coverage/coverage.js";
import type { DriftResult } from "../drift/drift.js";

export interface VerdictInput {
  appName: string;
  generatedAt?: Date;
  coverage: CoverageResult;
  drift: DriftResult[];
}

export interface VerdictGap {
  id: string;
  label: string;
  category: "surfaces" | "actions" | "flows";
}

export interface VerdictJson {
  appName: string;
  generatedAt: string;
  overall: CoverageResult["overall"];
  byCategory: CoverageResult["byCategory"];
  /** Every untested catalog id, so consumers can list the exact gaps to close. */
  gaps: VerdictGap[];
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
    gaps: input.coverage.entries
      .filter((e) => e.state === "gap")
      .map((e) => ({ id: e.id, label: e.label, category: e.category })),
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

type Cat = "surfaces" | "actions" | "flows";
const CAT_LABEL: Record<Cat, string> = {
  surfaces: "Surfaces (routes)",
  actions: "Actions (RPCs)",
  flows: "Flows (journeys)",
};

/** A horizontal stacked coverage bar: covered (green) / gap (amber) / waived (grey). */
function coverageBar(s: CoverageResult["overall"]): string {
  const covered = s.tested + s.coveredBySpec;
  const total = s.total || 1;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return `<div class="bar" role="img" aria-label="${covered} covered, ${s.failing} failing, ${s.gap} gaps, ${s.waived} waived of ${s.total}">
    <span class="seg ok" style="width:${pct(covered)}"></span>
    <span class="seg fail" style="width:${pct(s.failing)}"></span>
    <span class="seg gap" style="width:${pct(s.gap)}"></span>
    <span class="seg waived" style="width:${pct(s.waived)}"></span>
  </div>`;
}

function categoryCard(cat: Cat, s: CoverageResult["overall"]): string {
  const covered = s.tested + s.coveredBySpec;
  return `<div class="cat">
    <div class="cat-head">
      <span class="cat-name">${CAT_LABEL[cat]}</span>
      <span class="cat-pct">${s.coveredPct}%</span>
    </div>
    ${coverageBar(s)}
    <div class="cat-legend">
      <span><b>${covered}</b> covered</span>
      ${s.failing ? `<span class="t-fail"><b>${s.failing}</b> failing</span>` : ""}
      <span class="t-gap"><b>${s.gap}</b> gap</span>
      ${s.waived ? `<span class="t-waived"><b>${s.waived}</b> waived</span>` : ""}
      <span class="muted">of ${s.total}</span>
    </div>
  </div>`;
}

/** The actionable section: everything still a gap, grouped by category. */
function gapsSection(coverage: CoverageResult): string {
  const gaps = coverage.entries.filter((e) => e.state === "gap");
  if (gaps.length === 0) {
    return `<section><h2>Gaps to close</h2><p class="empty">None — every catalogued item is covered or waived. 🎉</p></section>`;
  }
  const groups: Cat[] = ["surfaces", "actions", "flows"];
  const blocks = groups
    .map((cat) => {
      const items = gaps.filter((g) => g.category === cat);
      if (items.length === 0) return "";
      const rows = items
        .map(
          (g) =>
            `<li><span class="mono id">${escapeHtml(g.id)}</span> <span class="label">${escapeHtml(g.label)}</span></li>`,
        )
        .join("\n");
      return `<div class="gap-group"><h3>${CAT_LABEL[cat]} <span class="count">${items.length}</span></h3><ul class="gaps">${rows}</ul></div>`;
    })
    .join("\n");
  return `<section><h2>Gaps to close <span class="count amber">${gaps.length}</span></h2><div class="gap-groups">${blocks}</div></section>`;
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
  <div class="scroll"><table>
    <thead><tr><th>ID</th><th>Label</th><th>State</th><th>Notes</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4" class="empty">none</td></tr>'}</tbody>
  </table></div>`;
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

  const o = coverage.overall;
  const coveredTotal = o.tested + o.coveredBySpec;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>QA Verdict — ${escapeHtml(v.appName)}</title>
<style>
  :root {
    --bg:#f7f8fa; --card:#ffffff; --ink:#1a1d21; --muted:#6b7280; --line:#e5e7eb;
    --ok:#16a34a; --fail:#dc2626; --gap:#d97706; --waived:#9ca3af; --accent:#2563eb;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0f1216; --card:#171b21; --ink:#e7eaee; --muted:#9aa4b2; --line:#2a2f37; }
  }
  :root[data-theme="light"] { --bg:#f7f8fa; --card:#ffffff; --ink:#1a1d21; --muted:#6b7280; --line:#e5e7eb; }
  :root[data-theme="dark"]  { --bg:#0f1216; --card:#171b21; --ink:#e7eaee; --muted:#9aa4b2; --line:#2a2f37; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; background: var(--bg); color: var(--ink);
         margin: 0; padding: 2rem 1.25rem; line-height: 1.5; }
  .wrap { max-width: 960px; margin: 0 auto; }
  header { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: .5rem; }
  h1 { font-size: 1.25rem; margin: 0; letter-spacing: -0.01em; }
  h1 .sub { color: var(--muted); font-weight: 500; }
  .meta { color: var(--muted); font-size: .85rem; }
  h2 { font-size: 1rem; margin: 2rem 0 .75rem; }
  h3 { font-size: .92rem; margin: 1.25rem 0 .5rem; }

  .hero { display: flex; align-items: center; gap: 1.5rem; background: var(--card); border: 1px solid var(--line);
          border-radius: 14px; padding: 1.25rem 1.5rem; margin: 1.25rem 0; flex-wrap: wrap; }
  .hero .big { font-size: 3rem; font-weight: 800; letter-spacing: -0.03em; line-height: 1; }
  .hero .big small { font-size: 1rem; font-weight: 600; color: var(--muted); }
  .pill { font-weight: 700; padding: .35rem .8rem; border-radius: 999px; font-size: .9rem; }
  .pill.pass { background: color-mix(in srgb, var(--ok) 16%, transparent); color: var(--ok); }
  .pill.fail { background: color-mix(in srgb, var(--gap) 18%, transparent); color: var(--gap); }
  .hero .stats { display: flex; gap: 1.5rem; margin-left: auto; flex-wrap: wrap; }
  .hero .stats .n { font-size: 1.4rem; font-weight: 700; display: block; }
  .hero .stats .l { font-size: .72rem; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
  .n.bad { color: var(--fail); }

  .cats { display: grid; gap: .75rem; }
  .cat { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: .9rem 1.1rem; }
  .cat-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: .5rem; }
  .cat-name { font-weight: 600; }
  .cat-pct { font-weight: 800; font-size: 1.05rem; }
  .bar { display: flex; height: 10px; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--muted) 18%, transparent); }
  .seg { display: block; height: 100%; }
  .seg.ok { background: var(--ok); } .seg.fail { background: var(--fail); }
  .seg.gap { background: var(--gap); } .seg.waived { background: var(--waived); }
  .cat-legend { display: flex; gap: 1rem; flex-wrap: wrap; font-size: .82rem; color: var(--ink); margin-top: .5rem; }
  .cat-legend .t-fail { color: var(--fail); } .cat-legend .t-gap { color: var(--gap); }
  .cat-legend .t-waived, .cat-legend .muted { color: var(--muted); }

  .gap-groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; }
  .gap-group { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: .75rem 1rem; }
  .gap-group h3 { margin: .1rem 0 .5rem; }
  ul.gaps { list-style: none; margin: 0; padding: 0; }
  ul.gaps li { padding: .28rem 0; border-top: 1px solid var(--line); font-size: .87rem; display: flex; gap: .5rem; }
  ul.gaps li:first-child { border-top: 0; }
  .id { color: var(--accent); font-weight: 600; }
  .count { display: inline-block; min-width: 1.4rem; text-align: center; background: color-mix(in srgb, var(--muted) 18%, transparent);
           border-radius: 999px; font-size: .75rem; padding: 0 .4rem; font-weight: 700; }
  .count.amber { background: color-mix(in srgb, var(--gap) 20%, transparent); color: var(--gap); }

  details { margin-top: 1rem; } summary { cursor: pointer; color: var(--muted); font-size: .9rem; }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: .85rem; margin: .5rem 0 1rem; }
  th, td { text-align: left; padding: .4rem .6rem; border-bottom: 1px solid var(--line); white-space: nowrap; }
  th { color: var(--muted); font-weight: 600; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .empty { color: var(--muted); font-style: italic; }
  .badge { padding: .1rem .5rem; border-radius: 999px; font-size: .74rem; font-weight: 600; }
  .badge.ok { background: color-mix(in srgb, var(--ok) 16%, transparent); color: var(--ok); }
  .badge.fail { background: color-mix(in srgb, var(--fail) 16%, transparent); color: var(--fail); }
  .badge.gap { background: color-mix(in srgb, var(--gap) 18%, transparent); color: var(--gap); }
  .badge.waived { background: color-mix(in srgb, var(--waived) 22%, transparent); color: var(--muted); }
  footer { color: var(--muted); font-size: .78rem; margin-top: 2.5rem; text-align: center; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>QA Verdict <span class="sub">· ${escapeHtml(v.appName)}</span></h1>
    <span class="meta">generated ${escapeHtml(v.generatedAt)}</span>
  </header>

  <div class="hero">
    <div>
      <div class="big">${o.coveredPct}<small>%</small></div>
      <div class="meta">${coveredTotal} of ${o.total} catalogued items covered</div>
    </div>
    <span class="pill ${v.ok ? "pass" : "fail"}">${v.ok ? "✓ PASS" : "✗ WORK REMAINING"}</span>
    <div class="stats">
      <div><span class="n">${v.totalTests}</span><span class="l">tests run</span></div>
      <div><span class="n ${o.failing ? "bad" : ""}">${o.failing}</span><span class="l">failing</span></div>
      <div><span class="n ${o.gap ? "" : ""}">${o.gap}</span><span class="l">gaps</span></div>
      <div><span class="n ${v.driftedCount ? "bad" : ""}">${v.driftedCount}</span><span class="l">drifted</span></div>
    </div>
  </div>

  <h2>Coverage by category</h2>
  <div class="cats">
    ${categoryCard("surfaces", coverage.byCategory.surfaces)}
    ${categoryCard("actions", coverage.byCategory.actions)}
    ${categoryCard("flows", coverage.byCategory.flows)}
  </div>

  ${gapsSection(coverage)}

  <details>
    <summary>Full catalogued breakdown (${o.total} items)</summary>
    ${categoryTable("Surfaces", coverage.entries.filter((e) => e.category === "surfaces"))}
    ${categoryTable("Actions", coverage.entries.filter((e) => e.category === "actions"))}
    ${categoryTable("Flows", coverage.entries.filter((e) => e.category === "flows"))}
    <h3>Drifted source files</h3>
    <div class="scroll"><table>
      <thead><tr><th>Path</th><th>State</th><th>Owning IDs</th></tr></thead>
      <tbody>${driftRows || '<tr><td colspan="3" class="empty">none</td></tr>'}</tbody>
    </table></div>
    <h3>Unrecognized catalog tags in test titles</h3>
    <div class="scroll"><table>
      <thead><tr><th>Tag</th><th>Test title</th><th>Report</th></tr></thead>
      <tbody>${unknownRows || '<tr><td colspan="3" class="empty">none</td></tr>'}</tbody>
    </table></div>
  </details>

  <footer>Generated by qa-tower · a covered item is a route, RPC, or flow claimed by a passing test or a spec reference</footer>
</div>
</body>
</html>`;
}
