/** The sample job, one entry per hero step: the clock, its share of 8 AM to 2 PM, and how long the step holds. Quote sent to paid in one day. */
export const DAY = [
	{ clock: "8:12 AM", at: 0.0333, hold: 3000 },
	{ clock: "10:42 AM", at: 0.45, hold: 3000 },
	{ clock: "1:30 PM", at: 0.9167, hold: 1800 },
	{ clock: "1:40 PM", at: 0.9444, hold: 2000 },
	{ clock: "1:52 PM", at: 0.9778, hold: 4400 },
] as const;

export const SIGNED_STEP = 1;
export const INVOICE_STEP = 3;
export const PAID_STEP = 4;
export const FINAL_STEP = DAY.length - 1;
/** The rewind beat after payment: the sheet clears while the playhead runs back to the start. */
export const RESET_STEP = DAY.length;
export const RESET_HOLD = 900;

/** Steps `first` to `last` as a `data-on` list (landing.css lights an element while the step is in its list). */
export function through(first: number, last: number = FINAL_STEP) {
	return Array.from({ length: last - first + 1 }, (_, i) => first + i).join(" ");
}
