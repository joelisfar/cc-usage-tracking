---
name: setup-daily-sync
description: One-time setup of the usage tracker and its weekday scheduled sync from claude.ai. Use when the user says "set this up", "set up the daily sync", "schedule the usage check", or has just cloned the repo and wants it running.
---

# Set up the tracker and the daily sync

Goal: a working tracker with the current month created, plus a scheduled task that fills in each closed day's spend from claude.ai every weekday. Run from the repo root. Tell the user what you are doing as you go, and confirm before creating the schedule.

## What this needs

- **Node >= 22.18** and **pnpm** (the CLI runs `.ts` files directly).
- **Claude Code in the Claude desktop app.** The sync reads claude.ai's chart through Claude in Chrome, so it has to run on the user's own machine. The desktop app's scheduled tasks (`mcp__scheduled-tasks__*` tools) do that: they run while the app is open, and a missed run fires on the next launch.
- **Claude in Chrome** installed and connected, with Chrome signed in to claude.ai.

If the scheduled-tasks tools are not available (for example a terminal-only Claude Code), do steps 1-4, then tell the user the daily schedule needs the desktop app, and that in the meantime they can say "sync usage" any time to run the `sync-daily-usage` skill by hand.

## Steps

1. **Install and check.** Run `node --version` (must be >= 22.18; if not, tell the user and stop), then `pnpm install` and `pnpm test`. Report failures instead of working around them.

2. **Create the current month** if `node scripts/usage.ts list` shows none for the current UTC month. Follow the `new-month` skill (allotment, optional target percent, days off). If the `get_usage` tool is available, its `plan.extraUsage.monthlyLimit` is the real monthly limit; offer it as the allotment.

3. **Check the Chrome path works.** Following the `chrome-browser` skill, open a NEW tab at `https://claude.ai/new#settings/usage`, wait about 4 seconds, and confirm the "Daily spend by product" chart is showing. Close the tab. If Chrome isn't connected or claude.ai isn't signed in, tell the user exactly that, ask them to fix it, and stop; do not continue to scheduling.

4. **Do one real sync by hand.** Run the `sync-daily-usage` skill once so the user sees it work. This also surfaces any tool approvals the user needs to grant now, because a scheduled run cannot stop to ask.

5. **Choose the schedule.** Default: weekdays at 9:30 AM local time (`30 9 * * 1-5`; cron is in local time). The tracker's days are UTC days and the sync only fills days that have already ended in UTC, so it never writes a half-finished day; a run time that is just before 00:00 UTC (a morning in far-east time zones) will simply lag by a day. Ask if they want a different time. Ask whether they run the app locally (`pnpm dev`, default `http://localhost:5173`); that URL goes in the completion notification.

6. **Create the task.** First call `mcp__scheduled-tasks__list_scheduled_tasks`; if a task with id `sync-daily-claude-usage` already exists, show it and offer `update_scheduled_task` instead of creating a duplicate. Otherwise read `scheduled-task-prompt.md` (next to this file), replace `<REPO_PATH>` with the absolute path of this repo (`pwd`) and `<TRACKER_URL>` with the URL from step 5, show the user the schedule and the final prompt, wait for a yes, then call `mcp__scheduled-tasks__create_scheduled_task` with:
   - `taskId`: `sync-daily-claude-usage`
   - `title`: `Sync daily Claude Code usage`
   - `description`: `Weekdays: fill closed UTC days in the usage tracker from the claude.ai daily spend chart`
   - `cronExpression`: the chosen schedule
   - `prompt`: the filled-in template

7. **Prove it.** Offer `mcp__scheduled-tasks__run_scheduled_task` for `sync-daily-claude-usage` so the user can watch one scheduled run end to end. The task shows up under Scheduled in the Code tab, and each run is its own session.

## Tell the user at the end

- The schedule only runs while the Claude desktop app is open (a missed run fires on the next launch), and Chrome must be running and signed in to claude.ai.
- The tracker itself is just `pnpm dev` (http://localhost:5173); its data lives in `data/months/` and stays out of git.
- On the 1st of a new month, create the month first (`new-month`); the sync does not create months.
- To change or stop the schedule, use the Scheduled page in the Code tab, or ask you.
