/**
 * Scene-local number formatting. Deliberately NOT `@/lib/money` — that module
 * is app runtime code (and would drag the web bundle into the render graph);
 * these are hardcoded demo amounts that only ever need one shape.
 */

const grouped = (whole: number) =>
	String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** `$2,850.00` — for counters, pass the interpolated value straight in. */
export const usd = (amount: number): string => {
	const cents = Math.round(Math.abs(amount) * 100);
	const whole = Math.floor(cents / 100);
	const rest = cents % 100;
	return `$${grouped(whole)}.${String(rest).padStart(2, "0")}`;
};
