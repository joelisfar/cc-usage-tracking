# Claude Code usage tracker

A small local app that tracks monthly Claude Code spend against an even per-workday pace (and an optional target), so you can see at a glance whether you are ahead of or behind budget. It replaces a spreadsheet. SvelteKit + Tailwind + shadcn-svelte, no database: each month is one JSON file.

- Chart of the actual running total against the linear pace (and a dashed target line if you set one).
- Daily log showing the last 7 days, with a month summary (remaining, remaining per day, % of target) and a History card.
- Weekends and days off don't count toward the pace (the daily sync turns one back on if it had real spend).
- **Optional daily auto-sync:** a scheduled Claude Code task reads claude.ai's "Daily spend by product" chart each weekday and logs the closed days for you.

## Quick start

Needs Node 22.18+ and [pnpm](https://pnpm.io).

```sh
pnpm install
pnpm demo      # fake data at http://localhost:5174, so you can look around first
```

For your own data:

```sh
pnpm dev       # http://localhost:5173
node scripts/usage.ts new-month 2026-11 500 --off 2026-11-26,2026-11-27 --target 80
node scripts/usage.ts set 2026-11-02 17.58
node scripts/usage.ts show
```

The app shows the latest month at `/` and any month at `/YYYY-MM`.

## Let your agent set it up (including the daily check)

Open [Claude Code](https://claude.com/claude-code) (the desktop app, for the scheduled part) in this repo and say:

> Set up the usage tracker and the daily sync.

That runs the [`setup-daily-sync`](.claude/skills/setup-daily-sync/SKILL.md) skill. It checks your Node and pnpm, creates the current month (asking for your allotment, optional target and days off), proves it can read your claude.ai usage chart, does one real sync, and then creates the weekday scheduled task, asking before it does.

What the daily sync needs:

- Claude Code in the Claude desktop app. Scheduled tasks run while the app is open; a missed run fires on the next launch.
- The Claude in Chrome extension, with Chrome signed in to claude.ai. The sync reads the chart in your own browser session and only reads; it never changes claude.ai settings.

Without the desktop app you can still say "sync usage" any time to run the [`sync-daily-usage`](.claude/skills/sync-daily-usage/SKILL.md) skill by hand, or log a day yourself ("log $23.50 for yesterday").

Other project skills: [`new-month`](.claude/skills/new-month/SKILL.md) and [`log-usage`](.claude/skills/log-usage/SKILL.md).

## Days are UTC days

claude.ai's daily spend chart uses UTC days, and the tracker uses them as-is so its numbers line up with the chart. In the Americas that means a "day" ends in the evening (6 PM or 7 PM Central); the app shows the boundary in your own time zone under the Daily log. In the author's account the monthly spend limit resets at the UTC month boundary too; check the reset date on your own Usage page.

## Your data

Each month lives in `data/months/YYYY-MM.json`:

```json
{ "month": "2026-11", "allotment": 500, "target": 80, "days": [{ "date": "2026-11-02", "workday": true, "usage": 17.58 }] }
```

- `data/months/*.json` is **gitignored**, so your spend doesn't end up in a fork. Remove that line from `.gitignore` if you want to track it in a private repo.
- Set `USAGE_DATA_DIR` to keep the files somewhere else (a synced folder, for example).
- Only `usage` and the `workday` flags are stored. Running totals, pace and remaining are always computed (`src/lib/calc.ts`), never saved.
- Edit with the CLI (`node scripts/usage.ts`, see its header for every command) or the app, not by hand; both validate and round.

## How the pace works

- Linear pace = `allotment / workdays * dayIndex`.
- If a `target` percent is set (for example 80), the chart gets a dashed line at `allotment * target% / workdays * dayIndex`, and the Month summary stats are measured against that budget instead of the full allotment.

## Development

```sh
pnpm check   # types
pnpm test    # unit tests (synthetic fixtures in src/lib/fixtures)
pnpm build
```

The app is meant to run on your own machine (`pnpm dev` or `pnpm build && pnpm preview`). It has no authentication, so don't expose it to a network you don't trust.

## License

[MIT](LICENSE)
