export const usd = (n: number | null | undefined): string => {
	if (n === null || n === undefined) return '';
	const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	return `${n < 0 ? '-' : ''}$${s}`;
};

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 23 -> "23rd" */
export const ordinal = (n: number): string => {
	const mod100 = n % 100;
	if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
	return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
};

export const pct =(n: number | null | undefined): string =>
	n === null || n === undefined ? '-' : `${(n * 100).toFixed(2)}%`;
