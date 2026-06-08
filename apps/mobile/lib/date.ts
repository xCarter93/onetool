// UTC-safe date-id helpers. task.date is stored as Date.UTC ms (see backend tasks.ts). All Tasks-surface date math goes through this module — never local getFullYear/getMonth/getDate for task dates.

export function dateIdFromUtcMs(ms: number): string {
	const d = new Date(ms);
	const year = d.getUTCFullYear();
	const month = String(d.getUTCMonth() + 1).padStart(2, "0");
	const day = String(d.getUTCDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function utcMsFromDateId(dateId: string): number {
	const [y, m, d] = dateId.split("-").map(Number);
	return Date.UTC(y, m - 1, d);
}

export function todayUtcDateId(): string {
	return dateIdFromUtcMs(Date.now());
}

export function utcDayStartMs(ms: number): number {
	const dt = new Date(ms);
	return Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}
