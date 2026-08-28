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
	createTestProject,
} from "./test.helpers";
import {
	METERS,
	consumeMeter,
	periodKeyFor,
	type MeterKey,
} from "./lib/entitlements";

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

type TestInstance = ReturnType<typeof setupConvexTest>;
type TestActor = ReturnType<TestInstance["withIdentity"]>;

/** Org whose client is portal-reachable, so quotes/invoices can really send.
 * Clerk ids are explicit-able: the default ones key off Date.now(), which
 * collides for a second org under frozen timers. */
async function seedSendable(
	t: TestInstance,
	overrides: { clerkUserId?: string; clerkOrgId?: string } = {}
) {
	const { orgId, clientId, clerkUserId, clerkOrgId } = await t.run(
		async (ctx) => {
			const seeded = await createTestOrg(ctx, overrides);
			const clientId = await createTestClient(ctx, seeded.orgId);
			await ctx.db.patch(clientId, {
				portalAccessId: `portal-${seeded.clerkOrgId}`,
			});
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

/** planUsage row for the meter's CURRENT period — rows outlive their period,
 * so a period-blind read mixes months. */
async function usageRow(
	t: TestInstance,
	orgId: Id<"organizations">,
	meter: MeterKey,
	now: number = Date.now()
) {
	const periodKey = periodKeyFor(METERS[meter].period, now);
	return await t.run(async (ctx) =>
		ctx.db
			.query("planUsage")
			.withIndex("by_org_meter_period", (q) =>
				q.eq("orgId", orgId).eq("meter", meter).eq("periodKey", periodKey)
			)
			.unique()
	);
}

async function sendUsage(t: TestInstance, orgId: Id<"organizations">) {
	return await usageRow(t, orgId, "clientSends");
}

/** One meter as the product reads it: entitlements.getMine is the single
 * public entitlement query for web and mobile. */
async function myMeter(asUser: TestActor, key: MeterKey) {
	const mine = await asUser.query(api.entitlements.getMine, {});
	return mine.meters.find((meter) => meter.key === key);
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

	it("quote: first send debits once; resend and revived re-sends never debit", async () => {
		const { asUser, orgId, clientId } = await seedSendable(t);
		const quoteId = await asUser.mutation(api.quotes.create, {
			clientId,
			title: "Q",
			status: "draft",
			subtotal: 100,
			total: 100,
		});

		await asUser.mutation(api.quotes.sendToClient, { id: quoteId });
		expect((await sendUsage(t, orgId))?.used).toBe(1);

		// Re-send of an already-sent quote: no transition, no debit.
		await asUser.mutation(api.quotes.sendToClient, { id: quoteId });
		expect((await sendUsage(t, orgId))?.used).toBe(1);

		// Declined → sent re-entry is a resend of a document the client already
		// received (sentAt set): still no debit.
		await asUser.mutation(api.quotes.update, {
			id: quoteId,
			status: "declined",
		});
		await asUser.mutation(api.quotes.sendToClient, { id: quoteId });
		expect((await sendUsage(t, orgId))?.used).toBe(1);
	});

	it("invoice: draft→sent debits once; re-send is free", async () => {
		const { asUser, orgId, clientId } = await seedSendable(t);
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
		expect((await sendUsage(t, orgId))?.used).toBe(1);
		await asUser.mutation(api.invoices.sendToClient, { id: invoiceId });
		expect((await sendUsage(t, orgId))?.used).toBe(1);
	});

	it("refuses at the limit with the frozen PLAN_LIMIT_REACHED shape", async () => {
		const { asUser, orgId, clientId } = await seedSendable(t);
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
		const { asUser, orgId, clientId } = await seedSendable(t);
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

	it("quotes.update draft→sent debits once and refuses at zero remaining", async () => {
		const { asUser, orgId, clientId } = await seedSendable(t);
		const first = await asUser.mutation(api.quotes.create, {
			clientId,
			title: "Q1",
			status: "draft",
			subtotal: 100,
			total: 100,
		});

		await asUser.mutation(api.quotes.update, { id: first, status: "sent" });
		expect((await sendUsage(t, orgId))?.used).toBe(1);
		const sent = await t.run(async (ctx) => ctx.db.get(first));
		expect(sent?.firstSentAt).toBeDefined();

		// Burn the rest of the month, then the next flip refuses.
		await t.run(async (ctx) => {
			await consumeMeter(ctx, orgId, "clientSends", { amount: 19 });
		});
		const second = await asUser.mutation(api.quotes.create, {
			clientId,
			title: "Q2",
			status: "draft",
			subtotal: 100,
			total: 100,
		});
		let caught: unknown;
		try {
			await asUser.mutation(api.quotes.update, { id: second, status: "sent" });
		} catch (error) {
			caught = error;
		}
		const payload = denialPayload(caught);
		expect(payload).toContain("PLAN_LIMIT_REACHED");
		expect(payload).toContain("clientSends");
		const blocked = await t.run(async (ctx) => ctx.db.get(second));
		expect(blocked?.status).toBe("draft");
		expect(blocked?.sentAt).toBeUndefined();
		expect(blocked?.firstSentAt).toBeUndefined();
		expect((await sendUsage(t, orgId))?.used).toBe(20);
	});

	it("sendToClient after a quotes.update flip never debits twice", async () => {
		const { asUser, orgId, clientId } = await seedSendable(t);
		const quoteId = await asUser.mutation(api.quotes.create, {
			clientId,
			title: "Q",
			status: "draft",
			subtotal: 100,
			total: 100,
		});

		await asUser.mutation(api.quotes.update, { id: quoteId, status: "sent" });
		expect((await sendUsage(t, orgId))?.used).toBe(1);

		await asUser.mutation(api.quotes.sendToClient, { id: quoteId });
		expect((await sendUsage(t, orgId))?.used).toBe(1);
	});

	it("quote: revert-to-draft then re-send stays at one debit", async () => {
		const { asUser, orgId, clientId } = await seedSendable(t);
		const quoteId = await asUser.mutation(api.quotes.create, {
			clientId,
			title: "Q",
			status: "draft",
			subtotal: 100,
			total: 100,
		});

		await asUser.mutation(api.quotes.sendToClient, { id: quoteId });
		expect((await sendUsage(t, orgId))?.used).toBe(1);

		await asUser.mutation(api.quotes.update, { id: quoteId, status: "draft" });
		const reverted = await t.run(async (ctx) => ctx.db.get(quoteId));
		// sentAt clears on the revert; firstSentAt — the debit key — does not.
		expect(reverted?.sentAt).toBeUndefined();
		expect(reverted?.firstSentAt).toBeDefined();

		await asUser.mutation(api.quotes.sendToClient, { id: quoteId });
		expect((await sendUsage(t, orgId))?.used).toBe(1);
	});

	it("invoices.update draft→sent debits once, survives a revert, and refuses at zero", async () => {
		const { asUser, orgId, clientId } = await seedSendable(t);
		const invoiceId = await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: "INV-A",
			status: "draft",
			subtotal: 100,
			total: 100,
			issuedDate: Date.now(),
			dueDate: Date.now() + 86_400_000,
		});

		await asUser.mutation(api.invoices.update, { id: invoiceId, status: "sent" });
		expect((await sendUsage(t, orgId))?.used).toBe(1);

		await asUser.mutation(api.invoices.update, { id: invoiceId, status: "draft" });
		await asUser.mutation(api.invoices.update, { id: invoiceId, status: "sent" });
		expect((await sendUsage(t, orgId))?.used).toBe(1);

		await t.run(async (ctx) => {
			await consumeMeter(ctx, orgId, "clientSends", { amount: 19 });
		});
		const blockedId = await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: "INV-B",
			status: "draft",
			subtotal: 100,
			total: 100,
			issuedDate: Date.now(),
			dueDate: Date.now() + 86_400_000,
		});
		let caught: unknown;
		try {
			await asUser.mutation(api.invoices.update, {
				id: blockedId,
				status: "sent",
			});
		} catch (error) {
			caught = error;
		}
		const payload = denialPayload(caught);
		expect(payload).toContain("PLAN_LIMIT_REACHED");
		expect(payload).toContain("clientSends");
		const blocked = await t.run(async (ctx) => ctx.db.get(blockedId));
		expect(blocked?.status).toBe("draft");
		expect(blocked?.firstSentAt).toBeUndefined();
	});

	it("minting a record as 'sent' debits; minting a draft debits nothing", async () => {
		const { asUser, orgId, clientId } = await seedSendable(t);

		const quoteId = await asUser.mutation(api.quotes.create, {
			clientId,
			title: "Born sent",
			status: "sent",
			subtotal: 100,
			total: 100,
		});
		expect((await sendUsage(t, orgId))?.used).toBe(1);
		expect(
			(await t.run(async (ctx) => ctx.db.get(quoteId)))?.firstSentAt
		).toBeDefined();

		const invoiceId = await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: "INV-SENT",
			status: "sent",
			subtotal: 100,
			total: 100,
			issuedDate: Date.now(),
			dueDate: Date.now() + 86_400_000,
		});
		expect((await sendUsage(t, orgId))?.used).toBe(2);
		expect(
			(await t.run(async (ctx) => ctx.db.get(invoiceId)))?.firstSentAt
		).toBeDefined();

		await asUser.mutation(api.quotes.create, {
			clientId,
			title: "Still a draft",
			status: "draft",
			subtotal: 100,
			total: 100,
		});
		await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: "INV-DRAFT",
			status: "draft",
			subtotal: 100,
			total: 100,
			issuedDate: Date.now(),
			dueDate: Date.now() + 86_400_000,
		});
		expect((await sendUsage(t, orgId))?.used).toBe(2);
	});

	it("a resend in a later month is free — the new period opens at zero", async () => {
		vi.setSystemTime(Date.UTC(2026, 2, 10, 12));
		const { asUser, orgId, clientId } = await seedSendable(t);
		const quoteId = await asUser.mutation(api.quotes.create, {
			clientId,
			title: "Q",
			status: "draft",
			subtotal: 100,
			total: 100,
		});
		await asUser.mutation(api.quotes.sendToClient, { id: quoteId });
		expect((await sendUsage(t, orgId))?.used).toBe(1);

		vi.setSystemTime(Date.UTC(2026, 3, 10, 12));
		await asUser.mutation(api.quotes.sendToClient, { id: quoteId });
		expect(await sendUsage(t, orgId)).toBeNull();
		expect(await myMeter(asUser, "clientSends")).toMatchObject({
			used: 0,
			limit: 20,
			remaining: 20,
		});
	});

	it("a failure after the debit rolls the debit back", async () => {
		const { asUser, orgId, clientId } = await seedSendable(t, {
			clerkUserId: "user_sender",
			clerkOrgId: "org_sender",
		});
		// quotes.update debits the send and only then validates the parent, so a
		// foreign project fails the mutation downstream of consumeMeter.
		const foreignProjectId = await t.run(async (ctx) => {
			const other = await createTestOrg(ctx, {
				clerkUserId: "user_other",
				clerkOrgId: "org_other",
			});
			const otherClientId = await createTestClient(ctx, other.orgId);
			return await createTestProject(ctx, other.orgId, otherClientId);
		});
		const quoteId = await asUser.mutation(api.quotes.create, {
			clientId,
			title: "Q",
			status: "draft",
			subtotal: 100,
			total: 100,
		});

		await expect(
			asUser.mutation(api.quotes.update, {
				id: quoteId,
				status: "sent",
				projectId: foreignProjectId,
			})
		).rejects.toThrow();

		expect(await sendUsage(t, orgId)).toBeNull();
		expect(
			(await t.run(async (ctx) => ctx.db.get(quoteId)))?.status
		).toBe("draft");
	});

	// One sent quote per org below: the quotes aggregate keys every sent quote
	// at ["sent", 0] (approvedAt || 0) and convex-test's component emulation
	// rejects duplicate keys that prod tolerates.

	it("a quote minted as declined can't dodge the debit when flipped to sent", async () => {
		const { asUser, orgId, clientId } = await seedSendable(t);
		const declinedId = await asUser.mutation(api.quotes.create, {
			clientId,
			title: "Born declined",
			status: "declined",
			subtotal: 100,
			total: 100,
		});
		expect(await sendUsage(t, orgId)).toBeNull();
		await asUser.mutation(api.quotes.update, {
			id: declinedId,
			status: "sent",
		});
		expect((await sendUsage(t, orgId))?.used).toBe(1);
		expect(
			(await t.run(async (ctx) => ctx.db.get(declinedId)))?.firstSentAt
		).toBeDefined();
	});

	it("reviving a never-sent expired quote debits; reviving a really-sent one is free", async () => {
		const minted = await seedSendable(t, {
			clerkUserId: "user_mint_exp",
			clerkOrgId: "org_mint_exp",
		});
		// Expired without ever being sent (draft → expired via update).
		const mintedExpiredId = await minted.asUser.mutation(api.quotes.create, {
			clientId: minted.clientId,
			title: "Never sent",
			status: "draft",
			subtotal: 100,
			total: 100,
		});
		await minted.asUser.mutation(api.quotes.update, {
			id: mintedExpiredId,
			status: "expired",
		});
		expect(await sendUsage(t, minted.orgId)).toBeNull();
		await minted.asUser.mutation(api.quotes.extendValidUntil, {
			id: mintedExpiredId,
			validUntil: Date.now() + 7 * 86_400_000,
		});
		const revived = await t.run(async (ctx) => ctx.db.get(mintedExpiredId));
		expect(revived?.status).toBe("sent");
		expect(revived?.firstSentAt).toBeDefined();
		expect((await sendUsage(t, minted.orgId))?.used).toBe(1);

		const real = await seedSendable(t, {
			clerkUserId: "user_real_exp",
			clerkOrgId: "org_real_exp",
		});
		const realId = await real.asUser.mutation(api.quotes.create, {
			clientId: real.clientId,
			title: "Really sent",
			status: "draft",
			subtotal: 100,
			total: 100,
		});
		await real.asUser.mutation(api.quotes.sendToClient, { id: realId });
		expect((await sendUsage(t, real.orgId))?.used).toBe(1);
		await real.asUser.mutation(api.quotes.update, {
			id: realId,
			status: "expired",
		});
		await real.asUser.mutation(api.quotes.extendValidUntil, {
			id: realId,
			validUntil: Date.now() + 7 * 86_400_000,
		});
		expect((await sendUsage(t, real.orgId))?.used).toBe(1);
	});

	it("minting an invoice as 'overdue' debits — the portal treats overdue as payable", async () => {
		const { asUser, orgId, clientId } = await seedSendable(t);
		const invoiceId = await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: "INV-OVERDUE",
			status: "overdue",
			subtotal: 100,
			total: 100,
			issuedDate: Date.now() - 30 * 86_400_000,
			dueDate: Date.now() - 86_400_000,
		});
		expect((await sendUsage(t, orgId))?.used).toBe(1);
		expect(
			(await t.run(async (ctx) => ctx.db.get(invoiceId)))?.firstSentAt
		).toBeDefined();
	});

	it("flipping a draft invoice to 'overdue' via update debits like sent", async () => {
		const { asUser, orgId, clientId } = await seedSendable(t);
		const invoiceId = await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: "INV-DRAFT-OVERDUE",
			status: "draft",
			subtotal: 100,
			total: 100,
			issuedDate: Date.now() - 30 * 86_400_000,
			dueDate: Date.now() - 86_400_000,
		});
		expect((await sendUsage(t, orgId))?.used ?? 0).toBe(0);
		await asUser.mutation(api.invoices.update, {
			id: invoiceId,
			status: "overdue",
		});
		expect((await sendUsage(t, orgId))?.used).toBe(1);
		expect(
			(await t.run(async (ctx) => ctx.db.get(invoiceId)))?.firstSentAt
		).toBeDefined();
		// Later sent↔overdue flips never re-debit: firstSentAt is stamped.
		await asUser.mutation(api.invoices.update, {
			id: invoiceId,
			status: "sent",
		});
		await asUser.mutation(api.invoices.update, {
			id: invoiceId,
			status: "overdue",
		});
		expect((await sendUsage(t, orgId))?.used).toBe(1);
	});

	it("each org's sends count only against its own budget", async () => {
		const a = await seedSendable(t, {
			clerkUserId: "user_org_a",
			clerkOrgId: "org_meter_a",
		});
		const b = await seedSendable(t, {
			clerkUserId: "user_org_b",
			clerkOrgId: "org_meter_b",
		});
		await t.run(async (ctx) => {
			await consumeMeter(ctx, a.orgId, "clientSends", { amount: 20 });
		});

		const quoteA = await a.asUser.mutation(api.quotes.create, {
			clientId: a.clientId,
			title: "A",
			status: "draft",
			subtotal: 100,
			total: 100,
		});
		let caught: unknown;
		try {
			await a.asUser.mutation(api.quotes.sendToClient, { id: quoteA });
		} catch (error) {
			caught = error;
		}
		expect(denialPayload(caught)).toContain("PLAN_LIMIT_REACHED");

		const quoteB = await b.asUser.mutation(api.quotes.create, {
			clientId: b.clientId,
			title: "B",
			status: "draft",
			subtotal: 100,
			total: 100,
		});
		await expect(
			b.asUser.mutation(api.quotes.sendToClient, { id: quoteB })
		).resolves.toBeDefined();

		expect(await myMeter(a.asUser, "clientSends")).toMatchObject({
			used: 20,
			remaining: 0,
		});
		expect(await myMeter(b.asUser, "clientSends")).toMatchObject({
			used: 1,
			remaining: 19,
		});
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
		config: {
			version: 2 as const,
			entityType: "clients" as const,
			metric: { op: "count" as const },
		},
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

	it("a grandfathered org can still run a report while create stays refused", async () => {
		const { asUser, orgId } = await seed();
		await t.run(async (ctx) => {
			await ctx.db.patch(orgId, { hasPremiumFeatureAccess: true });
		});
		for (let i = 0; i < 7; i++) {
			await asUser.mutation(api.reports.create, {
				...REPORT_ARGS,
				name: `Report ${i}`,
			});
		}
		await t.run(async (ctx) => {
			await ctx.db.patch(orgId, { hasPremiumFeatureAccess: false });
		});
		await asUser.mutation(api.clients.bulkCreate, {
			clients: [{ companyName: "Reportable", status: "lead" as const }],
		});

		// Running a report is never slot-gated — only creating one is.
		const result = await asUser.query(api.reportData.executeReport, {
			entityType: "clients",
			config: { version: 2, entityType: "clients", metric: { op: "count" } },
			detail: { columns: ["companyName", "status"] },
		});
		expect(result.detail?.rows).toHaveLength(1);

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

	it("the per-day ops bucket binds business orgs too", async () => {
		const { asUser, orgId } = await seed();
		await t.run(async (ctx) => {
			await ctx.db.patch(orgId, { hasPremiumFeatureAccess: true });
		});
		// The daily limiter debits REQUESTED rows before any validation, so
		// unwritable rows fill the bucket without 2,000 client inserts.
		const blank = Array.from({ length: 500 }, () => ({
			companyName: "   ",
			status: "lead" as const,
		}));
		for (let call = 0; call < 4; call++) {
			const results = await asUser.mutation(api.clients.bulkCreate, {
				clients: blank,
			});
			expect(results.every((r) => !r.success)).toBe(true);
		}

		let caught: unknown;
		try {
			await asUser.mutation(api.clients.bulkCreate, { clients: rows(1) });
		} catch (error) {
			caught = error;
		}
		const payload = denialPayload(caught);
		expect(payload).toContain("IMPORT_LIMIT");
		expect(payload).toContain("per day");
		// An ops cap, not a plan meter: nothing was written, nothing debited.
		expect(await importedUsage(orgId)).toBe(0);
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

		await t.run(async (ctx) => {
			await ctx.db.patch(orgId, {
				trialEndsAt: Date.now() - 60_000,
				clerkPlanSlug: "onetool_business_plan_org",
				subscriptionStatus: "active",
			});
		});
		const business = await asUser.query(
			internal.reportConfigGeneration.authContext,
			{}
		);
		expect(business?.plan).toBe("business");
	});
});

describe("Slice A: Stripe-collection bonus (+10 clientSends)", () => {
	let t: TestInstance;

	beforeEach(() => {
		t = setupConvexTest();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	async function seedInvoice() {
		const { orgId, clientId, clerkUserId, clerkOrgId } = await t.run(
			async (ctx) => {
				const seeded = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, seeded.orgId);
				return { ...seeded, clientId };
			}
		);
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const invoiceId = await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: "INV-PAY",
			status: "draft",
			subtotal: 500,
			total: 500,
			issuedDate: Date.now(),
			dueDate: Date.now() + 86_400_000,
		});
		return { asUser, orgId, invoiceId };
	}

	it("a Stripe-collected payment lifts the month's send limit to 30, once", async () => {
		const { asUser, orgId, invoiceId } = await seedInvoice();
		await t.run(async (ctx) => {
			for (const [token, sortOrder] of [
				["tok-1", 0],
				["tok-2", 1],
			] as const) {
				await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 250,
					dueDate: Date.now(),
					sortOrder,
					status: "pending",
					publicToken: token,
				});
			}
		});

		await t.mutation(internal.payments.markPaidByPublicTokenInternal, {
			publicToken: "tok-1",
			stripePaymentIntentId: "pi_bonus_1",
			source: "confirm",
		});
		expect((await usageRow(t, orgId, "clientSends"))?.bonus).toBe(10);
		expect(await myMeter(asUser, "clientSends")).toMatchObject({
			used: 0,
			limit: 30,
			remaining: 30,
		});

		// Second collection in the same period: the once guard makes it a no-op.
		await t.mutation(internal.payments.markPaidByPublicTokenInternal, {
			publicToken: "tok-2",
			stripePaymentIntentId: "pi_bonus_2",
			source: "confirm",
		});
		expect((await usageRow(t, orgId, "clientSends"))?.bonus).toBe(10);
		expect(await myMeter(asUser, "clientSends")).toMatchObject({ limit: 30 });
	});

	it("a manually recorded payment grants nothing", async () => {
		const { asUser, orgId, invoiceId } = await seedInvoice();
		await asUser.mutation(api.payments.configurePayments, {
			invoiceId,
			payments: [
				{
					paymentAmount: 500,
					dueDate: Date.now() + 86_400_000,
					description: "Full Payment",
					sortOrder: 0,
				},
			],
		});

		await asUser.mutation(api.payments.recordManualPayment, {
			invoiceId,
			amount: 500,
			method: "cash",
		});

		expect((await usageRow(t, orgId, "clientSends"))?.bonus).toBeUndefined();
		expect(await myMeter(asUser, "clientSends")).toMatchObject({ limit: 20 });
	});
});

