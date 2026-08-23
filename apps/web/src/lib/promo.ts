import * as React from "react";

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

// setTimeout clamps its delay at 2^31-1 ms (~24.8 days), so chain shorter
// timers until the deadline actually passes.
function subscribeToExpiry(onExpire: () => void): () => void {
	let id: number | undefined;
	const arm = () => {
		const remaining = LAUNCH_PROMO.endsAt - Date.now();
		if (remaining <= 0) {
			return;
		}
		id = window.setTimeout(() => {
			if (isLaunchPromoActive()) {
				arm();
			} else {
				onExpire();
			}
		}, Math.min(remaining, 0x7fffffff));
	};
	arm();
	return () => window.clearTimeout(id);
}

/**
 * Live variant of isLaunchPromoActive for promo surfaces: re-renders at the
 * deadline so an open tab drops the offer the moment it expires, and keeps
 * server and client renders in sync during hydration.
 */
export function useLaunchPromoActive(): boolean {
	return React.useSyncExternalStore(
		subscribeToExpiry,
		isLaunchPromoActive,
		isLaunchPromoActive,
	);
}
