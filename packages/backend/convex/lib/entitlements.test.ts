import { describe, it, expect } from "vitest";
import {
	FEATURES,
	METERS,
	PLAN_GRACE_MS,
	entitlementsFromDocs,
	isFeatureAllowed,
	periodKeyFor,
	periodResetAt,
	resolvePlan,
} from "./entitlements";
import { orgHasPremiumPlan, userHasPremiumOverride, PREMIUM_PLAN_SLUG } from "./permissions";

const NOW = Date.UTC(2026, 7, 22, 12, 0, 0); // 2026-08-22T12:00Z

describe("resolvePlan semantics table", () => {
	it("resolves empty input (unauthenticated) to free, never throws", () => {
		expect(resolvePlan({ now: NOW })).toEqual({ plan: "free", source: "free" });
	});

	it("actor override is strict === true", () => {
		expect(resolvePlan({ actorOverride: true, now: NOW }).plan).toBe("business");
		// Clerk revokes by writing the key back as null — must read free.
		expect(resolvePlan({ actorOverride: null, now: NOW }).plan).toBe("free");
		expect(resolvePlan({ actorOverride: false, now: NOW }).plan).toBe("free");
	});

	it("org override is strict === true and outranked by actor override", () => {
		expect(resolvePlan({ orgOverride: true, now: NOW })).toEqual({
			plan: "business",
			source: "orgOverride",
		});
		expect(resolvePlan({ orgOverride: null, now: NOW }).plan).toBe("free");
		expect(
			resolvePlan({ actorOverride: true, orgOverride: true, now: NOW }).source
		).toBe("actorOverride");
	});

	it("subscription grants only on the paid slug with an eligible status", () => {
		for (const subscriptionStatus of ["active", "trialing"]) {
			expect(
				resolvePlan({
					clerkPlanSlug: PREMIUM_PLAN_SLUG,
					subscriptionStatus,
					now: NOW,
				})
			).toEqual({ plan: "business", source: "subscription" });
		}
		for (const subscriptionStatus of [
			"past_due",
			"canceled",
			"ended",
			"abandoned",
			"expired",
			"incomplete",
			"upcoming",
			undefined,
		]) {
			expect(
				resolvePlan({
					clerkPlanSlug: PREMIUM_PLAN_SLUG,
					subscriptionStatus,
					now: NOW,
				}).plan
			).toBe("free");
		}
		// Right status, wrong slug (free_org rides along in Clerk items).
		expect(
			resolvePlan({
				clerkPlanSlug: "free_org",
				subscriptionStatus: "active",
				now: NOW,
			}).plan
		).toBe("free");
	});

	it("trial window grants until its end, exclusive", () => {
		expect(resolvePlan({ trialEndsAt: NOW + 1, now: NOW })).toEqual({
			plan: "business",
			source: "trial",
		});
		expect(resolvePlan({ trialEndsAt: NOW, now: NOW }).plan).toBe("free");
		expect(resolvePlan({ trialEndsAt: NOW - 1, now: NOW }).plan).toBe("free");
	});

	it("grace window grants until its end, exclusive", () => {
		expect(resolvePlan({ graceUntil: NOW + PLAN_GRACE_MS, now: NOW })).toEqual({
			plan: "business",
			source: "grace",
		});
		expect(resolvePlan({ graceUntil: NOW, now: NOW }).plan).toBe("free");
	});

	it("subscription outranks trial and grace in source attribution", () => {
		expect(
			resolvePlan({
				clerkPlanSlug: PREMIUM_PLAN_SLUG,
				subscriptionStatus: "active",
				trialEndsAt: NOW + 1000,
				graceUntil: NOW + 1000,
				now: NOW,
			}).source
		).toBe("subscription");
	});
});

