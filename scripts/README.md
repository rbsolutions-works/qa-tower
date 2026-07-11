# Scripts

Deterministic execution. If a step is repeated more than once, or if
correctness matters, it should live as a script here rather than as a
prompt to the agent.

Conventions:

- Prefer Python (per user preferences).
- Secrets read from `.env`, never hardcoded.
- Each script should be runnable standalone (`python scripts/foo.py --help`).
- Document non-obvious behavior at the top of the file.
