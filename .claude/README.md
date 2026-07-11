# Per-Project Claude Code Config

This directory holds project-scoped Claude Code configuration. Andie's
global config (operating contract, specialist agents, slash commands,
SessionStart hook) lives at `~/.claude/` and applies to every session
in addition to these per-project overrides.

## Files

- `settings.json` — Project permissions: broadly-allowed reads of
  project content; denies for secrets and destructive ops. Add to it
  as you discover per-project tool patterns you want pre-approved.
- `settings.local.json` (gitignored, not present yet) — Personal
  per-project overrides. Create this for machine-specific or
  experimental config you don't want to share via git.

## What you might add later

- **`hooks/`** — project-level hooks. The biggest win is usually a
  `PostToolUse` hook on `Write|Edit` that appends a JSONL row to
  `storage/audit.jsonl` (Andie's audit-log convention; see
  `~/.claude/CLAUDE.md` Guardrail 5).
- **`agents/`** — project-specific subagents that wouldn't make sense
  globally. Most agents belong globally at `~/.claude/agents/`; reserve
  this for ones uniquely scoped to this project.
- **`skills/`** — project-specific slash commands. Same logic: most
  belong globally; only put one here if it's only useful in this repo.

## Conventions

- Read permissions: broad inside the project; denied for `.env`,
  secrets, and credential files.
- Write/Edit permissions: still prompt by default; add explicit allow
  rules per-directory as patterns emerge.
- Hook scripts go in `.claude/hooks/<name>.sh`; reference them as
  `${CLAUDE_PROJECT_DIR}/.claude/hooks/<name>.sh` in `settings.json`.
