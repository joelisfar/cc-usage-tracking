import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	applyWorkday,
	computeMonth,
	daysOf,
	historyOf,
	newMonth,
	weekdaysOf,
	type MonthData
} from './calc.ts';

// Synthetic months (not real spend): one ends slightly over its allotment, one lands exactly on it.
const load = (name: 'over-budget' | 'on-budget') =>
	JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as MonthData;
const workdays = (d: MonthData) => d.days.filter((x) => x.workday);

describe('computeMonth', () => {
	it('a month that ends over its allotment', () => {
		const { rows, values: v } = computeMonth(load('over-budget'));
		const work = rows.filter((r) => r.workday);
		expect(rows).toHaveLength(31);
		expect(work).toHaveLength(20);
		expect(work[0]).toMatchObject({ index: 1, linear: 25, actual: 12.5, remaining: 487.5 });
		expect(work[7]).toMatchObject({ actual: 190.75, remaining: 309.25 });
		expect(v.totalUsed).toBe(503.4);
		expect(v.percentUsed).toBeCloseTo(1.0068, 4);
		expect(v.averagePerDay).toBe(25.17);
		expect(v.todaysLinearDifference).toBe(-3.4);
		expect(v.totalRemaining).toBe(-3.4);
		expect(v.daysRemaining).toBe(0);
		expect(v.remainingPerDay).toBeNull();
	});

	it('a month that lands exactly on its allotment', () => {
		const { rows, values: v } = computeMonth(load('on-budget'));
		const work = rows.filter((r) => r.workday);
		expect(work).toHaveLength(18);
		expect(v.dailyBudget).toBe(28.33);
		expect(work[17]).toMatchObject({ linear: 510, actual: 510, remaining: 0 });
	});

	it('non-workday rows carry no pace numbers', () => {
		const { rows } = computeMonth(load('on-budget'));
		const sat = rows.find((r) => r.date === '2026-09-05')!;
		expect(sat).toMatchObject({ workday: false, index: null, linear: null, usage: null });
	});

	it('handles a partly logged month', () => {
		const data = newMonth('2026-10', 500);
		const work = workdays(data);
		work[0].usage = 20;
		work[1].usage = 30;
		const { values: v } = computeMonth(data);
		expect(v.daysUsed).toBe(2);
		expect(v.totalUsed).toBe(50);
		expect(v.daysRemaining).toBe(work.length - 2);
		expect(v.remainingPerDay).toBeCloseTo(450 / (work.length - 2), 2);
	});

	it('is safe on an empty month', () => {
		const { values: v } = computeMonth(newMonth('2026-10', 500));
		expect(v.averagePerDay).toBeNull();
		expect(v.dailyUsageRate).toBeNull();
		expect(v.totalUsed).toBe(0);
	});
});

describe('dates and newMonth', () => {
	it('lists every day and just the weekdays', () => {
		expect(daysOf('2026-02')).toHaveLength(28);
		expect(weekdaysOf('2026-09')).toHaveLength(22);
	});

	it('marks weekends and days off as non-workdays', () => {
		const d = newMonth('2026-09', 510, ['2026-09-07', '2026-09-10', '2026-09-11', '2026-09-25']);
		expect(d.days).toHaveLength(30);
		expect(workdays(d)).toHaveLength(18);
		const by = (date: string) => d.days.find((x) => x.date === date)!;
		expect(by('2026-09-07').workday).toBe(false); // Labor Day
		expect(by('2026-09-05').workday).toBe(false); // Saturday
		expect(by('2026-09-08').workday).toBe(true);
	});
});

describe('applyWorkday', () => {
	it('turning a day off raises the daily allotment', () => {
		const d = newMonth('2026-11', 500);
		const before = computeMonth(d).values.dailyBudget;
		applyWorkday(d, '2026-11-12', false);
		expect(computeMonth(d).values.dailyBudget).toBeGreaterThan(before);
	});

	it('turning a weekend on adds a workday', () => {
		const d = newMonth('2026-11', 500);
		const n = workdays(d).length;
		applyWorkday(d, '2026-11-07', true);
		expect(workdays(d)).toHaveLength(n + 1);
	});

	it('refuses to turn off a day with usage', () => {
		const d = newMonth('2026-11', 500);
		d.days.find((x) => x.date === '2026-11-03')!.usage = 12;
		expect(() => applyWorkday(d, '2026-11-03', false)).toThrow(/usage/);
	});

	it('rejects dates outside the month', () => {
		expect(() => applyWorkday(newMonth('2026-11', 500), '2026-12-01', true)).toThrow();
	});
});

describe('target (percent of the allotment)', () => {
	// 500 allotment at 80% = 400 budget, spread over Nov 2026's 19 workdays (Thanksgiving + Friday off)
	const month = (target?: number) => {
		const d = newMonth('2026-11', 500, ['2026-11-26', '2026-11-27'], target);
		const work = workdays(d);
		expect(work).toHaveLength(19);
		work[0].usage = 20;
		work[1].usage = 30;
		return d;
	};

	it('without a target everything is measured against the allotment', () => {
		const { rows, values: v } = computeMonth(month());
		expect(v).toMatchObject({ target: null, budget: 500, totalRemaining: 450 });
		expect(rows.every((r) => r.target === null)).toBe(true);
	});

	it('measures the summary against the target amount', () => {
		const { values: v } = computeMonth(month(80));
		expect(v.target).toBe(80);
		expect(v.budget).toBe(400);
		expect(v.dailyBudget).toBeCloseTo(400 / 19, 2);
		expect(v.percentUsed).toBeCloseTo(50 / 400, 6);
		expect(v.totalRemaining).toBe(350);
		expect(v.remainingPerDay).toBeCloseTo(350 / 17, 2);
		expect(v.todaysLinearDifference).toBeCloseTo((400 / 19) * 2 - 50, 2); // target pace minus used
	});

	it('adds a target running total per workday and leaves the linear pace alone', () => {
		const { rows } = computeMonth(month(80));
		const work = rows.filter((r) => r.workday);
		expect(work[0]).toMatchObject({ linear: 26.32, target: 21.05, remaining: 480 });
		expect(work[18]).toMatchObject({ linear: 500, target: 400 });
		expect(rows.find((r) => r.date === '2026-11-07')!.target).toBeNull();
	});
});

describe('historyOf', () => {
	const months = [
		{ month: '2026-11', total: 120.44 },
		{ month: '2026-10', total: 400 },
		{ month: '2026-09', total: 500 },
		{ month: '2025-12', total: 300 }
	];

	it('labels prior-year months with the year and flags the unfinished month', () => {
		const { rows } = historyOf(months, '2026-11-09');
		expect(rows.map((r) => r.label)).toEqual(['November', 'October', 'September', 'December 2025']);
		expect(rows.map((r) => r.complete)).toEqual([false, true, true, true]);
	});

	it('averages finished months only', () => {
		expect(historyOf(months, '2026-11-09').average).toBe(400); // (400 + 500 + 300) / 3
		expect(historyOf(months, '2026-12-01').average).toBe(330.11); // November is finished by Dec 1 (UTC)
	});

	it('keeps at most 12 months and has no average with nothing finished', () => {
		const many = Array.from({ length: 15 }, (_, i) => ({
			month: `2025-${String(12 - (i % 12)).padStart(2, '0')}`,
			total: 10
		}));
		expect(historyOf(many, '2026-01-15').rows).toHaveLength(12);
		expect(historyOf([{ month: '2026-11', total: 5 }], '2026-11-09').average).toBeNull();
	});
});
