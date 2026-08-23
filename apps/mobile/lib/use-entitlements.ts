import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

type MyEntitlements = FunctionReturnType<typeof api.entitlements.getMine>;
type MeterUsage = MyEntitlements["meters"][number];
type FeatureKey = keyof MyEntitlements["features"];
type MeterKey = MeterUsage["key"];

/**
 * Mobile mirror of the web `useEntitlements` hook: one `getMine` read plus
 * helpers over the server-resolved plan contract.
 *
 * While loading, `allows` returns false and `meter` returns undefined — gated
 * UI renders locked-by-default. `meter(key) === undefined` is ambiguous
 * (loading, business — only finite-limit meters ship — or signed out), so
 * anything that DISABLES an action on a meter must also check the meter's
 * fields, never just its presence.
 */
export function useEntitlements() {
	const entitlements = useQuery(api.entitlements.getMine, {});
	const plan = entitlements?.plan ?? "free";
	return {
		isLoading: entitlements === undefined,
		plan,
		isBusiness: plan === "business",
		allows: (key: FeatureKey) => entitlements?.features[key] ?? false,
		meter: (key: MeterKey): MeterUsage | undefined =>
			entitlements?.meters.find((m) => m.key === key),
	};
}
