// File-backed store: one JSON file per month in data/months/YYYY-MM.json.
// Shared by the SvelteKit server and scripts/usage.ts.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { applyWorkday, isDate, isMonth, newMonth, round2, type MonthData } from '../calc.ts';

const DIR = process.env.USAGE_DATA_DIR ?? path.resolve(process.cwd(), 'data/months');
const file = (month: string) => path.join(DIR, `${month}.json`);

export async function listMonths(): Promise<string[]> {
	await fs.mkdir(DIR, { recursive: true });
	const names = await fs.readdir(DIR);
	return names
		.map((n) => n.replace(/\.json$/, ''))
		.filter(isMonth)
		.sort();
}

export async function readMonth(month: string): Promise<MonthData> {
	if (!isMonth(month)) throw new Error(`Bad month "${month}" (want YYYY-MM)`);
	try {
		return JSON.parse(await fs.readFile(file(month), 'utf8')) as MonthData;
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`No data for ${month}`);
		throw e;
	}
}

export async function writeMonth(data: MonthData): Promise<void> {
	await fs.mkdir(DIR, { recursive: true });
	const tmp = `${file(data.month)}.tmp`;
	await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n');
	await fs.rename(tmp, file(data.month));
}

/** Set (or clear with null) the usage for one workday. */
export async function setUsage(month: string, date: string, usage: number | null) {
	if (!isDate(date)) throw new Error(`Bad date "${date}" (want YYYY-MM-DD)`);
	if (usage !== null && (!Number.isFinite(usage) || usage < 0))
		throw new Error(`Usage must be a non-negative number`);
	const data = await readMonth(month);
	const day = data.days.find((d) => d.date === date);
	if (!day) throw new Error(`${date} is not in ${month}`);
	if (!day.workday && usage !== null)
		throw new Error(`${date} is not a workday; mark it as a workday first`);
	day.usage = usage === null ? null : round2(usage);
	await writeMonth(data);
	return data;
}

/** Mark a day as a workday (counts toward the pace) or not. */
export async function setWorkday(month: string, date: string, workday: boolean) {
	if (!isDate(date)) throw new Error(`Bad date "${date}" (want YYYY-MM-DD)`);
	const data = await readMonth(month);
	applyWorkday(data, date, workday);
	await writeMonth(data);
	return data;
}

export async function setAllotment(month: string, allotment: number) {
	if (!Number.isFinite(allotment) || allotment <= 0) throw new Error('Allotment must be > 0');
	const data = await readMonth(month);
	data.allotment = allotment;
	await writeMonth(data);
	return data;
}

const checkTarget = (target: number) => {
	if (!Number.isFinite(target) || target <= 0 || target > 100)
		throw new Error('Target must be a percent between 0 and 100');
};

/** Set the month's target percent of the allotment (80 = aim for 80%); null removes it. */
export async function setTarget(month: string, target: number | null) {
	if (target !== null) checkTarget(target);
	const data = await readMonth(month);
	if (target === null) delete data.target;
	else data.target = target;
	await writeMonth(data);
	return data;
}

export async function createMonth(
	month: string,
	allotment: number,
	daysOff: string[],
	target?: number
) {
	if (!isMonth(month)) throw new Error(`Bad month "${month}" (want YYYY-MM)`);
	if (!Number.isFinite(allotment) || allotment <= 0) throw new Error('Allotment must be > 0');
	if (target != null) checkTarget(target);
	for (const d of daysOff)
		if (!isDate(d) || !d.startsWith(month)) throw new Error(`Bad day off "${d}"`);
	if ((await listMonths()).includes(month)) throw new Error(`${month} already exists`);
	const data = newMonth(month, allotment, daysOff, target);
	await writeMonth(data);
	return data;
}
