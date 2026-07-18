/**
 * Calendar-date epoch convention: date-only fields (project start/end, invoice
 * issued/due, quote validUntil, task date) store the UTC midnight of the
 * calendar day, regardless of the browser's timezone. Every form writer must
 * round-trip through these helpers — `date.getTime()` off a local-midnight
 * picker Date stores a value the automation engine's exact-day (`on`)
 * comparisons read as the wrong day.
 */

/** Stored UTC-midnight epoch -> local Date carrying the same calendar day (for pickers). */
export function utcMidnightMsToLocalDate(ms: number): Date {
	const d = new Date(ms);
	return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Picker-selected local Date -> UTC-midnight epoch of that calendar day. */
export function localDateToUtcMidnightMs(d: Date): number {
	return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}
