import { optionalUserQuery } from "./lib/factories";
import {
	FEATURES,
	METERS,
	entitlementsFromDocs,
	entitlementsFromIdentity,
	getMeterUsage,
	isFeatureAllowed,
	type FeatureKey,
	type MeterUsage,
	type PlanSource,
	type PlanTier,
} from "./lib/entitlements";
import { countCountedClients } from "./lib/planCaps";
import { computeEsignaturesSentThisMonth } from "./usage";

export interface MyEntitlements {
	plan: PlanTier;
	source: PlanSource;
	features: Record<FeatureKey, boolean>;
	meters: MeterUsage[];
}

const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

function featureMap(plan: PlanTier): Record<FeatureKey, boolean> {
	return Object.fromEntries(
		FEATURE_KEYS.map((key) => [key, isFeatureAllowed(plan, key)])
	) as Record<FeatureKey, boolean>;
}

/**
 * The one frontend entitlement read for web AND mobile. Optional-user and
 * never throws: unauthenticated callers get the free-plan shape. The resolved
 * plan includes overrides, trial, and grace — unlike Clerk's client-side
 * has({plan}), which this query replaces (P1).
 */
export const getMine = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<MyEntitlements> => {
		if (!ctx.user || !ctx.orgId) {
			return {
				plan: "free",
				source: "free",
				features: featureMap("free"),
				meters: [],
			};
		}

		const org = await ctx.db.get(ctx.orgId);
		// Identity path first (JWT overrides), doc fields for trial/grace.
		const identityResolved = await entitlementsFromIdentity(ctx);
		const resolved =
			identityResolved.plan === "business"
				? identityResolved
				: entitlementsFromDocs(org, ctx.user);

		const meters: MeterUsage[] = [];
		if (org) {
			// E-signatures still count from the documents table (the planUsage
			// store takes over when the send meter wires up at P5).
			const esigUsed = await computeEsignaturesSentThisMonth(
				ctx,
				org,
				ctx.orgId
			);
			meters.push(
				await getMeterUsage(ctx, ctx.orgId, "esignatures", resolved.plan, {
					usedOverride: esigUsed,
				})
			);

			// Clients count from the same live query the cap enforcement uses
			// (planCaps). The count is clamped at the free cap — enough for every
			// display, and it keeps the read bounded on unlimited plans.
			const clientCap = METERS.clients.free ?? 0;
			const clientsUsed =
				clientCap > 0 ? await countCountedClients(ctx, ctx.orgId, clientCap) : 0;
			meters.push(
				await getMeterUsage(ctx, ctx.orgId, "clients", resolved.plan, {
					usedOverride: clientsUsed,
				})
			);
		}

		return {
			plan: resolved.plan,
			source: resolved.source,
			features: featureMap(resolved.plan),
			meters,
		};
	},
});
