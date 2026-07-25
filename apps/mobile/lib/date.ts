// Date helpers for the Tasks surface.
//
// TWO KINDS OF VALUE LIVE HERE — conflating them is a bug we shipped once:
//
//   * A DATE-ID is a calendar date with no time, stored as `Date.UTC(y, m, d)`
//     (see backend tasks.ts). `task.date` is one. Normalise and compare date-ids
//     with the UTC accessors — `utcDayStartMs`, `dateIdFromUtcMs`.
//
//   * An INSTANT is a moment, e.g. `Date.now()`. Deriving a date-id FROM an
//     instant must go through the *local* calendar — `localDayStartMs` /
//     `todayDateId` — because the user's "today" is their wall calendar, not
//     UTC's. Flooring an instant in UTC rolls "today" over at 5pm Pacific, which
//     marked in-progress evening jobs Overdue and opened Today on tomorrow.
//
// So: compare date-ids in UTC, derive them from instants in local time.

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

/**
 * The date-id of the LOCAL calendar day containing `ms`. The only correct way to
 * turn an instant into a date-id — see the module header.
 */
export function localDayStartMs(ms: number): number {
	const d = new Date(ms);
	return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Today's date-id, on the user's wall calendar. */
export function todayDateId(): string {
	return dateIdFromUtcMs(localDayStartMs(Date.now()));
}

/**
 * Normalise a DATE-ID to its UTC midnight — a no-op for well-formed date-ids,
 * used to compare them. Do NOT pass an instant; use `localDayStartMs`.
 */
export function utcDayStartMs(ms: number): number {
	const dt = new Date(ms);
	return Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}
