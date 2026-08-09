"use client";

import { useFeatureFlagEnabled } from "posthog-js/react";
import { FLAG_QUICKBOOKS } from "@/lib/feature-flags";

/**
 * Whether QuickBooks is available to this user.
 *
 * Fails closed: the hook yields `undefined` while flags are still loading and
 * whenever PostHog is blocked or unreachable, and both collapse to `false` —
 * an unproven user sees the locked "Coming Soon" state rather than a connect
 * button the server would refuse anyway.
 */
export function useQuickBooksEnabled(): boolean {
	return useFeatureFlagEnabled(FLAG_QUICKBOOKS) === true;
}
