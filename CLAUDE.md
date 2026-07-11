# QA Tower — Operating Contract

You are working inside the **qa-tower** project, coordinated by Andie
(`/Users/rbatitis/Claude/Andie/`). Andie's global operating contract
still applies; this file adds the project specifics.

## Project Identity

- **What it is:** A reusable, typed-TypeScript application-testing
  framework — the *engine* behind Randell's "fully test any app" system.
  It defines a machine-readable **scenario catalog** (surfaces × roles ×
  actions × flows with expected outcomes), computes **coverage** by
  cross-referencing catalog IDs embedded in test titles against
  Vitest/Playwright JSON reports, detects **source drift** via git blob
  fingerprints, refuses forbidden databases (**db-guard**), and renders a
  single **QA verdict** HTML report.
- **Why it exists:** so every app under test (first consumer:
  **urgent-cargo-express**) answers "is everything tested, and does it
  all pass?" from one honest, machine-checked place instead of tribal
  knowledge.
- **What it is NOT:** a test runner. Vitest/Playwright run the tests;
  qa-tower supplies the catalog, accounting, safety, and reporting
  around them.
- **Definition of done (v1):** UCE consumes qa-tower from a tagged git
  release; `qa coverage` prints an honest gap report from UCE's catalog;
  `qa drift` pins load-bearing sources; db-guard is the single shared
  prod-DB protection; verdict HTML rolls up all layers.
- **Business gate:** internal tool — exempt (stated per project
  standards).

## Boundary rule (the reason this repo exists)

Everything in `src/` must stay **application-agnostic**. Nothing here may
name a UCE route, role, RPC, database ref, or credential. App-specific
content (catalog YAML, deny-listed DB refs, test suites) lives in the
consumer repo. If a change needs app knowledge, it belongs in the
consumer.

## Guardrails (inherited from Andie — non-negotiable)

1. **Read context first.** Load
   `/Users/rbatitis/Obsidian-Vault/50-Memory/Projects/qa-tower/status/NEXT_ACTION.md`,
   `.../status/BUILD_STATUS.md`, and this file before acting.
2. **Confirm before destructive or outbound operations.** Deletes,
   force-pushes, publishes, releases — show what will change, wait for
   explicit "yes".
3. **Persist state at end of meaningful work** to the vault paths below.
4. **Ask when uncertain.**
5. **Log significant decisions** →
   `.../50-Memory/Projects/qa-tower/memory/decisions.md`; side-effectful
   ops → `storage/audit.jsonl`.

## Project state location

`/Users/rbatitis/Obsidian-Vault/50-Memory/Projects/qa-tower/`
(`status/` + `memory/`). The project folder holds code and design docs
only.

## Tech Stack & Defaults

- TypeScript (strict), Node ≥ 20, ESM.
- `zod` for schema validation; `yaml` for catalog parsing.
- Vitest for the engine's own tests.
- Consumed as a git-dependency npm package (`qa-tower`); `dist/` is built
  by tsc via `prepare` so consumers install straight from the git URL.
- No runtime network calls; no secrets; the engine never opens a
  database connection (db-guard only *validates* connection targets).

## Layout exceptions

- `tasks/` unused — work is tracked in the consumer projects' roadmaps
  and this repo's ROADMAP.md.
- No Docker — pure library, nothing to containerize.
