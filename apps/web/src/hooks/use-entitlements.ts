"use client";

import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { FeatureKey, MeterUsage, MyEntitlements } from "@onetool/backend";

export interface Entitlements {
	/** Raw backend resolution; undefined while loading. */
	entitlements: MyEntitlements | undefined;
	isLoading: boolean;
	plan: "free" | "business";
	isBusiness: boolean;
	/** True when the resolved plan allows the feature (kill switches applied server-side). */
	allows: (key: FeatureKey) => boolean;
	meter: (key: string) => MeterUsage | undefined;
}

/**
 * The one frontend plan read (PRD-packaging-entitlements P1): wraps
 * entitlements.getMine, the backend-resolved plan — overrides, trial, and
 * grace included. Replaces useFeatureAccess and every client-side Clerk
 * has({plan}) check; the server enforcing a gate and the UI locking it now
 * read the same map.
 *
 * While loading, `allows` returns false and `isBusiness` is false — gated UI
 * renders locked-by-default, matching the old hook's behavior.
 */
export function useEntitlements(): Entitlements {
	const entitlements = useQuery(api.entitlements.getMine, {});
	const plan = entitlements?.plan ?? "free";
	return {
		entitlements,
		isLoading: entitlements === undefined,
		plan,
		isBusiness: plan === "business",
		allows: (key) => entitlements?.features[key] ?? false,
		meter: (key) => entitlements?.meters.find((m) => m.key === key),
	};
}
