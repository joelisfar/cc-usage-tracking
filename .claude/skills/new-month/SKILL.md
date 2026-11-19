---
name: new-month
description: Create a new month in the Claude Code usage tracker. Use when the user says "make a new month", "set up October", "start next month", or similar. Asks which weekdays are days off, then builds the month with weekends and days off removed.
---

# New month

Creates `data/months/YYYY-MM.json` via the CLI. Run all commands from the repo root.

## Steps

1. **Pick the month.** Default to the month after the latest one (`node scripts/usage.ts list`). If the user named one ("October"), use it. The year comes from context (today's date), not a guess.

2. **Pick the allotment.** Default to the latest month's allotment (`node scripts/usage.ts show` prints it). If the `get_usage` tool is available, its `plan.extraUsage.monthlyLimit` is the real monthly limit, so prefer that and mention it if it differs from last month. Confirm the number with the user in one line, since allotments sometimes change.

   **Target.** The CLI carries the latest month's target (a percent of the allotment, e.g. 80) forward automatically. Mention it in the confirmation line ("target 80%") so the user can change it; pass `--target <percent>` to override or `--target none` to drop it.

3. **Ask about days off.** Run `node scripts/usage.ts weekdays YYYY-MM` to get every Mon-Fri date. Weekends are already excluded. Then ask the user which of those weekdays they (or the team) have off. Offer likely candidates from your own knowledge of US holidays that fall in that month (e.g. Labor Day, Thanksgiving + the day after, Christmas Eve/Day, Memorial Day, July 4th), clearly as suggestions to confirm, not facts. Ask about PTO too. Wait for the answer; "none" is valid.

4. **Create it.**
   ```bash
   node scripts/usage.ts new-month YYYY-MM <allotment> --off 2026-11-26,2026-11-27
   ```
   Omit `--off` if there are no days off.

5. **Show the result.** Run `node scripts/usage.ts show YYYY-MM` and tell the user the workday count, the daily allotment (allotment / workdays) and, if a target is set, the target amount and daily target. Mention the app tab appears automatically (`pnpm dev`, http://localhost:5173).

## Notes

- The month's linear pace is `allotment / number of workdays`, so the days-off answer directly changes the daily allotment. Double-check it before creating.
- The month file stores every calendar day with a `workday` flag, so days off can be changed later with `node scripts/usage.ts workday <date> on|off` or the app's "Show all days" checkboxes. Mention this if the user is unsure about a day.
- If the month already exists the CLI errors; do not overwrite. Ask the user what they want instead.
- Don't create months in the future beyond the next one unless asked.
