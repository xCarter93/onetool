// portal.quotes.list ships the STORED quote total instead of recomputing from
// line items on every evaluation of a live portal subscription. portal.quotes.get
// still recomputes, so it is the oracle: list must always agree with it. Every
// record is built through the real public API so syncQuoteTotals actually runs.
import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { setupConvexTest } from "../test.setup";
import {
	createTestClient,
	createTestIdentity,
	createTestOrg,
} from "../test.helpers";

const PORTAL_ISSUER = "https://portal.example.com";

beforeAll(() => {
	process.env.PORTAL_JWT_ISSUER = PORTAL_ISSUER;
});

describe("portal.quotes.list totals", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seed() {
		const { org, clientId } = await t.run(async (ctx) => {
			const created = await createTestOrg(ctx);
			return {
				org: created,
				clientId: await createTestClient(ctx, created.orgId),
			};
		});
		const asOwner = t.withIdentity(
			createTestIdentity(org.clerkUserId, org.clerkOrgId)
		);

		const quoteId = await asOwner.mutation(api.quotes.create, {
			clientId,
			status: "draft",
			subtotal: 0,
			total: 0,
			title: "Spring cleanup",
			taxEnabled: true,
			taxRate: 10,
		});

		const portalId = "portal-uuid-quotes";
		const clientContactId = await t.run(async (ctx) => {
			await ctx.db.patch(clientId, { portalAccessId: portalId });
			return await ctx.db.insert("clientContacts", {
				clientId,
				orgId: org.orgId,
				firstName: "Pat",
				lastName: "Customer",
				email: "pat@example.com",
				isPrimary: true,
			});
		});
		const jti = "jti-quotes-1";
		await t.run(async (ctx) => {
			await ctx.db.insert("portalSessions", {
				orgId: org.orgId,
				clientId,
				clientContactId,
				clientPortalId: portalId,
				tokenJti: jti,
				createdAt: Date.now(),
				lastActivityAt: Date.now(),
				expiresAt: Date.now() + 60 * 60 * 1000,
			});
		});

		const asClient = t.withIdentity({
			issuer: PORTAL_ISSUER,
			subject: clientContactId,
			aud: "convex-portal",
			jti,
			orgId: org.orgId,
			clientContactId,
			clientPortalId: portalId,
		} as unknown as Parameters<typeof t.withIdentity>[0]);

		return { asOwner, asClient, clientId, quoteId, orgId: org.orgId };
	}

	// Line items are edit-locked once a quote leaves draft, and portal.quotes.list
	// hides drafts — so each edit round-trips through draft and back.
	async function setStatus(quoteId: Id<"quotes">, status: "draft" | "sent") {
		await t.run(async (ctx) => {
			await ctx.db.patch(quoteId, { status, sentAt: Date.now() });
		});
	}

	async function listedTotal(
		asClient: Awaited<ReturnType<typeof seed>>["asClient"],
		quoteId: Id<"quotes">
	) {
		const rows = await asClient.query(api.portal.quotes.list, {});
		return rows.find((row) => row._id === quoteId)?.total;
	}

	it("agrees with portal.quotes.get after create, update and remove", async () => {
		const { asOwner, asClient, quoteId } = await seed();

		const firstItem = await asOwner.mutation(api.quoteLineItems.create, {
			quoteId,
			description: "Mowing",
			quantity: 2,
			unit: "each",
			rate: 150,
			sortOrder: 0,
		});
		await asOwner.mutation(api.quoteLineItems.create, {
			quoteId,
			description: "Hedging",
			quantity: 1,
			unit: "each",
			rate: 75.5,
			sortOrder: 1,
		});
		await setStatus(quoteId, "sent");

		const afterCreate = await asClient.query(api.portal.quotes.get, { quoteId });
		expect(afterCreate.quote.total).toBe(413.05); // (300 + 75.50) * 1.10
		expect(await listedTotal(asClient, quoteId)).toBe(afterCreate.quote.total);

		await setStatus(quoteId, "draft");
		await asOwner.mutation(api.quoteLineItems.update, {
			id: firstItem,
			quantity: 3,
		});
		await setStatus(quoteId, "sent");
		const afterUpdate = await asClient.query(api.portal.quotes.get, { quoteId });
		expect(afterUpdate.quote.total).toBe(578.05); // (450 + 75.50) * 1.10
		expect(await listedTotal(asClient, quoteId)).toBe(afterUpdate.quote.total);

		await setStatus(quoteId, "draft");
		await asOwner.mutation(api.quoteLineItems.remove, { id: firstItem });
		await setStatus(quoteId, "sent");
		const afterRemove = await asClient.query(api.portal.quotes.get, { quoteId });
		expect(afterRemove.quote.total).toBe(83.05); // 75.50 * 1.10
		expect(await listedTotal(asClient, quoteId)).toBe(afterRemove.quote.total);
	});

	it("agrees with portal.quotes.get after a discount edit on the quote", async () => {
		const { asOwner, asClient, quoteId } = await seed();

		await asOwner.mutation(api.quoteLineItems.create, {
			quoteId,
			description: "Mowing",
			quantity: 4,
			unit: "each",
			rate: 100,
			sortOrder: 0,
		});
		await asOwner.mutation(api.quotes.update, {
			id: quoteId,
			discountEnabled: true,
			discountType: "percentage",
			discountAmount: 25,
		});
		await setStatus(quoteId, "sent");

		const detail = await asClient.query(api.portal.quotes.get, { quoteId });
		expect(detail.quote.total).toBe(330); // (400 - 100) * 1.10
		expect(await listedTotal(asClient, quoteId)).toBe(detail.quote.total);
	});
});
