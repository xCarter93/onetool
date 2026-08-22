import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getCurrentUserOrgIdOrNull } from "./auth";
import {
	PREMIUM_PLAN_SLUG,
	readPremiumOverride,
} from "./permissions";

/**
 * Unified entitlement layer (PRD-packaging-entitlements P0).
 *
 * One map defines every commercial capability for both tiers; the resolvers
 * below enforce it. This file encodes the END-STATE packaging (Slice A,
 * 2026-08-22): no stock caps, volume meters enforced from day one, and four
 * scale-the-operation switches on Business. Packaging changes are value edits
 * here, never new call-site hunts.
 *
 * Clerk is plan truth (webhook → org doc slug+status); this map is feature
 * truth. Clerk's `pla`/`fea` claims cannot ride Convex's custom JWT template.
 */

export type PlanTier = "free" | "business";

export type PlanSource =
	| "actorOverride"
	| "orgOverride"
	| "subscription"
	| "trial"
	| "grace"
	| "free";

export interface ResolvedPlan {
	plan: PlanTier;
	source: PlanSource;
}

/** Grace window after a paying org loses its subscription status. */
export const PLAN_GRACE_MS = 72 * 60 * 60 * 1000;

/** Subscription statuses under which the paid plan grants access. */
export const PREMIUM_STATUSES: ReadonlySet<string> = new Set([
	"active",
	"trialing",
]);

// ---------------------------------------------------------------------------
// The map
// ---------------------------------------------------------------------------

/** Exact denial shape a gate site emits today — preserved so shipped mobile
 * builds keep decoding errors identically after call sites migrate (P1). */
type DenyShape =
	| { type: "error"; message: string } // plain Error throw
	| { type: "convexErrorString"; message: string } // ConvexError("<string>"), no code
	| { type: "soft" }; // site returns a result object / skips — never throws

interface SwitchRow {
	kind: "switch";
	free: boolean;
	business: boolean;
	/** Kill switch: false = row not enforced (everyone allowed). */
	enforce: boolean;
	deny: DenyShape;
}

interface MeterRow {
	kind: "meter";
	free: number | null; // null = unlimited
	business: number | null;
	period: "calendarMonth" | "day" | "lifetime";
	enforce: boolean;
	advertised: boolean;
}

export type FeatureKey =
	| "aiAssistant"
	| "routing"
	| "quickbooks"
	| "llmCsvImport"
	| "scheduledAutomationRuns"
	| "automationEmails"
	| "automationPublish"
	| "nlReportGeneration"
	| "portalBadgeRemoval"
	| "customSkus"
	| "orgDocuments"
	| "stripeConnect";

export type MeterKey =
	| "esignatures"
	| "clientSends"
	| "clients"
	| "activeProjectsPerClient"
	| "assistantMessages"
	| "savedReports"
	| "importedRows";

const businessSwitch = (deny: DenyShape): SwitchRow => ({
	kind: "switch",
	free: false,
	business: true,
	enforce: true,
	deny,
});

/** Flipped-free row: kept as documentation/UI marker + kill-switch symmetry.
 * The deny shape is frozen for shipped mobile builds should the row ever
 * flip back; with free:true it is never thrown. */
const freeForAll = (deny: DenyShape): SwitchRow => ({
	kind: "switch",
	free: true,
	business: true,
	enforce: true,
	deny,
});

export const FEATURES: Record<FeatureKey, SwitchRow> = {
	// Access for all; volume rides the assistantMessages meter.
	aiAssistant: freeForAll({
		type: "error",
		message: "The AI assistant is available on the Business plan. Upgrade to use it.",
	}),
	routing: businessSwitch({
		type: "error",
		message: "Route planning is available on the Business plan. Upgrade to use it.",
	}),
	quickbooks: businessSwitch({
		type: "convexErrorString",
		message: "QuickBooks sync is available on the Business plan. Upgrade to use it.",
	}),
	// Access for all; volume rides the importedRows meter + ops caps.
	llmCsvImport: freeForAll({ type: "soft" }),
	scheduledAutomationRuns: businessSwitch({ type: "soft" }),
	automationEmails: businessSwitch({ type: "soft" }),
	automationPublish: businessSwitch({
		type: "convexErrorString",
		message: "Publishing automations is available on the Business plan. Upgrade to publish.",
	}),
	// Gated at the reportConfigGeneration pipeline entry; denial is a
	// structured tool result the assistant relays — never a throw.
	nlReportGeneration: businessSwitch({ type: "soft" }),
	// Display only: free portals show the "Powered by OneTool" footer badge.
	portalBadgeRemoval: businessSwitch({ type: "soft" }),
	// UI-lock-only rows, flipped free at Slice A (never server-gated).
	customSkus: freeForAll({ type: "soft" }),
	orgDocuments: freeForAll({ type: "soft" }),
	stripeConnect: freeForAll({ type: "soft" }),
};

