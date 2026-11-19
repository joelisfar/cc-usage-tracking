#!/usr/bin/env node
// CLI for agents (and humans). Run from the repo root:  node scripts/usage.ts <command>
//
//   show [YYYY-MM] [--all]                      print the month table + values (default: latest; --all includes non-workdays)
//   workday <YYYY-MM-DD> <on|off>               mark a day as a workday or a day off (a day with usage can't go off)
//   list                                        list months
//   set <YYYY-MM-DD> <amount>                   log one day's usage in dollars
//   clear <YYYY-MM-DD>                          unset a day
//   allotment <YYYY-MM> <amount>                change a month's total allotment
//   target <YYYY-MM> <percent|off>              aim for a percent of the allotment (80 = 80%); "off" removes it
//   weekdays <YYYY-MM>                       list Mon-Fri dates (to ask about days off)
//   new-month <YYYY-MM> <allotment> [--off d1,d2,...] [--target <percent>|none]
//                                               create a month; weekends removed, --off dates removed too.
//                                               Target defaults to the latest month's target.
import { computeMonth, formatMonth, weekdaysOf } from '../src/lib/calc.ts';
import {
	createMonth,
	listMonths,
	readMonth,
	setAllotment,
	setTarget,
	setUsage,
	setWorkday
} from '../src/lib/server/store.ts';

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
	const i = rest.indexOf(`--${name}`);
	return i >= 0 ? rest[i + 1] : undefined;
};
const positional = rest.filter((a, i) => !a.startsWith('--') && !rest[i - 1]?.startsWith('--'));
const usd = (n: number | null) => (n === null ? '-' : `$${n.toFixed(2)}`);
const pct = (n: number | null) => (n === null ? '-' : `${(n * 100).toFixed(2)}%`);

async function show(month?: string, all = false) {
	const m = month ?? (await listMonths()).at(-1);
	if (!m) throw new Error('No months yet');
	const { rows, values: v } = computeMonth(await readMonth(m));
	const workdays = rows.filter((r) => r.workday).length;
	console.log(`${formatMonth(m)}  (${m})`);
	console.log('Day  Date          Linear      Usage    Actual   Remaining');
	for (const r of all ? rows : rows.filter((r) => r.workday))
		console.log(
			`${r.index === null ? ' off' : String(r.index).padStart(3)}  ${r.label.padEnd(12)} ${usd(r.linear).padStart(8)} ${usd(r.usage).padStart(9)} ${usd(r.actual).padStart(9)} ${usd(r.remaining).padStart(11)}`
		);
	// With a target, everything below is measured against the target amount, not the full allotment.
	const goal = v.target === null ? '' : ` | target ${v.target}% = ${usd(v.budget)}`;
	console.log(
		`\nallotment ${usd(v.totalAllotment)}${goal} (${usd(v.dailyBudget)}/day) | used ${usd(v.totalUsed)} (${pct(v.percentUsed)}) | ` +
			`${v.daysUsed}/${workdays} days | avg ${usd(v.averagePerDay)}/day | vs linear ${usd(v.todaysLinearDifference)} | ` +
			`remaining ${usd(v.totalRemaining)} over ${v.daysRemaining} days (${usd(v.remainingPerDay)}/day)`
	);
}

try {
	switch (cmd) {
		case 'show':
			await show(positional[0], rest.includes('--all'));
			break;
		case 'workday': {
			// workday <YYYY-MM-DD> <on|off>
			const [date, state] = positional;
			if (state !== 'on' && state !== 'off') throw new Error('workday needs "on" or "off"');
			await setWorkday(date.slice(0, 7), date, state === 'on');
			console.log(`${date} is now ${state === 'on' ? 'a workday' : 'a day off'}`);
			break;
		}
		case 'list':
			console.log((await listMonths()).join('\n'));
			break;
		case 'set': {
			const [date, amount] = positional;
			await setUsage(date.slice(0, 7), date, Number(amount));
			console.log(`Set ${date} = ${usd(Number(amount))}`);
			break;
		}
		case 'clear': {
			const [date] = positional;
			await setUsage(date.slice(0, 7), date, null);
			console.log(`Cleared ${date}`);
			break;
		}
		case 'allotment': {
			const [month, amount] = positional;
			await setAllotment(month, Number(amount));
			console.log(`${month} allotment = ${usd(Number(amount))}`);
			break;
		}
		case 'target': {
			const [month, value] = positional;
			const off = value === 'off' || value === 'none';
			await setTarget(month, off ? null : Number(value));
			console.log(off ? `${month} target removed` : `${month} target = ${Number(value)}%`);
			break;
		}
		case 'weekdays':
			console.log(weekdaysOf(positional[0]).join('\n'));
			break;
		case 'new-month': {
			const [month, allotment] = positional;
			const off =
				flag('off')
					?.split(',')
					.map((s) => s.trim())
					.filter(Boolean) ?? [];
			// Carry the latest month's target forward unless --target says otherwise.
			const t = flag('target');
			const previous = (await listMonths()).at(-1);
			const target =
				t === 'none'
					? undefined
					: t !== undefined
						? Number(t)
						: previous
							? (await readMonth(previous)).target
							: undefined;
			const d = await createMonth(month, Number(allotment), off, target);
			console.log(
				`Created ${month}: ${d.days.filter((x) => x.workday).length} workdays, allotment ${usd(d.allotment)}, ` +
					`target ${d.target === undefined ? 'none' : `${d.target}%`}, off: ${off.join(', ') || 'none'}`
			);
			break;
		}
		default:
			console.error(
				'Usage: node scripts/usage.ts <show|list|set|clear|allotment|target|workday|weekdays|new-month> ...'
			);
			process.exit(1);
	}
} catch (e) {
	console.error(`Error: ${(e as Error).message}`);
	process.exit(1);
}
