import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ConvexError } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestClientContact,
	createTestIdentity,
} from "./test.helpers";
import { consumeMeter } from "./lib/entitlements";

// Slice A behavior suite (PRD §5): asserts external behavior per
// (org-state, action) for the new meters and the reverse-trial signup hook.

/** Clerk backend stub: records seat-cap writes so the sync action is
 * observable without the network. */
const seatWrites: Array<{ organizationId: string; maxAllowedMemberships: number }> =
	[];
vi.mock("@clerk/backend", () => ({
	createClerkClient: () => ({
		organizations: {
			updateOrganization: async (
				organizationId: string,
				params: { maxAllowedMemberships: number }
			) => {
				seatWrites.push({ organizationId, ...params });
				return {};
			},
		},
	}),
}));

/** Serialized denial payload (house pattern from planCaps.test): convex-test
 * surfaces ConvexError data either on .data or inside the message string. */
function denialPayload(error: unknown): string {
	expect(error).toBeDefined();
	const payload =
		error instanceof ConvexError && error.data !== undefined
			? error.data
			: String(error);
	return JSON.stringify(payload) ?? String(payload);
}

describe("Slice A: send meter (clientSends)", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		vi.stubEnv("RESEND_API_KEY", "test-key");
		vi.stubEnv("PORTAL_JWT_ISSUER", "https://portal.example.com");
		// Freeze timers so fire-and-forget scheduled functions (emails, PDF
		// renders) can't run outside the test transaction.
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	async function seedSendable() {
		const { orgId, clientId, clerkUserId, clerkOrgId } = await t.run(
			async (ctx) => {
				const seeded = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, seeded.orgId);
				await ctx.db.patch(clientId, { portalAccessId: "portal-abc-123" });
				await createTestClientContact(ctx, seeded.orgId, clientId, {
					isPrimary: true,
					email: "client@example.com",
				});
				return { ...seeded, clientId };
			}
		);
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		return { asUser, orgId, clientId };
	}

	async function sendUsage(orgId: Id<"organizations">) {
		return await t.run(async (ctx) => {
			const rows = await ctx.db
				.query("planUsage")
				.withIndex("by_org_meter_period", (q) =>
					q.eq("orgId", orgId).eq("meter", "clientSends")
				)
				.collect();
			return rows[0] ?? null;
		});
	}

	it("quote: first send debits once; resend and revived re-sends never debit", async () => {
		const { asUser, orgId, clientId } = await seedSendable();
		const quoteId = await asUser.mutation(api.quotes.create, {
			clientId,
			title: "Q",
			status: "draft",
			subtotal: 100,
			total: 100,
		});

		await asUser.mutation(api.quotes.sendToClient, { id: quoteId });
		expect((await sendUsage(orgId))?.used).toBe(1);

		// Re-send of an already-sent quote: no transition, no debit.
		await asUser.mutation(api.quotes.sendToClient, { id: quoteId });
		expect((await sendUsage(orgId))?.used).toBe(1);

		// Declined → sent re-entry is a resend of a document the client already
		// received (sentAt set): still no debit.
		await asUser.mutation(api.quotes.update, {
			id: quoteId,
			status: "declined",
		});
		await asUser.mutation(api.quotes.sendToClient, { id: quoteId });
		expect((await sendUsage(orgId))?.used).toBe(1);
	});

	it("invoice: draft→sent debits once; re-send is free", async () => {
		const { asUser, orgId, clientId } = await seedSendable();
		const invoiceId = await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: "INV-1",
			status: "draft",
			subtotal: 100,
			total: 100,
			issuedDate: Date.now(),
			dueDate: Date.now() + 86_400_000,
		});

		await asUser.mutation(api.invoices.sendToClient, { id: invoiceId });
		expect((await sendUsage(orgId))?.used).toBe(1);
		await asUser.mutation(api.invoices.sendToClient, { id: invoiceId });
		expect((await sendUsage(orgId))?.used).toBe(1);
	});

	it("refuses at the limit with the frozen PLAN_LIMIT_REACHED shape", async () => {
		const { asUser, orgId, clientId } = await seedSendable();
		await t.run(async (ctx) => {
			await consumeMeter(ctx, orgId, "clientSends", { amount: 20 });
		});
		const quoteId = await asUser.mutation(api.quotes.create, {
			clientId,
			title: "Q",
			status: "draft",
			subtotal: 100,
			total: 100,
		});

		let caught: unknown;
		try {
			await asUser.mutation(api.quotes.sendToClient, { id: quoteId });
		} catch (error) {
			caught = error;
		}
		const payload = denialPayload(caught);
		expect(payload).toContain("PLAN_LIMIT_REACHED");
		expect(payload).toContain("clientSends");
		// Refusal happened before the transition — the quote stays draft.
		const quote = await t.run(async (ctx) => ctx.db.get(quoteId));
		expect(quote?.status).toBe("draft");
		expect(quote?.sentAt).toBeUndefined();
	});

	it("business orgs send past the free limit", async () => {
		const { asUser, orgId, clientId } = await seedSendable();
		await t.run(async (ctx) => {
			await ctx.db.patch(orgId, { hasPremiumFeatureAccess: true });
			await consumeMeter(ctx, orgId, "clientSends", { amount: 50 });
		});
		const quoteId = await asUser.mutation(api.quotes.create, {
			clientId,
			title: "Q",
			status: "draft",
			subtotal: 100,
			total: 100,
		});
		await expect(
			asUser.mutation(api.quotes.sendToClient, { id: quoteId })
		).resolves.toBeDefined();
	});
});

