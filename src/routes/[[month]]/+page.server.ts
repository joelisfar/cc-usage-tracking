import { error, fail } from '@sveltejs/kit';
import { computeMonth, formatMonth, historyOf } from '#lib/calc.ts';
import {
	listMonths,
	readMonth,
	setAllotment,
	setTarget,
	setUsage,
	setWorkday
} from '#lib/server/store.ts';
import type { Actions, PageServerLoad } from './$types';

// `/` renders the latest month in place (no redirect); `/YYYY-MM` renders that month.
async function resolveMonth(slug: string | undefined): Promise<string> {
	const months = await listMonths();
	if (!months.length) error(404, 'No months yet. Ask Claude to “make a new month”.');
	const month = slug ?? months[months.length - 1];
	if (!months.includes(month)) error(404, `No data for ${month}`);
	return month;
}

export const load: PageServerLoad = async ({ params }) => {
	const month = await resolveMonth(params.month);
	const months = (await listMonths()).reverse(); // newest first
	const { rows, values } = computeMonth(await readMonth(month));
	// History box: usage total for each of the latest 12 months, plus the average per finished month.
	const totals = await Promise.all(
		months.slice(0, 12).map(async (m) => ({
			month: m,
			total: computeMonth(await readMonth(m)).values.totalUsed
		}))
	);
	const history = historyOf(totals, new Date().toISOString().slice(0, 10));
	return {
		months, // ids like "2026-09", newest first
		month,
		title: formatMonth(month),
		rows, // every calendar day; the page filters to workdays unless "show all days" is on
		values,
		history
	};
};

const money = (raw: FormDataEntryValue | null) => String(raw ?? '').trim().replace(/[$,\s]/g, '');

export const actions: Actions = {
	setUsage: async ({ request, params }) => {
		const form = await request.formData();
		const raw = money(form.get('usage'));
		try {
			const month = await resolveMonth(params.month);
			await setUsage(month, String(form.get('date')), raw === '' ? null : Number(raw));
		} catch (e) {
			if (isHttpError(e)) throw e;
			return fail(400, { error: (e as Error).message });
		}
	},
	setAllotment: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const month = await resolveMonth(params.month);
			await setAllotment(month, Number(money(form.get('allotment'))));
		} catch (e) {
			if (isHttpError(e)) throw e;
			return fail(400, { error: (e as Error).message });
		}
	},
	// Blank clears the target; "80" or "80%" sets it.
	setTarget: async ({ request, params }) => {
		const form = await request.formData();
		const raw = money(form.get('target')).replace(/%$/, '');
		try {
			const month = await resolveMonth(params.month);
			await setTarget(month, raw === '' ? null : Number(raw));
		} catch (e) {
			if (isHttpError(e)) throw e;
			return fail(400, { error: (e as Error).message });
		}
	},
	setWorkday: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const month = await resolveMonth(params.month);
			await setWorkday(month, String(form.get('date')), form.get('workday') === 'true');
		} catch (e) {
			if (isHttpError(e)) throw e;
			return fail(400, { error: (e as Error).message });
		}
	}
};

// error() throws an HttpError; let those pass through instead of turning them into a 400 form failure.
function isHttpError(e: unknown): boolean {
	return typeof e === 'object' && e !== null && 'status' in e && 'body' in e;
}
