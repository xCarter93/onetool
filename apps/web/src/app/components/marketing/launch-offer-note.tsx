"use client";

import { LAUNCH_PROMO, useLaunchPromoActive } from "@/lib/promo";

/* Client island so the note self-retires at the promo deadline even on a
 * statically rendered page (hydration removes it once the window closes). */
export function LaunchOfferNote() {
	const promoActive = useLaunchPromoActive();
	if (!promoActive) {
		return null;
	}

	return (
		<p className="mt-[14px] flex items-center gap-2 text-sm font-medium text-(--accent-ink)">
			<span
				aria-hidden="true"
				className="h-[7px] w-[7px] flex-none rounded-full bg-(--accent)"
			/>
			Launch offer: {LAUNCH_PROMO.headline}. Claim your code at signup.
		</p>
	);
}