export const METERS: Record<MeterKey, MeterRow> = {
	esignatures: {
		kind: "meter",
		free: 5,
		business: null,
		period: "calendarMonth",
		enforce: true,
		advertised: true,
	},
	// Debited only on the first draft→sent transition in the sendToClient
	// mutations; resends never debit. +10 bonus in months with ≥1 Stripe
	// collection (granted once per period in applyMarkPaidCascade).
	clientSends: {
		kind: "meter",
		free: 20,
		business: null,
		period: "calendarMonth",
		enforce: true,
		advertised: true,
	},
	// Stock caps deleted at Slice A — rows kept for display/kill-switch
	// symmetry (null = unlimited on both tiers).
	clients: {
		kind: "meter",
		free: null,
		business: null,
		period: "lifetime",
		enforce: true,
		advertised: true,
	},
	activeProjectsPerClient: {
		kind: "meter",
		free: null,
		business: null,
		period: "lifetime",
		enforce: true,
		advertised: false,
	},
	// Org-shared, UTC day; debited per user message in assistantChat.sendMessage.
	assistantMessages: {
		kind: "meter",
		free: 10,
		business: null,
		period: "day",
		enforce: true,
		advertised: true,
	},
	// Current-count semantics (usedOverride from a live count; delete frees a
	// slot) — never consumeMeter'd. Over-cap orgs are grandfathered: existing
	// rows stay, creation refuses.
	savedReports: {
		kind: "meter",
		free: 5,
		business: null,
		period: "lifetime",
		enforce: true,
		advertised: true,
	},
	// Lifetime import budget; only rows actually written debit.
	importedRows: {
		kind: "meter",
		free: 2000,
		business: null,
		period: "lifetime",
		enforce: true,
		advertised: true,
	},
};

// ---------------------------------------------------------------------------
// Plan resolution (pure)
// ---------------------------------------------------------------------------

export interface PlanResolutionInput {
	/** User-level override (JWT publicMetadata or users.hasPremiumFeatureAccess).
	 * Strict `=== true`: Clerk revokes by writing the key back as `null`. */
	actorOverride?: boolean | null;
	/** Org-level override (JWT orgPublicMetadata or org doc mirror). */
	orgOverride?: boolean | null;
	clerkPlanSlug?: string;
	subscriptionStatus?: string;
	/** Reverse-trial / gift end (org doc, visible to identity-less contexts). */
	trialEndsAt?: number;
	/** 72h grace after a premium loss (org doc). */
	graceUntil?: number;
	now: number;
}

/** Pure, never throws. Unauthenticated/absent input resolves to free. */
export function resolvePlan(input: PlanResolutionInput): ResolvedPlan {
	if (input.actorOverride === true) {
		return { plan: "business", source: "actorOverride" };
	}
	if (input.orgOverride === true) {
		return { plan: "business", source: "orgOverride" };
	}
	if (
		input.clerkPlanSlug === PREMIUM_PLAN_SLUG &&
		PREMIUM_STATUSES.has(input.subscriptionStatus ?? "")
	) {
		return { plan: "business", source: "subscription" };
	}
	if (input.trialEndsAt !== undefined && input.trialEndsAt > input.now) {
		return { plan: "business", source: "trial" };
	}
	if (input.graceUntil !== undefined && input.graceUntil > input.now) {
		return { plan: "business", source: "grace" };
	}
	return { plan: "free", source: "free" };
}

// Structural (not Doc-derived) so parity tests and legacy helpers can share
// plain-object fixtures; Doc<"organizations"> is assignable to it.
interface OrgPlanFields {
	clerkPlanSlug?: string;
	subscriptionStatus?: string;
	hasPremiumFeatureAccess?: boolean;
	trialEndsAt?: number;
	planGraceUntil?: number;
}