describe("Slice A: saved-report slots (savedReports)", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const REPORT_ARGS = {
		description: undefined,
		config: { entityType: "clients" as const },
		visualization: { type: "table" as const },
	};

	async function seed() {
		const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) =>
			createTestOrg(ctx)
		);
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		return { asUser, orgId };
	}

	it("the 6th create refuses on free; deleting frees the slot", async () => {
		const { asUser } = await seed();
		const ids: Id<"reports">[] = [];
		for (let i = 0; i < 5; i++) {
			ids.push(
				await asUser.mutation(api.reports.create, {
					...REPORT_ARGS,
					name: `Report ${i}`,
				})
			);
		}

		let caught: unknown;
		try {
			await asUser.mutation(api.reports.create, {
				...REPORT_ARGS,
				name: "One too many",
			});
		} catch (error) {
			caught = error;
		}
		const payload = denialPayload(caught);
		expect(payload).toContain("PLAN_LIMIT_REACHED");
		expect(payload).toContain("savedReports");

		await asUser.mutation(api.reports.remove, { id: ids[0] });
		await expect(
			asUser.mutation(api.reports.create, { ...REPORT_ARGS, name: "Fits now" })
		).resolves.toBeDefined();
	});

	it("duplicate counts against the cap too", async () => {
		const { asUser } = await seed();
		let lastId: Id<"reports"> | null = null;
		for (let i = 0; i < 5; i++) {
			lastId = await asUser.mutation(api.reports.create, {
				...REPORT_ARGS,
				name: `Report ${i}`,
			});
		}
		await expect(
			asUser.mutation(api.reports.duplicate, { id: lastId! })
		).rejects.toThrow();
	});

	it("a grandfathered org keeps its reports and can edit, but can't create", async () => {
		const { asUser, orgId } = await seed();
		// Build 7 while business, then downgrade — the over-cap state prod
		// grandfathering produces.
		await t.run(async (ctx) => {
			await ctx.db.patch(orgId, { hasPremiumFeatureAccess: true });
		});
		const ids: Id<"reports">[] = [];
		for (let i = 0; i < 7; i++) {
			ids.push(
				await asUser.mutation(api.reports.create, {
					...REPORT_ARGS,
					name: `Report ${i}`,
				})
			);
		}
		await t.run(async (ctx) => {
			await ctx.db.patch(orgId, { hasPremiumFeatureAccess: false });
		});

		// Existing rows untouched, edits stay free at any count.
		await expect(
			asUser.mutation(api.reports.update, { id: ids[6], name: "Renamed" })
		).resolves.toBeDefined();
		const list = await asUser.query(api.reports.list, {});
		expect(list).toHaveLength(7);

		await expect(
			asUser.mutation(api.reports.create, { ...REPORT_ARGS, name: "Nope" })
		).rejects.toThrow();
	});

	it("business creates without a slot limit", async () => {
		const { asUser, orgId } = await seed();
		await t.run(async (ctx) => {
			await ctx.db.patch(orgId, { hasPremiumFeatureAccess: true });
		});
		for (let i = 0; i < 8; i++) {
			await asUser.mutation(api.reports.create, {
				...REPORT_ARGS,
				name: `Report ${i}`,
			});
		}
		const list = await asUser.query(api.reports.list, {});
		expect(list).toHaveLength(8);
	});
});

