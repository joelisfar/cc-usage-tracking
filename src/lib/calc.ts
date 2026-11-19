// Pure month math + date helpers. No imports, so it runs in the browser,
// SvelteKit server code, and plain `node scripts/usage.ts`.

export type Day = {
	date: string;
	/** Counts toward the linear pace. Weekends and days off are false. */
	workday: boolean;
	/** Dollars spent that day; null until logged. Only workdays hold usage. */
	usage: number | null;
};
export type MonthData = {
	/** "YYYY-MM" */
	month: string;
	/** Total dollar allotment for the month */
	allotment: number;
	/** Optional goal, as a percent of the allotment (80 = aim to use 80%). Omitted when unset. */
	target?: number;
	/** Every calendar day of the month, ascending. */
	days: Day[];
};

export type Row = {
	date: string;
	label: string;
	workday: boolean;
	/** 1-based position among workdays; null on non-workdays. */
	index: number | null;
	linear: number | null;
	/** Running pace toward the target amount; null on non-workdays and when no target is set. */
	target: number | null;
	usage: number | null;
	actual: number | null;
	remaining: number | null;
};

/** Stats are measured against the budget: the target amount when a target is set, else the allotment. */
export type Values = {
	totalAllotment: number;
	/** Target percent (80), or null when none is set. */
	target: number | null;
	/** allotment * target%, or the allotment itself without a target. */
	budget: number;
	dailyBudget: number;
	totalUsed: number;
	percentUsed: number;
	daysUsed: number;
	monthCompletion: number;
	averagePerDay: number | null;
	todaysLinearAmount: number;
	todaysLinearDifference: number;
	dailyUsageRate: number | null;
	totalRemaining: number;
	percentRemaining: number;
	daysRemaining: number;
	remainingPerDay: number | null;
	dailyRemainingRate: number | null;
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** The dollar amount being aimed for: allotment * target%, or the whole allotment. */
export const budgetOf = (data: Pick<MonthData, 'allotment' | 'target'>) =>
	data.target == null ? data.allotment : round2((data.allotment * data.target) / 100);

/** Rows for every calendar day; linear pace and counts use workdays only. */
export function computeMonth(data: MonthData): { rows: Row[]; values: Values } {
	const n = data.days.filter((d) => d.workday).length;
	const budget = budgetOf(data);
	const daily = n ? data.allotment / n : 0;
	const targetDaily = n ? budget / n : 0;
	let running = 0;
	let workIndex = 0;
	let daysUsed = 0;
	let lastLoggedIndex = 0;

	const rows: Row[] = data.days.map((d) => {
		const logged = d.usage !== null && d.usage !== undefined;
		if (d.workday) workIndex++;
		if (logged) {
			running = round2(running + (d.usage as number));
			if (d.workday) {
				daysUsed++;
				lastLoggedIndex = workIndex;
			}
		}
		return {
			date: d.date,
			label: formatDay(d.date),
			workday: d.workday,
			index: d.workday ? workIndex : null,
			linear: d.workday ? round2(daily * workIndex) : null,
			target: d.workday && data.target != null ? round2(targetDaily * workIndex) : null,
			usage: logged ? (d.usage as number) : null,
			actual: logged ? running : null,
			remaining: logged ? round2(data.allotment - running) : null
		};
	});

	const totalUsed = running;
	const linearNow = round2(targetDaily * lastLoggedIndex);
	const totalRemaining = round2(budget - totalUsed);
	const daysRemaining = n - daysUsed;
	const remainingPerDay = daysRemaining > 0 ? round2(totalRemaining / daysRemaining) : null;

	return {
		rows,
		values: {
			totalAllotment: data.allotment,
			target: data.target ?? null,
			budget,
			dailyBudget: round2(targetDaily),
			totalUsed,
			percentUsed: budget ? totalUsed / budget : 0,
			daysUsed,
			monthCompletion: n ? daysUsed / n : 0,
			averagePerDay: daysUsed ? round2(totalUsed / daysUsed) : null,
			todaysLinearAmount: linearNow,
			todaysLinearDifference: round2(linearNow - totalUsed),
			dailyUsageRate: linearNow ? totalUsed / linearNow : null,
			totalRemaining,
			percentRemaining: budget ? totalRemaining / budget : 0,
			daysRemaining,
			remainingPerDay,
			dailyRemainingRate: remainingPerDay !== null && targetDaily ? remainingPerDay / targetDaily : null
		}
	};
}

export type HistoryRow = {
	month: string;
	/** "October", or "December 2025" when the month is from a prior year. */
	label: string;
	total: number;
	/** False while the month's last UTC day hasn't finished yet. */
	complete: boolean;
};

/**
 * The most recent `limit` months with their usage totals (input is newest first).
 * The average only counts finished months, so a half-spent current month doesn't drag it down.
 */
export function historyOf(
	months: { month: string; total: number }[],
	today: string,
	limit = 12
): { rows: HistoryRow[]; average: number | null } {
	const year = today.slice(0, 4);
	const rows = months.slice(0, limit).map(({ month, total }) => ({
		month,
		label: month.startsWith(year) ? formatMonth(month).split(' ')[0] : formatMonth(month),
		total,
		complete: (daysOf(month).at(-1) as string) < today
	}));
	const done = rows.filter((r) => r.complete);
	return {
		rows,
		average: done.length ? round2(done.reduce((sum, r) => sum + r.total, 0) / done.length) : null
	};
}

/** Turn a day on/off as a workday. A day with usage logged can't be turned off. */
export function applyWorkday(data: MonthData, date: string, workday: boolean): void {
	const day = data.days.find((d) => d.date === date);
	if (!day) throw new Error(`${date} is not in ${data.month}`);
	if (!workday && day.usage !== null)
		throw new Error(`${date} has usage logged; clear it before marking the day off`);
	day.workday = workday;
}

/* ---------- dates (all UTC so timezones never shift a day) ---------- */

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

export function formatDay(iso: string): string {
	return new Intl.DateTimeFormat('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	}).format(utc(iso));
}

export function formatMonth(month: string): string {
	return new Intl.DateTimeFormat('en-US', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	}).format(utc(`${month}-01`));
}

export function isWeekend(iso: string): boolean {
	const dow = utc(iso).getUTCDay();
	return dow === 0 || dow === 6;
}

/** Every calendar date in a "YYYY-MM" month. */
export function daysOf(month: string): string[] {
	const out: string[] = [];
	const d = utc(`${month}-01`);
	while (d.toISOString().slice(0, 7) === month) {
		out.push(d.toISOString().slice(0, 10));
		d.setUTCDate(d.getUTCDate() + 1);
	}
	return out;
}

/** All Mon-Fri dates in a "YYYY-MM" month, as ISO strings. */
export function weekdaysOf(month: string): string[] {
	return daysOf(month).filter((d) => !isWeekend(d));
}

export function isMonth(s: string): boolean {
	return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function isDate(s: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(utc(s).getTime());
}

/** Fresh month: every calendar day, workday = weekday and not in daysOff. Nothing logged. */
export function newMonth(
	month: string,
	allotment: number,
	daysOff: string[] = [],
	target?: number
): MonthData {
	const off = new Set(daysOff);
	return {
		month,
		allotment,
		...(target == null ? {} : { target }),
		days: daysOf(month).map((date) => ({
			date,
			workday: !isWeekend(date) && !off.has(date),
			usage: null
		}))
	};
}
