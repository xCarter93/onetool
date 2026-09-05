import { describe, it, expect, beforeEach } from "vitest";
import { ConvexError } from "convex/values";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestIdentity,
	createPremiumTestIdentity,
} from "./test.helpers";
import { PREMIUM_PLAN_SLUG } from "./lib/permissions";
import {
	PLAN_GRACE_MS,
	PLAN_LIMIT_ERROR_CODE,
	consumeMeter,
	getMeterUsage,
	grantMeterBonus,
	requireMeter,
} from "./lib/entitlements";

/**
 * Behavior-parity suite (PRD §5.2): before any packaging value changes, the
 * new entitlement layer must reach the same allow/deny decision as the legacy
 * premium helpers for every org/identity state. api.permissions.hasPremiumAccess
 * is the legacy read; api.entitlements.getMine is the new one.
 */
describe("entitlement parity across org/identity states", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seedOrg() {
		return await t.run(async (ctx) => createTestOrg(ctx));
	}

	async function patchOrg(
		orgId: Id<"organizations">,
		patch: Partial<Doc<"organizations">>
	) {
		await t.run(async (ctx) => {
			await ctx.db.patch(orgId, patch);
		});
	}

	async function assertParity(
		asUser: ReturnType<typeof t.withIdentity>,
		label: string
	) {
		const legacy = await asUser.query(api.permissions.hasPremiumAccess, {});
		const mine = await asUser.query(api.entitlements.getMine, {});
		expect(mine.plan === "business", label).toBe(legacy);
		return mine;
	}

	it("state 1: unauthenticated resolves free and never throws", async () => {
		const mine = await t.query(api.entitlements.getMine, {});
		expect(mine.plan).toBe("free");
		expect(mine.features.routing).toBe(false);
		expect(mine.meters).toEqual([]);
	});

	it("state 2: free org, no overrides", async () => {
		const { clerkUserId, clerkOrgId } = await seedOrg();
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const mine = await assertParity(asUser, "free org");
		expect(mine.plan).toBe("free");
		// Slice A: assistant access is free for all (volume rides the meter);
		// the scale switches stay business-only.
		expect(mine.features.aiAssistant).toBe(true);
		expect(mine.features.routing).toBe(false);
	});

	it("state 3: paid slug + active subscription", async () => {
		const { orgId, clerkUserId, clerkOrgId } = await seedOrg();
		await patchOrg(orgId, {
			clerkPlanSlug: PREMIUM_PLAN_SLUG,
			subscriptionStatus: "active",
		});
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const mine = await assertParity(asUser, "active subscription");
		expect(mine).toMatchObject({ plan: "business", source: "subscription" });
		expect(mine.features.routing).toBe(true);
	});

	it("state 4: paid slug + trialing subscription", async () => {
		const { orgId, clerkUserId, clerkOrgId } = await seedOrg();
		await patchOrg(orgId, {
			clerkPlanSlug: PREMIUM_PLAN_SLUG,
			subscriptionStatus: "trialing",
		});
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const mine = await assertParity(asUser, "trialing subscription");
		expect(mine.plan).toBe("business");
	});

	it("state 5: paid slug with canceled / past_due status is free", async () => {
		for (const subscriptionStatus of ["canceled", "past_due"] as const) {
			const { orgId, clerkUserId, clerkOrgId } = await seedOrg();
			await patchOrg(orgId, {
				clerkPlanSlug: PREMIUM_PLAN_SLUG,
				subscriptionStatus,
			});
			const asUser = t.withIdentity(
				createTestIdentity(clerkUserId, clerkOrgId)
			);
			const mine = await assertParity(asUser, subscriptionStatus);
			expect(mine.plan).toBe("free");
		}
	});

	it("state 6: org-doc override grants the whole org", async () => {
		const { orgId, clerkUserId, clerkOrgId } = await seedOrg();
		await patchOrg(orgId, { hasPremiumFeatureAccess: true });
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const mine = await assertParity(asUser, "org doc override");
		expect(mine.plan).toBe("business");
	});

	it("state 7: JWT user-level override (fast path, no org doc change)", async () => {
		const { clerkUserId, clerkOrgId } = await seedOrg();
		const asUser = t.withIdentity(
			createPremiumTestIdentity(clerkUserId, clerkOrgId)
		);
		const mine = await assertParity(asUser, "JWT user override");
		expect(mine).toMatchObject({ plan: "business", source: "actorOverride" });
	});

	it("state 8: JWT org-level override", async () => {
		const { clerkUserId, clerkOrgId } = await seedOrg();
		const asUser = t.withIdentity({
			...createTestIdentity(clerkUserId, clerkOrgId),
			orgPublicMetadata: { has_premium_feature_access: true },
		});
		const mine = await assertParity(asUser, "JWT org override");
		expect(mine).toMatchObject({ plan: "business", source: "orgOverride" });
	});

	it("override revoke: null metadata reads free (both layers)", async () => {
		const { clerkUserId, clerkOrgId } = await seedOrg();
		const asUser = t.withIdentity({
			...createTestIdentity(clerkUserId, clerkOrgId),
			publicMetadata: { has_premium_feature_access: null },
			orgPublicMetadata: { has_premium_feature_access: null },
		});
		const mine = await assertParity(asUser, "revoked override");
		expect(mine.plan).toBe("free");
	});

	// Documented, intentional divergences from the legacy helper — the new
	// fields nothing writes yet. These become live behavior at P5 (trial) and
	// on the first canceled webhook (grace); the legacy helper never sees them.
	it("trial and grace windows resolve business in the new layer only", async () => {
		const { orgId, clerkUserId, clerkOrgId } = await seedOrg();
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		const trialEnd = Date.now() + 60_000;
		await patchOrg(orgId, { trialEndsAt: trialEnd });
		let mine = await asUser.query(api.entitlements.getMine, {});
		expect(mine).toMatchObject({
			plan: "business",
			source: "trial",
			// Surfaced only during the trial — the header countdown reads it.
			trialEndsAt: trialEnd,
		});

		await patchOrg(orgId, {
			trialEndsAt: undefined,
			planGraceUntil: Date.now() + PLAN_GRACE_MS,
		});
		mine = await asUser.query(api.entitlements.getMine, {});
		expect(mine).toMatchObject({ plan: "business", source: "grace" });
		expect(mine.trialEndsAt).toBeUndefined();

		await patchOrg(orgId, { planGraceUntil: Date.now() - 1000 });
		mine = await asUser.query(api.entitlements.getMine, {});
		expect(mine.plan).toBe("free");
	});

	it("getMine reports the e-signature meter first, with the free limit", async () => {
		const { clerkUserId, clerkOrgId } = await seedOrg();
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const mine = await asUser.query(api.entitlements.getMine, {});
		expect(mine.meters[0]?.key).toBe("esignatures");
		const esig = mine.meters.find((m) => m.key === "esignatures");
		expect(esig).toMatchObject({ used: 0, limit: 5, remaining: 5 });
		// Mobile-pinned shape: keys are frozen for shipped binaries.
		expect(Object.keys(mine).sort()).toEqual(["features", "meters", "plan", "source"]);
		for (const meter of mine.meters) {
			expect(Object.keys(meter).sort()).toEqual([
				"key",
				"limit",
				"remaining",
				"resetsAt",
				"used",
			]);
		}
	});

	it("getMine reads e-signature usage from the planUsage meter", async () => {
		const { orgId, clerkUserId, clerkOrgId } = await seedOrg();
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		await t.run(async (ctx) => {
			for (let i = 0; i < 3; i++) {
				await consumeMeter(ctx, orgId, "esignatures");
			}
		});
		const mine = await asUser.query(api.entitlements.getMine, {});
		const esig = mine.meters.find((m) => m.key === "esignatures");
		expect(esig).toMatchObject({ used: 3, limit: 5, remaining: 2 });
	});

	it("getMine no longer reports the deleted stock caps", async () => {
		const { clerkUserId, clerkOrgId } = await seedOrg();
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		for (const companyName of ["Acme Lawn", "Bramble & Co"]) {
			await asUser.mutation(api.clients.create, {
				portalAccessId: crypto.randomUUID(),
				companyName,
				status: "active",
			});
		}
		const mine = await asUser.query(api.entitlements.getMine, {});
		// Unlimited meters are omitted — only actionable (finite) meters ship.
		expect(mine.meters.find((m) => m.key === "clients")).toBeUndefined();
		const keys = mine.meters.map((m) => m.key).sort();
		expect(keys).toEqual([
			"assistantMessages",
			"clientSends",
			"esignatures",
			"importedRows",
			"savedReports",
		]);
	});
});

