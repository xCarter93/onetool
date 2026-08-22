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
import { computeEsignaturesSentThisMonth } from "./usage";

export interface MyEntitlements {
	plan: PlanTier;
	source: PlanSource;
	features: Record<FeatureKey, boolean>;
	meters: MeterUsage[];
	/** Present only while source === "trial" — drives the header countdown. */
	trialEndsAt?: number;
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

		// Only actionable (finite-limit) meters ship — an unlimited meter has
		// nothing to display or enforce, so business orgs get an empty list.
		const meters: MeterUsage[] = [];
		if (org) {
			// E-signatures still count from the documents table (deliberately
			// left on the legacy counter — it works and the kill switch works).
			const esigUsage = await getMeterUsage(
				ctx,
				ctx.orgId,
				"esignatures",
				resolved.plan,
				{
					usedOverride: await computeEsignaturesSentThisMonth(
						ctx,
						org,
						ctx.orgId
					),
				}
			);
			if (esigUsage.limit !== null) meters.push(esigUsage);

			// planUsage-native meters (Slice A).
			for (const key of [
				"clientSends",
				"assistantMessages",
				"importedRows",
			] as const) {
				const usage = await getMeterUsage(ctx, ctx.orgId, key, resolved.plan);
				if (usage.limit !== null) meters.push(usage);
			}

			// Saved reports: current-count semantics, same live count the slot
			// check enforces. Bounded well above the cap so a grandfathered org
			// displays its real 7/5, not a clamped 5/5.
			const reportCap = METERS.savedReports[resolved.plan];
			if (reportCap !== null) {
				const savedReports = await ctx.db
					.query("reports")
					.withIndex("by_org", (q) => q.eq("orgId", ctx.orgId!))
					.take(reportCap * 5)
					.then((rows) => rows.length);
				const usage = await getMeterUsage(
					ctx,
					ctx.orgId,
					"savedReports",
					resolved.plan,
					{ usedOverride: savedReports }
				);
				if (usage.limit !== null) meters.push(usage);
			}
		}

		return {
			plan: resolved.plan,
			source: resolved.source,
			features: featureMap(resolved.plan),
			meters,
			...(resolved.source === "trial" && org?.trialEndsAt
				? { trialEndsAt: org.trialEndsAt }
				: {}),
		};
	},
});
