/** The sample day, one entry per hero step: the clock, its share of 8 AM to 5 PM, and how long the step holds. One job, yard to payout. */
export const DAY = [
	{ clock: "8:40 AM", at: 0.0741, hold: 2000 },
	{ clock: "9:00 AM", at: 0.1111, hold: 2000 },
	{ clock: "10:42 AM", at: 0.3, hold: 3000 },
	{ clock: "11:00 AM", at: 0.3333, hold: 2000 },
	{ clock: "1:30 PM", at: 0.6111, hold: 2000 },
	{ clock: "1:40 PM", at: 0.6296, hold: 2200 },
	{ clock: "1:52 PM", at: 0.6519, hold: 3400 },
	{ clock: "5:00 PM", at: 1, hold: 2600 },
] as const;

export const FINAL_STEP = DAY.length - 1;
/** The rewind beat after 5 PM: the playhead runs back to the start while the cards reset. */
export const RESET_STEP = DAY.length;
export const RESET_HOLD = 900;
export const PAID_STEP = 6;

/** Steps `first` to `last` as a `data-on` list (landing.css lights an element while the step is in its list). */
export function through(first: number, last: number = FINAL_STEP) {
	return Array.from({ length: last - first + 1 }, (_, i) => first + i).join(" ");
}