describe("meter store behavior", () => {
	let t: ReturnType<typeof setupConvexTest>;
	const NOW = Date.UTC(2026, 7, 22, 12, 0, 0);

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seedOrgId(): Promise<Id<"organizations">> {
		const { orgId } = await t.run(async (ctx) => createTestOrg(ctx));
		return orgId;
	}

	it("debits accumulate and refuse at the limit with the frozen shape", async () => {
		const orgId = await seedOrgId();
		await t.run(async (ctx) => {
			for (let i = 0; i < 5; i++) {
				await requireMeter(ctx, orgId, "esignatures", "free", { now: NOW });
				await consumeMeter(ctx, orgId, "esignatures", { now: NOW });
			}
			const usage = await getMeterUsage(ctx, orgId, "esignatures", "free", { now: NOW });
			expect(usage).toMatchObject({ used: 5, limit: 5, remaining: 0 });
			try {
				await requireMeter(ctx, orgId, "esignatures", "free", { now: NOW });
				expect.unreachable("requireMeter should refuse at the limit");
			} catch (error) {
				expect(error).toBeInstanceOf(ConvexError);
				const data = (
					error as ConvexError<{
						code: string;
						feature: string;
						message: string;
					}>
				).data;
				expect(data.code).toBe(PLAN_LIMIT_ERROR_CODE);
				expect(data.feature).toBe("esignatures");
				expect(typeof data.message).toBe("string");
			}
		});
	});

	it("business is unlimited", async () => {
		const orgId = await seedOrgId();
		await t.run(async (ctx) => {
			for (let i = 0; i < 25; i++) {
				await consumeMeter(ctx, orgId, "esignatures", { now: NOW });
			}
			await requireMeter(ctx, orgId, "esignatures", "business", { now: NOW });
			const usage = await getMeterUsage(ctx, orgId, "esignatures", "business", {
				now: NOW,
			});
			expect(usage).toMatchObject({ used: 25, limit: null, remaining: null });
		});
	});

	it("month rollover starts a fresh row", async () => {
		const orgId = await seedOrgId();
		const NEXT_MONTH = Date.UTC(2026, 8, 1, 0, 0, 1);
		await t.run(async (ctx) => {
			for (let i = 0; i < 5; i++) {
				await consumeMeter(ctx, orgId, "esignatures", { now: NOW });
			}
			await requireMeter(ctx, orgId, "esignatures", "free", {
				now: NEXT_MONTH,
			});
			const usage = await getMeterUsage(ctx, orgId, "esignatures", "free", {
				now: NEXT_MONTH,
			});
			expect(usage).toMatchObject({ used: 0, remaining: 5 });
		});
	});

	it("a bonus extends the current period only", async () => {
		const orgId = await seedOrgId();
		await t.run(async (ctx) => {
			for (let i = 0; i < 5; i++) {
				await consumeMeter(ctx, orgId, "esignatures", { now: NOW });
			}
			await grantMeterBonus(ctx, orgId, "esignatures", 10, { now: NOW });
			await requireMeter(ctx, orgId, "esignatures", "free", { now: NOW });
			const usage = await getMeterUsage(ctx, orgId, "esignatures", "free", { now: NOW });
			expect(usage).toMatchObject({ used: 5, limit: 15, remaining: 10 });
			// Next month: base limit again.
			const next = await getMeterUsage(ctx, orgId, "esignatures", "free", {
				now: Date.UTC(2026, 8, 2),
			});
			expect(next.limit).toBe(5);
		});
	});

	it("the send meter is enforced from day one", async () => {
		const orgId = await seedOrgId();
		await t.run(async (ctx) => {
			for (let i = 0; i < 20; i++) {
				await requireMeter(ctx, orgId, "clientSends", "free", { now: NOW });
				await consumeMeter(ctx, orgId, "clientSends", { now: NOW });
			}
			await expect(
				requireMeter(ctx, orgId, "clientSends", "free", { now: NOW })
			).rejects.toThrow();
		});
	});

	it("a once-guarded bonus grants a single +10 per period", async () => {
		const orgId = await seedOrgId();
		await t.run(async (ctx) => {
			await grantMeterBonus(ctx, orgId, "clientSends", 10, { now: NOW, once: true });
			await grantMeterBonus(ctx, orgId, "clientSends", 10, { now: NOW, once: true });
			const usage = await getMeterUsage(ctx, orgId, "clientSends", "free", { now: NOW });
			expect(usage.limit).toBe(30);
			// A new month starts back at the base limit; the bonus can grant again.
			// Pin the base BEFORE re-granting — 30 alone can't tell a re-armed
			// grant apart from a bonus that wrongly carried over.
			const NEXT = Date.UTC(2026, 8, 2);
			const rolled = await getMeterUsage(ctx, orgId, "clientSends", "free", { now: NEXT });
			expect(rolled.limit).toBe(20);
			await grantMeterBonus(ctx, orgId, "clientSends", 10, { now: NEXT, once: true });
			const next = await getMeterUsage(ctx, orgId, "clientSends", "free", { now: NEXT });
			expect(next.limit).toBe(30);
		});
	});

	it("consumeMeter debits N at once for batch meters", async () => {
		const orgId = await seedOrgId();
		await t.run(async (ctx) => {
			await consumeMeter(ctx, orgId, "importedRows", { now: NOW, amount: 1995 });
			const usage = await getMeterUsage(ctx, orgId, "importedRows", "free", { now: NOW });
			expect(usage).toMatchObject({ used: 1995, limit: 2000, remaining: 5 });
		});
	});
});