/**
 * Docs path — crons/automations and any context holding the org doc (and
 * optionally the acting user). A user-level override grants to that actor
 * only, never the org.
 */
export function entitlementsFromDocs(
	org: OrgPlanFields | null,
	actor?: { hasPremiumFeatureAccess?: boolean } | null,
	now: number = Date.now()
): ResolvedPlan {
	return resolvePlan({
		actorOverride: actor?.hasPremiumFeatureAccess,
		orgOverride: org?.hasPremiumFeatureAccess,
		clerkPlanSlug: org?.clerkPlanSlug,
		subscriptionStatus: org?.subscriptionStatus,
		trialEndsAt: org?.trialEndsAt,
		graceUntil: org?.planGraceUntil,
		now,
	});
}

interface IdentityMetadataBags {
	publicMetadata?: unknown;
	public_metadata?: unknown;
	orgPublicMetadata?: unknown;
	org_public_metadata?: unknown;
	[key: string]: unknown;
}

/**
 * Identity path — JWT overrides are the fast path (no db read), the org doc is
 * plan truth. Mirrors lib/permissions.hasPremiumAccess exactly, plus the
 * trial/grace windows. Never throws; unauthenticated resolves to free.
 */
export async function entitlementsFromIdentity(
	ctx: QueryCtx | MutationCtx,
	now: number = Date.now()
): Promise<ResolvedPlan> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		return { plan: "free", source: "free" };
	}
	const token = identity as IdentityMetadataBags;
	if (readPremiumOverride(token.publicMetadata ?? token.public_metadata)) {
		return { plan: "business", source: "actorOverride" };
	}
	if (readPremiumOverride(token.orgPublicMetadata ?? token.org_public_metadata)) {
		return { plan: "business", source: "orgOverride" };
	}
	const orgId = await getCurrentUserOrgIdOrNull(ctx);
	if (!orgId) {
		return { plan: "free", source: "free" };
	}
	const org = await ctx.db.get(orgId);
	return entitlementsFromDocs(org, null, now);
}

// ---------------------------------------------------------------------------
// Enforcement — the ONLY two error shapes ever emitted
// ---------------------------------------------------------------------------

export const PLAN_LIMIT_ERROR_CODE = "PLAN_LIMIT_REACHED";

export function isFeatureAllowed(plan: PlanTier, key: FeatureKey): boolean {
	const row = FEATURES[key];
	if (!row.enforce) return true;
	return row[plan];
}

function throwDeny(deny: DenyShape): never {
	switch (deny.type) {
		case "error":
			throw new Error(deny.message);
		case "convexErrorString":
			throw new ConvexError(deny.message);
		case "soft":
			// Soft rows never throw — their sites consult isFeatureAllowed and
			// return result objects / record skips. Reaching here is a wiring bug.
			throw new Error("Entitlement misconfiguration: soft-denied feature passed to requireFeature");
	}
}

/** Identity-path gate. Throws the site's existing denial shape (see DenyShape). */
export async function requireFeature(
	ctx: QueryCtx | MutationCtx,
	key: FeatureKey
): Promise<void> {
	const { plan } = await entitlementsFromIdentity(ctx);
	if (isFeatureAllowed(plan, key)) return;
	throwDeny(FEATURES[key].deny);
}

// ---------------------------------------------------------------------------
// Meters — planUsage-backed
// ---------------------------------------------------------------------------

