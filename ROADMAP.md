# Roadmap — qa-tower

## Phase 0 — Engine core (v0.1.0) — CURRENT

- [ ] Catalog schemas + loaders (`surfaces`, `actions`, `flows`,
      `fingerprints`) with unique-ID registry
- [ ] Coverage: Vitest + Playwright JSON report parsing, ID tag matching,
      per-category accounting
- [ ] Drift: fingerprint check via `git hash-object`
- [ ] db-guard: generalized deny-list / local-only assertion
- [ ] Report: `qa-verdict.html` + `qa-verdict.json` (coverage + drift v0)
- [ ] CLI: `qa validate | coverage | drift | verdict`
- [ ] Engine unit tests green; `docs/catalog-format.md` written
- [ ] Tagged `v0.1.0`, consumable as a git dependency

## Phase 1 — First consumer proven (UCE)

- [ ] UCE catalog generated + curated; `qa coverage` prints an honest
      gap report in UCE CI
- [ ] UCE unit + RPC layers report through qa-tower
- [ ] db-guard is UCE's single shared prod-DB protection

## Phase 2 — Hardening

- [ ] Verdict v1: visual-diff thumbnails, layer timings, trend vs last run
- [ ] Coverage policies (fail on unwaived gaps; category thresholds)
- [ ] Error handling for malformed reports; operator docs

## Phase 3 — Second consumer + mobile

- [ ] Extract lessons from UCE into template docs; onboard a second app
- [ ] Mobile-native layer guidance (Maestro/Detox) once a real RN app exists

## Out of Scope (for now)

- Running tests itself (Vitest/Playwright remain the runners)
- Cloud dashboards / paid visual-diff services
- AI-driven exploratory testing as a CI gate (stays a manual practice)