describe("Slice A: import budget (importedRows + ops caps)", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	async function seed() {
		const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) =>
			createTestOrg(ctx)
		);
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		return { asUser, orgId };
	}

	function rows(n: number, prefix = "Imported") {
		return Array.from({ length: n }, (_, i) => ({
			companyName: `${prefix} ${i}`,
			status: "lead" as const,
		}));
	}

	async function importedUsage(orgId: Id<"organizations">) {
		return await t.run(async (ctx) => {
			const row = await ctx.db
				.query("planUsage")
				.withIndex("by_org_meter_period", (q) =>
					q
						.eq("orgId", orgId)
						.eq("meter", "importedRows")
						.eq("periodKey", "lifetime")
				)
				.unique();
			return row?.used ?? 0;
		});
	}

	it("refuses a single call over the per-call ops cap (all plans)", async () => {
		const { asUser, orgId } = await seed();
		await t.run(async (ctx) => {
			await ctx.db.patch(orgId, { hasPremiumFeatureAccess: true });
		});
		let caught: unknown;
		try {
			await asUser.mutation(api.clients.bulkCreate, { clients: rows(501) });
		} catch (error) {
			caught = error;
		}
		expect(denialPayload(caught)).toContain("IMPORT_LIMIT");
	});

	it("only rows actually written debit the lifetime budget", async () => {
		const { asUser, orgId } = await seed();
		const payload = [...rows(2), { companyName: "   ", status: "lead" as const }];
		const results = await asUser.mutation(api.clients.bulkCreate, {
			clients: payload,
		});
		expect(results.filter((r) => r.success)).toHaveLength(2);
		expect(await importedUsage(orgId)).toBe(2);
	});

	it("refuses when the call would exceed the free lifetime budget", async () => {
		const { asUser, orgId } = await seed();
		await t.run(async (ctx) => {
			await consumeMeter(ctx, orgId, "importedRows", { amount: 1995 });
		});
		let caught: unknown;
		try {
			await asUser.mutation(api.clients.bulkCreate, { clients: rows(10) });
		} catch (error) {
			caught = error;
		}
		const payload = denialPayload(caught);
		expect(payload).toContain("PLAN_LIMIT_REACHED");
		expect(payload).toContain("importedRows");

		// A call that fits the remaining 5 still lands.
		const results = await asUser.mutation(api.clients.bulkCreate, {
			clients: rows(5, "Fits"),
		});
		expect(results.filter((r) => r.success)).toHaveLength(5);
		expect(await importedUsage(orgId)).toBe(2000);
	});

	it("business has no lifetime bound", async () => {
		const { asUser, orgId } = await seed();
		await t.run(async (ctx) => {
			await ctx.db.patch(orgId, { hasPremiumFeatureAccess: true });
			await consumeMeter(ctx, orgId, "importedRows", { amount: 5000 });
		});
		const results = await asUser.mutation(api.clients.bulkCreate, {
			clients: rows(3),
		});
		expect(results.filter((r) => r.success)).toHaveLength(3);
	});
});

