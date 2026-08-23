"use client";

import { useEntitlements } from "@/hooks/use-entitlements";

/**
 * Pre-flight for the clientSends meter on send surfaces. Only FIRST sends
 * debit (resends are keyed off firstSentAt and never charge), so callers must
 * apply `exhausted` only to documents that have not been sent yet. `exhausted`
 * stays false until the meter resolves, so buttons don't flash disabled.
 */
export function useClientSendMeter() {
	const { meter } = useEntitlements();
	const sends = meter("clientSends");
	const exhausted =
		sends !== undefined && sends.remaining !== null && sends.remaining <= 0;
	return {
		exhausted,
		reason: exhausted
			? `You've used all ${sends.limit} document sends this month. They reset on the 1st. Upgrade for unlimited.`
			: undefined,
	};
}
