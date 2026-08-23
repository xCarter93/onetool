/**
 * Launch-offer promo codes, mirrored from the Clerk dashboard discounts
 * (Clerk has no API to read discount definitions, so this file is the app's
 * source of truth for display). Both codes expire together; every surface
 * gates on isLaunchPromoActive() so the whole campaign self-retires at endsAt
 * with no code changes.
 */
export const LAUNCH_PROMO = {
	monthly: {
		code: "START50-K7M2",
		label: "50% off your first 3 months",
	},
	annual: {
		code: "YEAR20-V8XR",
		label: "20% off your first year",
	},
	/** Matches the discounts' expiry in Clerk: Nov 23 2026, 3:52 PM EST. */
	endsAt: Date.parse("2026-11-23T15:52:00-05:00"),
	endsLabel: "November 23",
	headline: "up to 50% off",
} as const;

export function isLaunchPromoActive(now: number = Date.now()): boolean {
	return now < LAUNCH_PROMO.endsAt;
}