describe("Slice A: reverse trial + seat sync", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		seatWrites.length = 0;
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	it("createFromClerk stamps the 14-day trial and schedules both seat syncs", async () => {
		await t.run(async (ctx) => {
			await ctx.db.insert("users", {
				name: "Owner",
				email: "owner@example.com",
				image: "https://example.com/i.jpg",
				externalId: "user_trial_1",
			});
		});
		const before = Date.now();
		const orgId = await t.mutation(internal.organizations.createFromClerk, {
			clerkOrganizationId: "org_trial_1",
			name: "Trial Org",
			ownerClerkUserId: "user_trial_1",
		});

		const org = await t.run(async (ctx) => ctx.db.get(orgId!));
		const fourteenDays = 14 * 24 * 60 * 60 * 1000;
		expect(org?.trialEndsAt).toBeGreaterThanOrEqual(before + fourteenDays);
		expect(org?.trialEndsAt).toBeLessThanOrEqual(Date.now() + fourteenDays);

		const scheduled = await t.run(async (ctx) => {
			const rows = await ctx.db.system.query("_scheduled_functions").collect();
			return rows.filter((row) => row.name.includes("syncSeatCap"));
		});
		expect(scheduled).toHaveLength(2);
	});

	it("getSeatSyncInfo resolves seats from the plan (trial=20, free=5, business=20)", async () => {
		const { orgId } = await t.run(async (ctx) => createTestOrg(ctx));

		const free = await t.query(internal.seatSync.getSeatSyncInfo, { orgId });
		expect(free?.seats).toBe(5);

		await t.run(async (ctx) => {
			await ctx.db.patch(orgId, { trialEndsAt: Date.now() + 60_000 });
		});
		const trialing = await t.query(internal.seatSync.getSeatSyncInfo, { orgId });
		expect(trialing?.seats).toBe(20);

		await t.run(async (ctx) => {
			await ctx.db.patch(orgId, {
				trialEndsAt: Date.now() - 60_000,
				clerkPlanSlug: "onetool_business_plan_org",
				subscriptionStatus: "active",
			});
		});
		const business = await t.query(internal.seatSync.getSeatSyncInfo, { orgId });
		expect(business?.seats).toBe(20);
	});

	it("syncSeatCap writes the resolved cap to Clerk", async () => {
		vi.stubEnv("CLERK_SECRET_KEY", "sk_test_stub");
		const { orgId, clerkOrgId } = await t.run(async (ctx) => createTestOrg(ctx));
		await t.action(internal.seatSync.syncSeatCap, { orgId });
		expect(seatWrites).toEqual([
			{ organizationId: clerkOrgId, maxAllowedMemberships: 5 },
		]);
	});
});

describe("Slice A: NL report generation gate (nlReportGeneration)", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	// The pipeline entry (runReportGeneration) branches on the plan that
	// authContext resolves; the full generate path needs a live model, so the
	// contract pinned here is the gate's input: the resolved plan crosses the
	// internalQuery boundary correctly for free, trial, and business orgs.
	it("authContext resolves the plan the pipeline gate branches on", async () => {
		const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) =>
			createTestOrg(ctx)
		);
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		const free = await asUser.query(internal.reportConfigGeneration.authContext, {});
		expect(free?.plan).toBe("free");

		await t.run(async (ctx) => {
			await ctx.db.patch(orgId, { trialEndsAt: Date.now() + 60_000 });
		});
		const trialing = await asUser.query(
			internal.reportConfigGeneration.authContext,
			{}
		);
		expect(trialing?.plan).toBe("business");
	});
});