describe("docs-path parity with the legacy helpers", () => {
	// The safety net for the P1 migration: with no trial/grace fields set, the
	// new resolver must agree with orgHasPremiumPlan || userHasPremiumOverride
	// for every org/user state the legacy helpers can see.
	const orgStates = [
		null,
		{},
		{ clerkPlanSlug: PREMIUM_PLAN_SLUG, subscriptionStatus: "active" },
		{ clerkPlanSlug: PREMIUM_PLAN_SLUG, subscriptionStatus: "trialing" },
		{ clerkPlanSlug: PREMIUM_PLAN_SLUG, subscriptionStatus: "canceled" },
		{ clerkPlanSlug: PREMIUM_PLAN_SLUG, subscriptionStatus: "past_due" },
		{ clerkPlanSlug: PREMIUM_PLAN_SLUG },
		{ clerkPlanSlug: "free_org", subscriptionStatus: "active" },
		{ hasPremiumFeatureAccess: true },
		{ hasPremiumFeatureAccess: false },
		{ hasPremiumFeatureAccess: null as unknown as boolean },
		{
			hasPremiumFeatureAccess: true,
			clerkPlanSlug: "free_org",
			subscriptionStatus: "canceled",
		},
	];
	const userStates = [
		undefined,
		null,
		{},
		{ hasPremiumFeatureAccess: true },
		{ hasPremiumFeatureAccess: false },
		{ hasPremiumFeatureAccess: null as unknown as boolean },
	];

	it("agrees on every org × user state", () => {
		for (const org of orgStates) {
			for (const user of userStates) {
				const legacy =
					orgHasPremiumPlan(org) || userHasPremiumOverride(user ?? null);
				const resolved = entitlementsFromDocs(org, user, NOW);
				expect(resolved.plan === "business", JSON.stringify({ org, user })).toBe(
					legacy
				);
			}
		}
	});
});

describe("map values encode the Slice A end-state packaging", () => {
	it("stock caps are deleted (unlimited on both tiers)", () => {
		expect(METERS.clients.free).toBeNull();
		expect(METERS.activeProjectsPerClient.free).toBeNull();
		expect(METERS.esignatures.free).toBe(5);
	});

	it("volume meters are enforced from day one", () => {
		expect(METERS.clientSends).toMatchObject({
			free: 20,
			period: "calendarMonth",
			enforce: true,
		});
		expect(METERS.assistantMessages).toMatchObject({
			free: 10,
			period: "day",
			enforce: true,
		});
		expect(METERS.savedReports).toMatchObject({
			free: 5,
			period: "lifetime",
			enforce: true,
		});
		expect(METERS.importedRows).toMatchObject({
			free: 2000,
			period: "lifetime",
			enforce: true,
		});
	});

	it("business is unlimited on every meter", () => {
		for (const row of Object.values(METERS)) {
			expect(row.business).toBeNull();
		}
	});

	it("the four scale switches are business-only; the rest are free for all", () => {
		const businessOnly: ReadonlySet<string> = new Set([
			"routing",
			"quickbooks",
			"automationPublish",
			"nlReportGeneration",
			"portalBadgeRemoval",
			"scheduledAutomationRuns",
			"automationEmails",
		]);
		for (const [key, row] of Object.entries(FEATURES)) {
			expect(row.free, key).toBe(!businessOnly.has(key));
			expect(row.business, key).toBe(true);
			expect(row.enforce, key).toBe(true);
		}
	});

	it("a disabled kill switch allows everyone", () => {
		expect(isFeatureAllowed("free", "routing")).toBe(false);
		const row = FEATURES.routing;
		const original = row.enforce;
		try {
			(row as { enforce: boolean }).enforce = false;
			expect(isFeatureAllowed("free", "routing")).toBe(true);
		} finally {
			(row as { enforce: boolean }).enforce = original;
		}
	});

	it("pins the frozen denial strings shipped mobile builds may display", () => {
		expect(FEATURES.aiAssistant.deny).toEqual({
			type: "error",
			message:
				"The AI assistant is available on the Business plan. Upgrade to use it.",
		});
		expect(FEATURES.routing.deny).toEqual({
			type: "error",
			message:
				"Route planning is available on the Business plan. Upgrade to use it.",
		});
		expect(FEATURES.quickbooks.deny).toEqual({
			type: "convexErrorString",
			message:
				"QuickBooks sync is available on the Business plan. Upgrade to use it.",
		});
	});
});

describe("meter periods (UTC)", () => {
	it("builds calendar-month, day, and lifetime keys", () => {
		expect(periodKeyFor("calendarMonth", NOW)).toBe("2026-08");
		expect(periodKeyFor("day", NOW)).toBe("2026-08-22");
		expect(periodKeyFor("lifetime", NOW)).toBe("lifetime");
	});

	it("rolls over at UTC boundaries", () => {
		const endOfMonth = Date.UTC(2026, 7, 31, 23, 59, 59);
		expect(periodKeyFor("calendarMonth", endOfMonth)).toBe("2026-08");
		expect(periodKeyFor("calendarMonth", endOfMonth + 1000)).toBe("2026-09");
	});

	it("reports the reset instant", () => {
		expect(periodResetAt("calendarMonth", NOW)).toBe(Date.UTC(2026, 8, 1));
		expect(periodResetAt("day", NOW)).toBe(Date.UTC(2026, 7, 23));
		expect(periodResetAt("lifetime", NOW)).toBeNull();
	});
});
