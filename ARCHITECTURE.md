# Architecture — qa-tower

## Overview

qa-tower is a pure library + CLI. It never runs tests and never opens a
database connection. It reads three kinds of input — catalog YAML, test
runner JSON reports, and git blob hashes — and produces three kinds of
output — validation errors, coverage accounting, and an HTML verdict.
Guarantee: the coverage numbers are *derived*, never asserted by hand.

## Components

```
 consumer repo (e.g. UCE)                      qa-tower (this repo)
┌───────────────────────────┐                ┌────────────────────────────┐
│ qa/catalog/*.yaml         │──── load ─────▶│ catalog/  zod schemas,     │
│  surfaces / actions /     │                │           loaders, ID      │
│  flows / fingerprints     │                │           registry         │
├───────────────────────────┤                ├────────────────────────────┤
│ vitest/playwright JSON    │──── parse ────▶│ coverage/ tag extractor +  │
│ reports (test titles      │                │           catalog matcher  │
│ carry [SUR-###] tags)     │                ├────────────────────────────┤
├───────────────────────────┤                │ drift/    git hash-object  │
│ git worktree              │──── hash ─────▶│           vs fingerprints  │
├───────────────────────────┤                ├────────────────────────────┤
│ DB connection env         │─── validate ──▶│ db-guard/ deny-list +      │
│ (host/ref/user)           │                │           local-only check │
└───────────────────────────┘                ├────────────────────────────┤
                                             │ report/   qa-verdict.html  │
                                             ├────────────────────────────┤
                                             │ cli.ts    validate·coverage│
                                             │           ·drift·verdict   │
                                             └────────────────────────────┘
```

## Data model (catalog)

- **Surface** `SUR-###` — a route/page: `route`, per-role expectation
  (`allow | deny`), `source[]` files, `visual` flag, `status`.
- **Action** `ACT-###` — an RPC / server action / command: `name`,
  `kind`, per-role expected outcome, `source[]`, `status`.
- **Flow** `FLW-###` — a business flow: `title`, ordered `steps`,
  `specs[]` that cover it, `status`.
- `status: gap | covered | waived` — `covered` requires ≥1 passing test
  claiming the ID *or* explicit spec references; `waived` requires a
  `reason`.
- **Fingerprint** — `path` + git blob `hash` + `owners[]` (catalog IDs
  that must be reviewed when the file drifts).

IDs are unique across a catalog; tests claim them by embedding
`[SUR-012]` / `[ACT-034]` / `[FLW-05]` in the test title. Both Vitest
(`--reporter=json`) and Playwright (`--reporter=json`) expose full
titles, so one extractor serves every layer.

## Data flow (verdict)

1. `qa validate` — load + zod-parse all catalog files; duplicate/malformed
   IDs fail.
2. Test layers run (in the consumer's CI): Vitest unit, Vitest RPC,
   Playwright e2e/visual — each writing a JSON report.
3. `qa coverage` — extract claimed IDs from report titles; join with the
   catalog; classify every entry tested / gap / waived; per-category
   totals; nonzero exit on unwaived gaps (policy flag).
4. `qa drift` — re-hash fingerprinted files; list drifted files with the
   catalog IDs they own; nonzero exit when drifted.
5. `qa verdict` — merge 1–4 into `qa-verdict.html` (single file, no
   external assets) + a machine `qa-verdict.json`.

## db-guard

Generalized from UCE's `e2e/helpers/sql.ts` (written after the
2026-06-11 incident where an e2e cleanup wiped prod):

- `assertSafeDbTarget({ host, user, database, denyRefs, allowHosts, allowRemoteEnv })`
- Deny-list match anywhere in host/user/database → **hard throw, no
  override**.
- Non-allow-listed host → throw unless an explicitly named env opt-in is
  set (consumer names it; default none).
- Pure function — consumers call it before constructing any client.

## Storage

- None at runtime. The engine is stateless; all state (catalog, reports,
  baselines) lives in the consumer repo.

## External Dependencies

- `zod`, `yaml` (runtime); `typescript`, `vitest`, `tsx` (dev).
- `git` binary must be on PATH for `drift` (uses `git hash-object`).

## Defaults

- TypeScript strict, ESM, Node ≥ 20.
- Tests and documentation as first-class artifacts.
- Application-agnostic boundary rule (see CLAUDE.md).
