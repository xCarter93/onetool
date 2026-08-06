import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	addMemberToOrg,
	createTestIdentity,
} from "./test.helpers";

/**
 * Celebration notifications (lib/celebrations.ts + notifications.markCelebrated /
 * celebrationsForCurrentUser).
 *
 * Every record is created through the real public mutations so triggers fire
 * (searchText digests + aggregates); the only raw db access is reading the
 * `notifications` rows back and flipping org celebration settings for the
 * non-owner cases.
 */

const DAY = 24 * 60 * 60 * 1000;

describe("celebrations", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	// ---------------------------------------------------------------- seeding

	/**
	 * Org with three humans: the owner (admin), a second admin, and a plain
	 * member. Returns identity-bound clients for each.
	 */
	async function seedOrg(suffix: string) {
		const { orgId, userId: ownerUserId, clerkUserId, clerkOrgId } = await t.run(
			(ctx) =>
				createTestOrg(ctx, {
					userName: "Owner",
					userEmail: `owner_${suffix}@example.com`,
					clerkUserId: `user_cel_owner_${suffix}`,
					clerkOrgId: `org_cel_${suffix}`,
				})
		);

		const admin2 = await t.run((ctx) =>
			addMemberToOrg(ctx, orgId, {
				userName: "Second Admin",
				userEmail: `admin2_${suffix}@example.com`,
				clerkUserId: `user_cel_admin2_${suffix}`,
				role: "admin",
			})
		);

		const member = await t.run((ctx) =>
			addMemberToOrg(ctx, orgId, {
				userName: "Plain Member",
				userEmail: `member_${suffix}@example.com`,
				clerkUserId: `user_cel_member_${suffix}`,
				role: "member",
			})
		);

		return {
			orgId,
			ownerUserId,
			admin2UserId: admin2.userId,
			memberUserId: member.userId,
			asOwner: t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId)),
			asAdmin2: t.withIdentity(
				createTestIdentity(admin2.clerkUserId, clerkOrgId)
			),
			asMember: t.withIdentity(
				createTestIdentity(member.clerkUserId, clerkOrgId)
			),
		};
	}

	async function createClient(
		asUser: ReturnType<typeof t.withIdentity>,
		companyName: string
	): Promise<Id<"clients">> {
		return await asUser.mutation(api.clients.create, {
			companyName,
			status: "active",
			portalAccessId: crypto.randomUUID(),
		});
	}

	async function createSentQuote(
		asUser: ReturnType<typeof t.withIdentity>,
		clientId: Id<"clients">,
		opts: { quoteNumber: string; total: number }
	): Promise<Id<"quotes">> {
		return await asUser.mutation(api.quotes.create, {
			clientId,
			title: "Roof replacement",
			quoteNumber: opts.quoteNumber,
			status: "sent",
			subtotal: opts.total,
			taxAmount: 0,
			total: opts.total,
		});
	}

	async function createSentInvoice(
		asUser: ReturnType<typeof t.withIdentity>,
		clientId: Id<"clients">,
		opts: { invoiceNumber: string; total: number }
	): Promise<Id<"invoices">> {
		return await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: opts.invoiceNumber,
			status: "sent",
			subtotal: opts.total,
			taxAmount: 0,
			total: opts.total,
			issuedDate: Date.now(),
			dueDate: Date.now() + 30 * DAY,
		});
	}

	/** All notification rows of a type in an org, read raw. */
	async function celebrationRows(
		orgId: Id<"organizations">,
		notificationType: "quote_approved" | "payment_received"
	): Promise<Doc<"notifications">[]> {
		return await t.run(async (ctx) => {
			const rows = await ctx.db.query("notifications").collect();
			return rows.filter(
				(n) => n.orgId === orgId && n.notificationType === notificationType
			);
		});
	}

	async function setOrgCelebrations(
		orgId: Id<"organizations">,
		patch: {
			celebrationsEnabled?: boolean;
			celebrationsAudience?: "admins" | "everyone";
		}
	): Promise<void> {
		await t.run(async (ctx) => {
			await ctx.db.patch(orgId, patch);
		});
	}

	// =====================================================================
	// a) quote approval, default audience ("admins")
	// =====================================================================

	it("creates detailed quote_approved rows for admins only by default", async () => {
		const org = await seedOrg("a");
		const clientId = await createClient(org.asOwner, "Acme Roofing");
		const quoteId = await createSentQuote(org.asOwner, clientId, {
			quoteNumber: "Q-1001",
			total: 2500,
		});

		await org.asOwner.mutation(api.quotes.update, {
			id: quoteId,
			status: "approved",
		});

		const rows = await celebrationRows(org.orgId, "quote_approved");
		const recipients = rows.map((r) => r.userId).sort();
		expect(recipients).toEqual(
			[org.ownerUserId, org.admin2UserId].sort()
		);
		// Plain member is excluded under the default "admins" audience.
		expect(recipients).not.toContain(org.memberUserId);

		// One flair line shared by the whole batch.
		const flairs = new Set(rows.map((r) => r.celebrationFlair));
		expect(flairs.size).toBe(1);
		expect([...flairs][0]).toBeTruthy();

		for (const row of rows) {
			expect(row.title).toBe("Quote approved");
			expect(row.message).toContain("Acme Roofing");
			expect(row.message).toContain("Q-1001");
			expect(row.entityType).toBe("quote");
			expect(row.entityId).toBe(quoteId);
			expect(row.actionUrl).toBe(`/quotes/${quoteId}`);
			expect(row.isRead).toBe(false);
		}
	});

	// =====================================================================
	// b) audience "everyone" — members get generic, detail-free copy
	// =====================================================================

	it("gives non-admin members generic copy when audience is everyone", async () => {
		const org = await seedOrg("b");
		await setOrgCelebrations(org.orgId, { celebrationsAudience: "everyone" });

		const clientId = await createClient(org.asOwner, "Beta Landscaping");
		const quoteId = await createSentQuote(org.asOwner, clientId, {
			quoteNumber: "Q-2002",
			total: 900,
		});

		await org.asOwner.mutation(api.quotes.update, {
			id: quoteId,
			status: "approved",
		});

		const rows = await celebrationRows(org.orgId, "quote_approved");
		expect(rows.map((r) => r.userId).sort()).toEqual(
			[org.ownerUserId, org.admin2UserId, org.memberUserId].sort()
		);

		const memberRow = rows.find((r) => r.userId === org.memberUserId);
		expect(memberRow).toBeDefined();
		expect(memberRow?.title).toBe("Team win");
		expect(memberRow?.entityType).toBeUndefined();
		expect(memberRow?.entityId).toBeUndefined();
		expect(memberRow?.actionUrl).toBeUndefined();
		expect(memberRow?.message).not.toContain("Beta Landscaping");
		expect(memberRow?.celebrationFlair).toBeTruthy();

		const adminRow = rows.find((r) => r.userId === org.admin2UserId);
		expect(adminRow?.title).toBe("Quote approved");
		expect(adminRow?.entityId).toBe(quoteId);
		expect(adminRow?.actionUrl).toBe(`/quotes/${quoteId}`);
		// Same flair for detailed and generic recipients.
		expect(memberRow?.celebrationFlair).toBe(adminRow?.celebrationFlair);
	});

	// =====================================================================
	// c) org opt-out
	// =====================================================================

	it("creates no celebration rows when celebrationsEnabled is false", async () => {
		const org = await seedOrg("c");
		await setOrgCelebrations(org.orgId, { celebrationsEnabled: false });

		const clientId = await createClient(org.asOwner, "Ceres HVAC");
		const quoteId = await createSentQuote(org.asOwner, clientId, {
			quoteNumber: "Q-3003",
			total: 400,
		});

		await org.asOwner.mutation(api.quotes.update, {
			id: quoteId,
			status: "approved",
		});

		expect(await celebrationRows(org.orgId, "quote_approved")).toHaveLength(0);
	});

	// =====================================================================
	// d) once-per-record dedup
	// =====================================================================

	it("celebrates a quote only once even if it re-enters approved", async () => {
		const org = await seedOrg("d");
		const clientId = await createClient(org.asOwner, "Delta Cleaning");
		const quoteId = await createSentQuote(org.asOwner, clientId, {
			quoteNumber: "Q-4004",
			total: 1200,
		});

		await org.asOwner.mutation(api.quotes.update, {
			id: quoteId,
			status: "approved",
		});
		const firstBatch = await celebrationRows(org.orgId, "quote_approved");
		expect(firstBatch).toHaveLength(2);

		await org.asOwner.mutation(api.quotes.update, {
			id: quoteId,
			status: "sent",
		});
		await org.asOwner.mutation(api.quotes.update, {
			id: quoteId,
			status: "approved",
		});

		const secondBatch = await celebrationRows(org.orgId, "quote_approved");
		expect(secondBatch).toHaveLength(2);
		expect(secondBatch.map((r) => r._id).sort()).toEqual(
			firstBatch.map((r) => r._id).sort()
		);
	});

	// =====================================================================
	// e) invoice paid
	// =====================================================================

	it("creates payment_received rows when an invoice is marked paid", async () => {
		const org = await seedOrg("e");
		const clientId = await createClient(org.asOwner, "Echo Plumbing");
		const invoiceId = await createSentInvoice(org.asOwner, clientId, {
			invoiceNumber: "INV-5005",
			total: 750,
		});

		await org.asOwner.mutation(api.invoices.markPaid, { id: invoiceId });

		const rows = await celebrationRows(org.orgId, "payment_received");
		expect(rows.map((r) => r.userId).sort()).toEqual(
			[org.ownerUserId, org.admin2UserId].sort()
		);
		for (const row of rows) {
			expect(row.title).toBe("Invoice paid");
			expect(row.message).toContain("Echo Plumbing");
			expect(row.message).toContain("INV-5005");
			expect(row.entityType).toBe("invoice");
			expect(row.entityId).toBe(invoiceId);
			expect(row.actionUrl).toBe(`/invoices/${invoiceId}`);
			expect(row.celebrationFlair).toBeTruthy();
		}
	});

	// =====================================================================
	// f) markCelebrated ownership + celebrationsForCurrentUser
	// =====================================================================

	it("only lets a user stamp their own celebration rows", async () => {
		const org = await seedOrg("f");
		const clientId = await createClient(org.asOwner, "Foxtrot Fencing");
		const quoteId = await createSentQuote(org.asOwner, clientId, {
			quoteNumber: "Q-6006",
			total: 300,
		});
		await org.asOwner.mutation(api.quotes.update, {
			id: quoteId,
			status: "approved",
		});

		const rows = await celebrationRows(org.orgId, "quote_approved");
		const ownerRow = rows.find((r) => r.userId === org.ownerUserId)!;
		const adminRow = rows.find((r) => r.userId === org.admin2UserId)!;
		expect(ownerRow).toBeDefined();
		expect(adminRow).toBeDefined();

		// Both users see their pending celebration.
		const ownerPending = await org.asOwner.query(
			api.notifications.celebrationsForCurrentUser,
			{}
		);
		expect(ownerPending.map((n) => n._id)).toEqual([ownerRow._id]);
		const adminPendingBefore = await org.asAdmin2.query(
			api.notifications.celebrationsForCurrentUser,
			{}
		);
		expect(adminPendingBefore.map((n) => n._id)).toEqual([adminRow._id]);
		expect(adminPendingBefore[0].celebrationFlair).toBeTruthy();

		// Owner tries to stamp the other admin's row — silently ignored.
		await org.asOwner.mutation(api.notifications.markCelebrated, {
			ids: [adminRow._id],
		});
		const adminRowAfter = await t.run((ctx) => ctx.db.get(adminRow._id));
		expect(adminRowAfter?.celebratedAt).toBeUndefined();

		// Stamping own row works and removes it from the pending feed.
		await org.asOwner.mutation(api.notifications.markCelebrated, {
			ids: [ownerRow._id],
		});
		const ownerRowAfter = await t.run((ctx) => ctx.db.get(ownerRow._id));
		expect(ownerRowAfter?.celebratedAt).toBeTypeOf("number");

		expect(
			await org.asOwner.query(api.notifications.celebrationsForCurrentUser, {})
		).toEqual([]);
		// The other admin's row is still pending for them.
		const adminPendingAfter = await org.asAdmin2.query(
			api.notifications.celebrationsForCurrentUser,
			{}
		);
		expect(adminPendingAfter.map((n) => n._id)).toEqual([adminRow._id]);
	});

	it("hides celebrations older than the freshness window", async () => {
		const org = await seedOrg("g");
		const clientId = await createClient(org.asOwner, "Golf Gutters");
		const quoteId = await createSentQuote(org.asOwner, clientId, {
			quoteNumber: "Q-7007",
			total: 400,
		});
		await org.asOwner.mutation(api.quotes.update, {
			id: quoteId,
			status: "approved",
		});

		expect(
			await org.asOwner.query(api.notifications.celebrationsForCurrentUser, {})
		).toHaveLength(1);

		// Age the row past the 15-minute window; fake only Date so convex-test's
		// internal timers keep running.
		vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 16 * 60 * 1000 });
		try {
			expect(
				await org.asOwner.query(
					api.notifications.celebrationsForCurrentUser,
					{}
				)
			).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
	});
});
