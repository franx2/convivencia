@AGENTS.md

## gstack

This project uses [gstack](https://github.com/garrytan/gstack) for AI-assisted workflows.
It is installed globally at `~/.claude/skills/gstack`.

Workflow: **Think → Plan → Build → Review → Test → Ship → Reflect**.

Key skills (available as slash commands after restarting the AI coding tool):

- `/office-hours` — interrogate the product with forcing questions (Think).
- `/autoplan`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review` — structured planning.
- `/review` — staff-engineer code audit with fixes.
- `/qa` — live browser testing + regression tests.
- `/cso` — security audit (OWASP Top 10 + STRIDE).
- `/ship` — PR automation with coverage audit.
- `/browse` — real Chromium control (use for all web browsing).

Use `~/.claude/skills/gstack/...` for gstack file paths (the global install).
