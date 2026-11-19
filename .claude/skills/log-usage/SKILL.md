---
name: log-usage
description: Log or correct a day's Claude Code spend, or change a month's allotment, in the usage tracker. Use when the user says "log $23.50 for yesterday", "fix Tuesday to 41.10", "clear Sep 4", "the October allotment is 520", or asks how the month is going.
---

# Log usage

Daily usage is the only value edited each day (plus the occasional allotment change). Everything else is computed. Run commands from the repo root.

## Commands

| Intent | Command |
| --- | --- |
| Set a day | `node scripts/usage.ts set 2026-10-14 41.10` |
| Clear a day | `node scripts/usage.ts clear 2026-10-14` |
| Change allotment | `node scripts/usage.ts allotment 2026-10 520` |
| Set or remove the target (% of allotment to aim for) | `node scripts/usage.ts target 2026-11 80` / `target 2026-11 off` |
| Mark a day off / back on | `node scripts/usage.ts workday 2026-10-14 off` (or `on`) |
| Check pace | `node scripts/usage.ts show [YYYY-MM] [--all]` |
| Auto-fill from the claude.ai daily chart | see the `sync-daily-usage` skill |

## Rules

- Resolve relative dates ("yesterday", "Tuesday") against today's date, and use the previous **workday** when yesterday was a weekend or day off. The CLI rejects usage on a day that is not a workday; if it does, tell the user and ask whether to mark that day as a workday (`workday <date> on`, which changes the linear pace) rather than picking another day. A day with usage logged can't be marked off until its usage is cleared. Marking a day on or off changes the daily allotment, so report the new pace.
- `set` overwrites. If the day already has a value that differs, say what it was before changing it.
- After any change, run `show` and report the one-line summary (used vs linear pace, remaining per day).
- Do not hand-edit `data/months/*.json` for routine updates; the CLI validates and rounds.