describe("Slice A: meter kill switches (enforce=false)", () => {
	let t: TestInstance;

	beforeEach(() => {
		t = setupConvexTest();
		vi.stubEnv("RESEND_API_KEY", "test-key");
		vi.stubEnv("PORTAL_JWT_ISSUER", "https://portal.example.com");
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	it("clientSends: an exhausted free org still sends, and usage keeps counting", async () => {
		const { asUser, orgId, clientId } = await seedSendable(t);
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

		METERS.clientSends.enforce = false;
		try {
			await expect(
				asUser.mutation(api.quotes.sendToClient, { id: quoteId })
			).resolves.toBeDefined();
			// The kill switch stops refusals, not counting.
			expect((await sendUsage(t, orgId))?.used).toBe(21);
		} finally {
			METERS.clientSends.enforce = true;
		}
	});

	it("importedRows: bulkCreate lands over the lifetime budget", async () => {
		const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) =>
			createTestOrg(ctx)
		);
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		await t.run(async (ctx) => {
			await consumeMeter(ctx, orgId, "importedRows", { amount: 2000 });
		});

		METERS.importedRows.enforce = false;
		try {
			const results = await asUser.mutation(api.clients.bulkCreate, {
				clients: [{ companyName: "Over budget", status: "lead" as const }],
			});
			expect(results.filter((r) => r.success)).toHaveLength(1);
			expect((await usageRow(t, orgId, "importedRows"))?.used).toBe(2001);
		} finally {
			METERS.importedRows.enforce = true;
		}
	});
});
