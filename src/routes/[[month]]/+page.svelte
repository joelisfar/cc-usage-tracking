<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { applyAction, deserialize, enhance } from '$app/forms';
	import { LineChart, Text } from 'layerchart';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Chart from '#lib/components/ui/chart/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { ordinal, usd, pct } from '#lib/format.ts';
	import { formatDay, formatMonth } from '#lib/calc.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const v = $derived(data.values);

	// Year + month selectors (native <select>). data.months is newest first.
	const year = $derived(data.month.slice(0, 4));
	const years = $derived([...new Set(data.months.map((m) => m.slice(0, 4)))]);
	const monthsInYear = $derived(data.months.filter((m) => m.startsWith(year)));
	const monthName = (m: string) => formatMonth(m).split(' ')[0];
	const selectClass =
		'h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
	const pickYear = (y: string) => {
		const latest = data.months.find((m) => m.startsWith(y));
		if (latest && y !== year) goto(`/${latest}`);
	};
	const pickMonth = (m: string) => {
		if (m !== data.month) goto(`/${m}`);
	};

	// "Show all days" reveals weekends and days off so they can be toggled as workdays.
	let showAll = $state(false);
	const workdayRows = $derived(data.rows.filter((r) => r.workday));
	// The log shows 7 days at a time: today plus the 6 before it. Earlier and later days sit behind
	// "Show previous days" / "Show remaining days" bars. Tracker days are UTC days, so "today" is the
	// current UTC date (the day claude.ai is still accumulating spend for).
	const VISIBLE_DAYS = 7;
	// "Show 3 previous days" / "Hide 1 remaining day"
	const barLabel = (open: boolean, n: number, which: 'previous' | 'remaining') =>
		`${open ? 'Hide' : 'Show'} ${n} ${which} ${n === 1 ? 'day' : 'days'}`;
	let showPrevious = $state(false);
	let showRemaining = $state(false);
	const today = new Date().toISOString().slice(0, 10);
	// Where a UTC day starts in the viewer's own time zone, e.g. "6 PM CST" (or "7 PM CDT" in daylight
	// saving time). Judged on today for the current month, else mid-month, so past months show what
	// applied then. Computed in the browser so it is the viewer's zone, not the server's.
	let boundary = $state<{ dayStart: string; zone: string } | null>(null);
	$effect(() => {
		const ref = data.month === today.slice(0, 7) ? today : `${data.month}-15`;
		const parts = new Intl.DateTimeFormat('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			timeZoneName: 'short'
		}).formatToParts(new Date(`${ref}T00:00:00Z`));
		const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
		const minute = part('minute');
		boundary = {
			dayStart: `${part('hour')}${minute === '00' ? '' : `:${minute}`} ${part('dayPeriod')}`,
			zone: part('timeZoneName')
		};
	});
	const shownDays = $derived(data.rows.filter((r) => showAll || r.workday));
	// Days up to and including today are a prefix of the list (it is sorted by date).
	const pastCount = $derived(shownDays.filter((r) => r.date <= today).length);
	// A month that hasn't started yet has no "today" to anchor on, so it shows everything.
	const started = $derived(pastCount > 0);
	const firstIdx = $derived(Math.max(0, pastCount - VISIBLE_DAYS));
	const hiddenPast = $derived(started ? firstIdx : 0);
	const hiddenFuture = $derived(started ? shownDays.length - pastCount : 0);
	const tableRows = $derived(
		started
			? shownDays.slice(showPrevious ? 0 : firstIdx, showRemaining ? undefined : pastCount)
			: shownDays
	);

	async function setWorkday(date: string, workday: boolean) {
		const body = new FormData();
		body.set('date', date);
		body.set('workday', String(workday));
		const res = await fetch('?/setWorkday', {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		await applyAction(deserialize(await res.text()));
		await invalidateAll(); // also resets the checkbox if the server refused
	}

	const chartConfig = {
		linear: { label: 'Linear running total', color: 'var(--chart-1)' },
		actual: { label: 'Actual running total', color: 'var(--chart-2)' },
		target: { label: 'Target running total', color: 'var(--chart-3)' }
	} satisfies Chart.ChartConfig;

	const chartData = $derived(
		workdayRows.map((r, i) => ({
			index: i + 1,
			linear: r.linear,
			target: r.target,
			actual: r.actual
		}))
	);
	// The target line only exists when the month has a target.
	const series = $derived([
		{ key: 'linear', label: chartConfig.linear.label, color: chartConfig.linear.color },
		...(v.target === null
			? []
			: [
					{
						key: 'target',
						label: `${chartConfig.target.label} (${v.target}%)`,
						color: chartConfig.target.color,
						props: { class: '[stroke-dasharray:6_4]' }
					}
				]),
		{ key: 'actual', label: chartConfig.actual.label, color: chartConfig.actual.color }
	]);
	// Chart x values are 1-based workday numbers; map back to the date for the tooltip.
	// Axis labels: 1st, 2nd, 3rd... of the month for each workday.
	const dayOfMonth = (i: number) => {
		const r = workdayRows[i - 1];
		return r ? ordinal(Number(r.date.slice(8))) : "";
	};
	const dateFor = (i: number) => {
		const r = workdayRows[i - 1];
		return r ? formatDay(r.date) : '';
	};

	// Submit when a field loses focus or Enter is pressed, without clearing what was typed.
	const autosave = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) =>
		update({ reset: false });

	type Tone = 'good' | 'bad' | null;
	// Grouped like the sheet; a blank row separates each group. With a target set, every
	// figure is measured against the target amount instead of the full allotment.
	const hasTarget = $derived(v.target !== null);
	const valueGroups = $derived<[string, string, Tone][][]>([
		hasTarget
			? [
					['Target amount', usd(v.budget), null],
					['Daily target', usd(v.dailyBudget), null]
				]
			: [['Daily allotment', usd(v.dailyBudget), null]],
		[
			['Total used', usd(v.totalUsed), null],
			[hasTarget ? 'Percent of target' : 'Percent used', pct(v.percentUsed), null],
			['Days used', String(v.daysUsed), null],
			['Average per day', usd(v.averagePerDay) || '-', null]
		],
		[
			[
				'Today’s linear difference',
				usd(v.todaysLinearDifference),
				v.todaysLinearDifference < 0 ? 'bad' : 'good'
			],
			['Daily usage rate', pct(v.dailyUsageRate), null]
		],
		[
			['Total remaining', usd(v.totalRemaining), v.totalRemaining < 0 ? 'bad' : null],
			['Days remaining', String(v.daysRemaining), null],
			['Remaining per day', usd(v.remainingPerDay) || '-', null]
		]
	]);
	const toneClass = (t: Tone) =>
		t === 'bad' ? 'text-destructive' : t === 'good' ? 'text-emerald-600 dark:text-emerald-400' : '';
</script>

{#snippet moreBar(label: string, open: boolean, toggle: () => void, pointsUp: boolean, edge: 'top' | 'bottom')}
	<!-- "Show more" bar: days outside the 7-day window stay folded away until asked for -->
	<Table.Row class="border-b-0">
		<Table.Cell colspan={showAll ? 7 : 6} class="p-0">
			<button
				type="button"
				class="flex h-full w-full cursor-pointer items-center justify-center gap-1.5 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none {edge === 'top' ? 'border-b' : 'border-t'}"
				aria-expanded={open}
				onclick={toggle}
			>
				{label}
				<svg
					class="size-4 transition-transform {pointsUp ? 'rotate-180' : ''}"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg
				>
			</button>
		</Table.Cell>
	</Table.Row>
{/snippet}

{#snippet xTickLabel({ props }: { props: any })}
		<!-- "22nd" renders as 22 plus a superscript nd -->
		{@const m = /^(\d+)(st|nd|rd|th)$/.exec(String(props.value ?? ''))}
		<Text
			{...props}
			segments={m
				? [
						{ value: m[1] },
						{ value: m[2], class: '[baseline-shift:super] [font-size:70%]' }
					]
				: undefined}
		/>
	{/snippet}

<svelte:head><title>{data.title} · Claude Code usage</title></svelte:head>

<main class="mx-auto max-w-7xl space-y-6 p-6">
	<header class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-xl font-semibold tracking-tight">
				<a href="/" class="hover:underline">Claude Code usage</a>
			</h1>
			<p class="text-sm text-muted-foreground">{data.title}</p>
		</div>
		<div class="flex items-center gap-2">
			<select
				aria-label="Year"
				class={selectClass}
				value={year}
				onchange={(e) => pickYear(e.currentTarget.value)}
			>
				{#each years as y (y)}
					<option value={y}>{y}</option>
				{/each}
			</select>
			<select
				aria-label="Month"
				class={selectClass}
				value={data.month}
				onchange={(e) => pickMonth(e.currentTarget.value)}
			>
				{#each monthsInYear as m (m)}
					<option value={m}>{monthName(m)}</option>
				{/each}
			</select>
		</div>
	</header>

	{#if form?.error}
		<p class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
			{form.error}
		</p>
	{/if}

	<div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21.5rem]">
		<div class="min-w-0 space-y-6">
	<Card.Root>
		<Card.Header class="px-6"><Card.Title>Running total vs. linear</Card.Title></Card.Header>
		<Card.Content>
<Chart.Container
					config={chartConfig}
					class="aspect-auto h-120 w-full [&_.lc-path]:opacity-100 [&_.lc-text]:text-[12px]!"
				>
				<LineChart
					data={chartData}
					x="index"
					{series}
					legend={{ placement: 'top' }}
					padding={{ top: 8, right: 28, bottom: 24, left: 36 }}
					props={{
						spline: { strokeWidth: 2.5 },
						xAxis: {
								ticks: chartData.map((d) => d.index),
								format: (i: number) => dayOfMonth(i),
								tickLabel: xTickLabel
							},
						yAxis: { format: (n: number) => (n === 0 ? '' : `$${n}`) }
					}}
					>
						{#snippet tooltip()}
							<!-- Axis shows the day number; the tooltip shows the date -->
							<Chart.Tooltip labelFormatter={(i: number) => dateFor(i)}>
								{#snippet formatter({ name, value, item })}
									<div class="flex w-full items-center justify-between gap-4">
										<span class="flex items-center gap-1.5">
											<span
												class="size-2.5 shrink-0 rounded-[2px]"
												style="background: {item.config?.color ?? item.color}"
											></span>
											{name}
										</span>
										<span class="font-medium tabular-nums">
											{value === null || value === undefined ? "-" : usd(Number(value))}
										</span>
									</div>
								{/snippet}
							</Chart.Tooltip>
						{/snippet}
					</LineChart>
			</Chart.Container>
		</Card.Content>
	</Card.Root>
		<Card.Root class="overflow-visible">
			<Card.Header class="px-6">
				<div class="flex items-center justify-between gap-3">
					<Card.Title>Daily log</Card.Title>
					<label class="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
						<Switch bind:checked={showAll} aria-label="Show all days" />
						Show all days
					</label>
				</div>
			</Card.Header>
			<Card.Content>
				<Table.Root containerClass="overflow-visible">
					<Table.Header class="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card [&_th]:shadow-[inset_0_-1px_0_var(--border)]">
						<Table.Row>
							<Table.Head class="w-10">Day</Table.Head>
							{#if showAll}<Table.Head class="text-center whitespace-nowrap">Work day</Table.Head>{/if}
							<Table.Head>Date</Table.Head>
							<Table.Head class="text-right whitespace-normal">Linear running total</Table.Head>
							<Table.Head class="w-28 text-right whitespace-normal">Daily usage</Table.Head>
							<Table.Head class="text-right whitespace-normal">Actual running total</Table.Head>
							<Table.Head class="text-right whitespace-normal">Remaining</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#if hiddenPast > 0}
							{@render moreBar(
								barLabel(showPrevious, hiddenPast, 'previous'),
								showPrevious,
								() => (showPrevious = !showPrevious),
								!showPrevious,
								'top'
							)}
						{/if}
						{#each tableRows as r, i (r.date)}
							<Table.Row class="border-b-0 {i % 2 ? 'bg-muted/50' : ''} {r.workday ? '' : 'text-muted-foreground'}">
								<Table.Cell class="text-muted-foreground">{r.index ?? ''}</Table.Cell>
								{#if showAll}
								<Table.Cell>
									<div class="flex justify-center">
										<Checkbox
											checked={r.workday}
											disabled={r.workday && r.usage !== null}
											title={r.workday && r.usage !== null
												? 'Clear this day’s usage before marking it off'
												: undefined}
											aria-label="{r.label} is a work day"
											onCheckedChange={(checked) => setWorkday(r.date, checked)}
										/>
									</div>
								</Table.Cell>
								{/if}
								<Table.Cell class="font-medium">{r.label}</Table.Cell>
								<Table.Cell class="text-right tabular-nums">{usd(r.linear)}</Table.Cell>
								<Table.Cell class="text-right">
									{#if r.workday}
										<form method="POST" action="?/setUsage" use:enhance={autosave}>
											<input type="hidden" name="date" value={r.date} />
											<Input
												name="usage"
												inputmode="decimal"
												placeholder="-"
												value={r.usage === null ? '' : r.usage.toFixed(2)}
												class="ml-auto h-8 w-24 bg-background text-right tabular-nums"
												onchange={(e) => e.currentTarget.form?.requestSubmit()}
											/>
										</form>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">{usd(r.actual)}</Table.Cell>
								<Table.Cell
									class="text-right tabular-nums {r.remaining !== null && r.remaining < 0
										? 'text-destructive'
										: ''}">{usd(r.remaining)}</Table.Cell
								>
							</Table.Row>
						{/each}
						{#if hiddenFuture > 0}
							{@render moreBar(
								barLabel(showRemaining, hiddenFuture, 'remaining'),
								showRemaining,
								() => (showRemaining = !showRemaining),
								showRemaining,
								'bottom'
							)}
						{/if}
					</Table.Body>
					<Table.Footer>
						<Table.Row class="font-semibold">
							<Table.Cell>{v.daysUsed}</Table.Cell>
							{#if showAll}<Table.Cell></Table.Cell>{/if}
							<Table.Cell></Table.Cell>
							<Table.Cell></Table.Cell>
							<Table.Cell></Table.Cell>
							<Table.Cell class="text-right tabular-nums">{usd(v.totalUsed)}</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{usd(v.totalRemaining)}</Table.Cell>
						</Table.Row>
					</Table.Footer>
				</Table.Root>
			</Card.Content>
		</Card.Root>
		<p class="-mt-3 px-1 text-xs text-muted-foreground">
			Days are UTC days, matching claude.ai’s usage page.
			{#if boundary}
				A day runs {boundary.dayStart} to {boundary.dayStart}
				{boundary.zone}, and the month resets at the same boundary. Spend after {boundary.dayStart}
				{boundary.zone} lands on the next day.
			{/if}
		</p>
		</div>

		<div class="space-y-6">
			<Card.Root>
				<Card.Header class="px-6"><Card.Title>Month summary</Card.Title></Card.Header>
				<Card.Content>
					<div class="space-y-5">
						{#each valueGroups as group, gi (gi)}
							<Table.Root>
								<Table.Body>
									{#if gi === 0}
										<Table.Row class="border-b-0 even:bg-muted/50">
											<Table.Cell class="font-medium">Total allotment</Table.Cell>
											<Table.Cell class="text-right">
												<form method="POST" action="?/setAllotment" use:enhance={autosave}>
													<Input
														name="allotment"
														inputmode="decimal"
														value={v.totalAllotment.toFixed(2)}
														class="ml-auto h-8 w-24 bg-background text-right tabular-nums"
														onchange={(e) => e.currentTarget.form?.requestSubmit()}
													/>
												</form>
											</Table.Cell>
										</Table.Row>
										<Table.Row class="border-b-0 even:bg-muted/50">
											<Table.Cell class="font-medium">Target (optional)</Table.Cell>
											<Table.Cell class="text-right">
												<form
													method="POST"
													action="?/setTarget"
													use:enhance={autosave}
													class="flex items-center justify-end gap-1"
												>
													<Input
														name="target"
														inputmode="decimal"
														placeholder="-"
														aria-label="Target percent of allotment"
														value={v.target === null ? '' : String(v.target)}
														class="h-8 w-20 bg-background text-right tabular-nums"
														onchange={(e) => e.currentTarget.form?.requestSubmit()}
													/>
													<span class="text-muted-foreground">%</span>
												</form>
											</Table.Cell>
										</Table.Row>
									{/if}
									{#each group as [label, value, tone] (label)}
										<Table.Row class="border-b-0 even:bg-muted/50">
											<Table.Cell class="font-medium">{label}</Table.Cell>
											<Table.Cell class="text-right tabular-nums {toneClass(tone)}">
												{#if label === 'Remaining per day'}
													<span
														class="rounded-md bg-amber-100 px-2 py-0.5 font-semibold text-amber-900 dark:bg-amber-400/20 dark:text-amber-200"
														>{value}</span
													>
												{:else}
													{value}
												{/if}
											</Table.Cell>
										</Table.Row>
									{/each}
								</Table.Body>
							</Table.Root>
						{/each}
					</div>
				</Card.Content>
			</Card.Root>
		<Card.Root>
			<Card.Header class="px-6"><Card.Title>History</Card.Title></Card.Header>
			<Card.Content>
				<Table.Root>
					<Table.Body>
						{#each data.history.rows as h, i (h.month)}
							<Table.Row class="border-b-0 {i % 2 ? 'bg-muted/50' : ''}">
								<Table.Cell class="font-medium">
									{#if h.month === data.month}
										<!-- The month you're viewing: plain text instead of a link -->
										<span aria-current="page">{h.label}</span>
									{:else}
										<a
											href="/{h.month}"
											class="underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-foreground"
											>{h.label}</a
										>
									{/if}
									{#if !h.complete}<span class="ml-1.5 text-xs font-normal text-muted-foreground"
											>so far</span
										>{/if}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">{usd(h.total)}</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
					<Table.Footer>
						<Table.Row class="font-semibold">
							<Table.Cell>Average spend per month</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{data.history.average === null ? '-' : usd(data.history.average)}</Table.Cell>
						</Table.Row>
					</Table.Footer>
				</Table.Root>
				{#if data.history.rows.some((h) => !h.complete)}
					<p class="mt-3 text-xs text-muted-foreground">The average only counts finished months.</p>
				{/if}
			</Card.Content>
		</Card.Root>
		</div>
	</div>
</main>
