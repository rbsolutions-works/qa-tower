# qa-tower

A reusable TypeScript framework for fully testing an application: a
machine-readable scenario catalog, coverage accounting, source-drift
detection, database safety guard, and a single QA-verdict report — the
engine; each app under test brings its own catalog data and tests.

## Purpose

Apps accumulate features faster than anyone can honestly answer "is all
of this tested?". qa-tower makes the answer machine-checked: every
surface, action, and flow gets a catalog ID; tests claim IDs in their
titles; coverage is computed, not remembered. First consumer:
urgent-cargo-express (UCE).

## What it provides

| Module | Does |
| --- | --- |
| `catalog` | zod-validated YAML catalog: surfaces (SUR-###), actions (ACT-###), flows (FLW-###) with per-role expectations and `gap/covered/waived` status |
| `coverage` | parses Vitest + Playwright JSON reports, matches `[SUR-001]`-style tags in test titles against the catalog, reports tested / gap / waived per category |
| `drift` | `git hash-object` fingerprints of load-bearing source files vs `fingerprints.yaml`; drifted file → owning catalog IDs |
| `db-guard` | refuses connection targets that match a deny-list or aren't local; extracted from the 2026-06-11 UCE prod-wipe incident guard |
| `report` | renders `qa-verdict.html` — coverage %, per-layer pass/fail, gaps, drift |
| `cli` | `qa validate · coverage · drift · verdict` |

## Layout

```
CLAUDE.md         Operating contract        ARCHITECTURE.md  Design
README.md         This file                 ROADMAP.md       Milestones
src/              Engine code (app-agnostic — see boundary rule in CLAUDE.md)
tests/            Engine unit tests (Vitest)
docs/             Catalog format spec + consumer integration guide
scripts/          Deterministic scripts
```

Project state (`status/`, `memory/`) lives in the vault at
`/Users/rbatitis/Obsidian-Vault/50-Memory/Projects/qa-tower/`.

## Consuming qa-tower

```jsonc
// package.json of the app under test
"devDependencies": { "qa-tower": "github:rbsolutions-works/qa-tower#v0.1.0" }
```

Then: write `qa/catalog/*.yaml` (see `docs/catalog-format.md`), tag test
titles with catalog IDs, and run `npx qa coverage --catalog qa/catalog`.

## Development

```
npm install     # installs deps, builds dist/ via prepare
npm test        # engine unit tests
npm run build   # tsc → dist/
```
