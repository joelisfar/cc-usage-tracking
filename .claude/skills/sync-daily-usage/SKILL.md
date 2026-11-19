---
name: sync-daily-usage
description: Fill in the tracker's daily usage from the claude.ai usage page's daily spend chart. Use for the weekday scheduled run, or when the user says "sync usage", "fill in yesterday", "update from claude.ai".
---

# Sync daily usage

**Source of truth: the claude.ai daily spend chart** (Settings > Usage > "Daily spend by product"). Its day boundaries are UTC and they are the tracker's day boundaries: the chart's "Nov 3 (UTC)" bar is the tracker's 2026-11-03 row, no conversion. In the author's account the monthly spend limit also resets at the UTC month boundary, so a UTC month = a tracker month. Confirm the reset date on your own Usage page the first time.

Do **not** derive daily usage from `get_usage` month-to-date spend. It doesn't line up with the chart's UTC days (it ran about $11 higher than the chart's daily sum on 2026-11-05) and it would lump any gap into one day.

## Which days to fill

Run from the repo root. A UTC day is final once it has ended (00:00 UTC), so:

1. Get today's UTC date: `date -u +%Y-%m-%d`. The target is **every UTC date before that** in the current UTC month that has `usage: null`, whether or not the tracker currently treats it as a workday (weekends and days off can have real spend, e.g. Friday evening in the Americas lands on Saturday UTC). Check with `node scripts/usage.ts show --all`. This also backfills any missed run.
2. Never fill a date whose tooltip says "in progress".
3. If the UTC date is the 1st, the dates to fill are in the previous month: pick the previous month in the chart's date-range dropdown and read those instead. Use that month's file.

## Reading the chart (Claude in Chrome)

Requires the Claude in Chrome extension, signed in to claude.ai. Use the `chrome-browser` skill: load the Chrome tools, `tabs_context_mcp`, open a **new** tab, close it when done.

1. Navigate to `https://claude.ai/new#settings/usage`. The Settings modal opens on Usage. Wait about 4 seconds for the chart to load.
2. Check it shows **Daily** (not Weekly), **Group by Product**, and the current month's range (e.g. "November 1 - 5"). Screenshot to confirm.
3. For each target date, hover its bar and zoom on the chart to read the tooltip: `<Mon D> (UTC)` then `Claude Code: $X` and `Total: $X`. Use **Total**. Hover mid-bar vertically; for a short bar hover just above the axis. Use `browser_batch` to hover + zoom for all bars in one call.
4. A date with no bar means $0.00.

If you're not signed in, the page doesn't load, or the Chrome extension isn't connected, stop and report that. Do not guess or fall back to another number.

## Writing

```bash
node scripts/usage.ts set 2026-11-04 7.11
```

- Workday with spend: `set` it. A workday with no bar: `set ... 0` (so it counts as logged and isn't refilled).
- **Non-workday (weekend or day off) with spend > 0**: turn it on as a workday, then log it:
  ```bash
  node scripts/usage.ts workday 2026-11-07 on
  node scripts/usage.ts set 2026-11-07 4.20
  ```
  This is intended: a day with activity counts as a workday. It changes the month's daily allotment, so mention the new pace in the report. A non-workday with no bar stays off and is left alone.
- If a day already has a different value, say what it was before overwriting, unless it was filled from an "in progress" read earlier.

## Report

Run `node scripts/usage.ts show` and give one short summary: which dates were filled and the amounts, any non-workday that was turned on because it had spend, and the used vs linear pace. Also compare the tracker's total used to the "$X of $Y spent" headline on the same page. The headline updates in real time and includes the current UTC day, whose chart bar lags, so the headline is expected to be higher than the tracker by roughly that in-progress day's spend. Mention the gap in one line, and flag it only if it is much larger than a typical day's spend (say 3x or more), which would mean a closed day is wrong or missing.

## Rules

- Read-only on claude.ai: never click anything except the date-range dropdown. No settings changes.
- Don't edit `data/months/*.json` by hand; use the CLI.
- No commits, no messages to anyone.