/** UTC period key: "2026-08" (calendarMonth), "2026-08-22" (day), "lifetime". */
export function periodKeyFor(
	period: MeterRow["period"],
	now: number = Date.now()
): string {
	if (period === "lifetime") return "lifetime";
	const d = new Date(now);
	const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
	if (period === "calendarMonth") return month;
	return `${month}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** First instant after the current period, for "resets on" display. */
export function periodResetAt(
	period: MeterRow["period"],
	now: number = Date.now()
): number | null {
	const d = new Date(now);
	if (period === "calendarMonth") {
		return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
	}
	if (period === "day") {
		return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
	}
	return null;
}

async function getUsageRow(
	ctx: QueryCtx | MutationCtx,
	orgId: Id<"organizations">,
	key: MeterKey,
	now: number
): Promise<Doc<"planUsage"> | null> {
	const periodKey = periodKeyFor(METERS[key].period, now);
	return await ctx.db
		.query("planUsage")
		.withIndex("by_org_meter_period", (q) =>
			q.eq("orgId", orgId).eq("meter", key).eq("periodKey", periodKey)
		)
		.unique();
}

export interface MeterUsage {
	key: MeterKey;
	used: number;
	/** Effective limit for the resolved plan incl. bonus; null = unlimited. */
	limit: number | null;
	remaining: number | null;
	resetsAt: number | null;
}

/**
 * Usage from the planUsage store for the given plan tier. `usedOverride`
 * substitutes an externally-computed tally for meters whose counts don't live
 * in planUsage yet (e-signatures from the documents table, clients from the
 * live cap-count query).
 */
export async function getMeterUsage(
	ctx: QueryCtx | MutationCtx,
	orgId: Id<"organizations">,
	key: MeterKey,
	plan: PlanTier,
	options?: { now?: number; usedOverride?: number }
): Promise<MeterUsage> {
	const now = options?.now ?? Date.now();
	const row = METERS[key];
	const usage = await getUsageRow(ctx, orgId, key, now);
	const used = options?.usedOverride ?? usage?.used ?? 0;
	const base = row[plan];
	const limit = base === null ? null : base + (usage?.bonus ?? 0);
	return {
		key,
		used,
		limit,
		remaining: limit === null ? null : Math.max(0, limit - used),
		resetsAt: periodResetAt(row.period, now),
	};
}

/**
 * Refuse when the meter is exhausted. Emits the frozen mobile-decodable shape:
 * ConvexError({ code: "PLAN_LIMIT_REACHED", feature, message }).
 * Messages are price-free and plan-name-free (Apple anti-steering).
 */
export async function requireMeter(
	ctx: QueryCtx | MutationCtx,
	orgId: Id<"organizations">,
	key: MeterKey,
	plan: PlanTier,
	options?: { now?: number; usedOverride?: number }
): Promise<void> {
	const row = METERS[key];
	if (!row.enforce) return;
	const { limit, used } = await getMeterUsage(ctx, orgId, key, plan, options);
	if (limit === null || used < limit) return;
	throw new ConvexError({
		code: PLAN_LIMIT_ERROR_CODE,
		feature: key,
		message: meterLimitMessage(key),
	});
}

function meterLimitMessage(key: MeterKey): string {
	switch (key) {
		case "esignatures":
			return "You've used all of this month's e-signature requests. They reset at the start of next month.";
		case "clientSends":
			return "You've used all of this month's document sends. They reset at the start of next month.";
		case "clients":
			return "You've reached this plan's client limit.";
		case "activeProjectsPerClient":
			return "You've reached this plan's active project limit for this client.";
		case "assistantMessages":
			return "You've used today's assistant messages. They reset at midnight UTC.";
		case "savedReports":
			return "You've reached this plan's saved report limit. Delete a report to free a slot.";
		case "importedRows":
			return "You've reached this plan's imported row limit.";
	}
}

/**
 * Same-transaction debit. Runs inside the owning mutation, so a later throw in
 * that mutation rolls the debit back with everything else.
 */
export async function consumeMeter(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	key: MeterKey,
	options?: { now?: number; amount?: number }
): Promise<void> {
	const now = options?.now ?? Date.now();
	const amount = options?.amount ?? 1;
	if (amount <= 0) return;
	const existing = await getUsageRow(ctx, orgId, key, now);
	if (existing) {
		await ctx.db.patch(existing._id, { used: existing.used + amount });
		return;
	}
	await ctx.db.insert("planUsage", {
		orgId,
		meter: key,
		periodKey: periodKeyFor(METERS[key].period, now),
		used: amount,
	});
}

/** Grant bonus capacity on the current period (e.g. the Stripe-collection +10).
 * `once: true` makes the grant idempotent per period — a second qualifying
 * event in the same period is a no-op. */
export async function grantMeterBonus(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	key: MeterKey,
	amount: number,
	options?: { now?: number; once?: boolean }
): Promise<void> {
	const now = options?.now ?? Date.now();
	const existing = await getUsageRow(ctx, orgId, key, now);
	if (existing) {
		if (options?.once && (existing.bonus ?? 0) > 0) return;
		await ctx.db.patch(existing._id, { bonus: (existing.bonus ?? 0) + amount });
		return;
	}
	await ctx.db.insert("planUsage", {
		orgId,
		meter: key,
		periodKey: periodKeyFor(METERS[key].period, now),
		used: 0,
		bonus: amount,
	});
}
