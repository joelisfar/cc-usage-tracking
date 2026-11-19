# Claude Code usage tracker

Replaces a spreadsheet that tracks monthly Claude Code spend against a linear pace. SvelteKit + Tailwind + shadcn-svelte, no database.

## Data

- One JSON file per month: `data/months/YYYY-MM.json` (gitignored; override the folder with `USAGE_DATA_DIR`) = `{ month, allotment, target?, days: [{ date, workday, usage }] }`.
- `days` holds every calendar day. `workday` is false for weekends and days off and true otherwise; only workdays count toward the pace. `usage` is `null` until logged, and only workdays can hold usage. A day with usage can't be marked off (clear it first).
- The app shows workdays only by default; a "Show all days" checkbox reveals the rest so they can be toggled.
- Everything else (linear/actual running totals, remaining, the Values panel) is computed in `src/lib/calc.ts`. Never store computed values.
- Linear pace = `allotment / workdays * dayIndex`.
- `target` is optional: a percent of the allotment to aim for (e.g. 80). When set, the chart gets a dashed target line (`budget / workdays * dayIndex`, budget = allotment * target%) and every Month summary stat (daily target, % of target, linear difference, remaining, remaining per day) is measured against the budget instead of the allotment. The Daily log table's linear/remaining columns still use the full allotment. `new-month` carries the latest month's target forward.

## Updating data (agents)

Use the CLI, not hand edits: `node scripts/usage.ts <show|list|set|clear|allotment|target|workday|weekdays|new-month>` (Node 22 runs the `.ts` directly).

**Source of truth for daily usage:** the claude.ai usage page (Settings > Usage > "Daily spend by product"). Its days are UTC and are used as-is for tracker dates (the bar "Nov 3 (UTC)" is the 2026-11-03 row). In the author's account the monthly spend limit resets at the UTC month boundary too. Don't derive daily usage from the `get_usage` month-to-date number; it doesn't line up with those days.

Project skills in `.claude/skills/`: `new-month`, `log-usage`, `sync-daily-usage`, `setup-daily-sync` (one-time setup of the scheduled daily sync).

## App

- `pnpm demo` runs the app on fake data at http://localhost:5174 (seeded into `.demo-data/`, never touches `data/months/`).
- `pnpm dev` then http://localhost:5173 (shows the latest month at `/`; `/YYYY-MM` for a specific one).
- `pnpm check` for types, `pnpm test` for unit tests.
- Imports use the `#lib/...` alias (package.json `imports`), not `$lib`.
- shadcn-svelte CLI is interactive in `init`; use `pnpm dlx shadcn-svelte@latest add -y <component>` for components.
