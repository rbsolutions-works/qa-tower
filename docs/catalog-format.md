# Catalog format

A catalog is a directory (conventionally `qa/catalog/`) with up to four
YAML files, each a top-level array. Missing files are treated as empty.

## `surfaces.yaml` — routes/pages

```yaml
- id: SUR-031
  route: /admin/onward
  roles:
    admin: allow
    sg_office: deny
    regional_driver: deny
  source: [src/web/app/(app)/admin/onward/page.tsx]
  visual: true
  status: gap          # gap | covered | waived
```

## `actions.yaml` — RPCs / server actions / commands

```yaml
- id: ACT-041
  name: handover_to_line
  kind: rpc
  roles:
    regional_driver: allow
    admin: deny
  source: [src/db/migrations/076_onward_leg.sql]
  status: covered
  specs: [src/web/tests/rpc/onward.test.ts]
```

## `flows.yaml` — business flows spanning multiple surfaces/actions

```yaml
- id: FLW-09
  title: Onward shipping-line handover and last-mile delivery
  steps:
    - driver hands cargo to shipping line (handover_to_line)
    - destination agent scans Truck QR (agent_receive_truck)
    - agent completes last-mile delivery
  status: covered
  specs: [src/web/e2e/scenarios/23-onward-handover.spec.ts]
```

## `fingerprints.yaml` — drift detection

```yaml
- path: src/web/lib/status.ts
  hash: 8f3a1c2b9e...     # `git hash-object <path>`
  owners: [FLW-01, ACT-002, ACT-003]
```

`qa drift` re-hashes each `path` (relative to `--cwd`) and reports any
file whose current git blob hash no longer matches — along with every
catalog ID that names it as an owner, so reviewers know what to
re-verify.

## Shared fields

Every entry in `surfaces.yaml` / `actions.yaml` / `flows.yaml` accepts:

| Field | Meaning |
| --- | --- |
| `id` | `SUR-###` / `ACT-###` / `FLW-###`, unique across the whole catalog |
| `title` | optional human label |
| `source` | file paths the entry's behavior lives in |
| `status` | `gap` (default) \| `covered` \| `waived` |
| `waived_reason` | required when `status: waived` |
| `specs` | file paths that cover this entry (used when no test tags the ID directly) |
| `notes` | free text |

## How tests claim an ID

Embed the ID in the test title, in square brackets, anywhere:

```ts
test("driver cannot confirm-load twice [ACT-041] [FLW-09]", async () => { ... });
```

`qa coverage` parses Vitest/Jest and Playwright JSON reporter output,
extracts `[ID]` tags from every test title, and joins them against the
catalog:

- a passing tagged test → `tested`
- a failing tagged test → `failing` (wins over any passing claim)
- no tagged test, but `status: covered` + `specs` set → `covered-by-spec`
- `status: waived` (with reason) and no tagged test → `waived`
- otherwise → `gap`

Run tests with a JSON reporter and point qa-tower at the output files:

```bash
npx vitest run --reporter=json --outputFile=vitest-report.json
npx playwright test --reporter=json > playwright-report.json

npx qa coverage --catalog qa/catalog \
  --report vitest-report.json --report playwright-report.json
```
