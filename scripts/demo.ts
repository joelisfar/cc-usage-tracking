#!/usr/bin/env node
// Try the app with made-up data, without touching your own: `pnpm demo` (http://localhost:5174).
// Seeds .demo-data/ with the current month (every UTC day before today filled) plus a few finished
// months, then starts the dev server pointed at it. Your real data/months/ is never read or written.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { daysOf, newMonth } from '../src/lib/calc.ts';

const DIR = new URL('../.demo-data/', import.meta.url);
const PORT = '5174';
const ALLOTMENT = 500;
const TARGET = 80;

// Small deterministic generator so the demo looks the same every run.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);

const today = new Date().toISOString().slice(0, 10);
const monthOf = (offset: number) => {
	const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
	d.setUTCMonth(d.getUTCMonth() + offset);
	return d.toISOString().slice(0, 7);
};

rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

for (const offset of [-3, -2, -1, 0]) {
	const month = monthOf(offset);
	const data = newMonth(month, ALLOTMENT, [], TARGET);
	const workdays = data.days.filter((d) => d.workday);
	// Aim for roughly 70-95% of the month's target, a little uneven from day to day.
	const pace = ((ALLOTMENT * TARGET) / 100 / workdays.length) * (0.7 + rand() * 0.25);
	for (const day of workdays) {
		if (day.date >= today) break;
		day.usage = Math.round(pace * (0.4 + rand() * 1.2) * 100) / 100;
	}
	writeFileSync(new URL(`${month}.json`, DIR), JSON.stringify(data, null, 2) + '\n');
	console.log(`demo: ${month} (${daysOf(month).length} days)`);
}

const child = spawn('pnpm', ['exec', 'vite', 'dev', '--port', PORT], {
	stdio: 'inherit',
	shell: process.platform === 'win32',
	env: { ...process.env, USAGE_DATA_DIR: fileURLToPath(DIR) }
});
child.on('exit', (code) => process.exit(code ?? 0));
