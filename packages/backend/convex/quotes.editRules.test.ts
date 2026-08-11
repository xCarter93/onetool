import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestInvoice,
	createTestIdentity,
} from "./test.helpers";

// Quote content is editable in DRAFT ONLY (lib/editLocks.ts): sent/expired say
// "revert it to draft", approved/declined are frozen forever. validUntil is the
// deliberate exemption — it's offer-window metadata, editable on a sent or
// expired quote, and quotes.extendValidUntil revives an expired quote to sent.
// Invoices stay deliberately looser; the last test guards that asymmetry.
describe("quote edit rules", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	const DAY = 24 * 60 * 60 * 1000;
	const futureDate = (days: number) => Date.now() + days * DAY;

	type QuoteStatus = "draft" | "sent" | "approved" | "declined" | "expired";

	/**
	 * Seed an org/client/quote through the public API so triggers fire, then
	 * transition to the target status. Line items land while the quote is still a
	 * draft — every non-draft status locks them.
	 */
	async function seed(status: QuoteStatus = "draft") {
		const { orgId, clientId, clerkUserId, clerkOrgId } = await t.run(
			async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				return { orgId, clientId, clerkUserId, clerkOrgId };
			}
		);

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const quoteId = await asUser.mutation(api.quotes.create, {
			clientId,
			title: "Test Quote",
			status: "draft",
			subtotal: 0,
			total: 0,
		});
		const lineItemId = await asUser.mutation(api.quoteLineItems.create, {
			quoteId,
			description: "Spring cleanup",
			quantity: 2,
			unit: "hour",
			rate: 75,
			sortOrder: 0,
		});
		if (status !== "draft") {
			await asUser.mutation(api.quotes.update, { id: quoteId, status });
		}
		return { asUser, orgId, clientId, quoteId, lineItemId };
	}

	/** Read the raw quote doc (contentUpdatedAt/sentAt aren't on every view). */
	async function rawQuote(quoteId: Id<"quotes">) {
		return await t.run(async (ctx) => ctx.db.get(quoteId));
	}

	/** Backdate contentUpdatedAt so a bump is strictly observable. */
	async function backdateContent(quoteId: Id<"quotes">, value = 1_000) {
		await t.run(async (ctx) => {
			await ctx.db.patch(quoteId, { contentUpdatedAt: value });
		});
		return value;
	}

	/** Status-change events emitted by a specific mutation. */
	async function statusEvents(eventSource: string) {
		return await t.run(async (ctx) => {
			const rows = await ctx.db.query("domainEvents").collect();
			return rows.filter(
				(row) =>
					row.eventType === "entity.status_changed" &&
					row.eventSource === eventSource
			);
		});
	}

	describe("line-item editing", () => {
		it("blocks creating a line item on a sent quote", async () => {
			const { asUser, quoteId } = await seed("sent");
			await expect(
				asUser.mutation(api.quoteLineItems.create, {
					quoteId,
					description: "Extra mulch",
					quantity: 1,
					unit: "each",
					rate: 50,
					sortOrder: 1,
				})
			).rejects.toThrow(/QUOTE_LOCKED/);
		});

		it("blocks updating a line item on a sent quote", async () => {
			const { asUser, lineItemId } = await seed("sent");
			await expect(
				asUser.mutation(api.quoteLineItems.update, {
					id: lineItemId,
					rate: 90,
				})
			).rejects.toThrow(/QUOTE_LOCKED/);
		});

		it("blocks line-item create and update on an expired quote", async () => {
			const { asUser, quoteId, lineItemId } = await seed("expired");
			await expect(
				asUser.mutation(api.quoteLineItems.create, {
					quoteId,
					description: "Extra mulch",
					quantity: 1,
					unit: "each",
					rate: 50,
					sortOrder: 1,
				})
			).rejects.toThrow(/QUOTE_LOCKED/);
			await expect(
				asUser.mutation(api.quoteLineItems.update, {
					id: lineItemId,
					rate: 90,
				})
			).rejects.toThrow(/QUOTE_LOCKED/);
		});

		it("tells a sent quote to revert to draft, and freezes an approved one", async () => {
			const sent = await seed("sent");
			await expect(
				sent.asUser.mutation(api.quoteLineItems.update, {
					id: sent.lineItemId,
					rate: 90,
				})
			).rejects.toThrow(/revert it to draft/);

			const approved = await seed("approved");
			await expect(
				approved.asUser.mutation(api.quoteLineItems.update, {
					id: approved.lineItemId,
					rate: 90,
				})
			).rejects.toThrow(/can no longer be edited/);
		});

		it("still allows line-item create and update on a draft quote", async () => {
			const { asUser, quoteId, lineItemId } = await seed("draft");
			const extraId = await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Extra mulch",
				quantity: 1,
				unit: "each",
				rate: 50,
				sortOrder: 1,
			});
			expect(extraId).toBeDefined();

			await asUser.mutation(api.quoteLineItems.update, {
				id: lineItemId,
				rate: 90,
			});
			const item = await asUser.query(api.quoteLineItems.get, { id: lineItemId });
			expect(item?.rate).toBe(90);
		});
	});

	describe("quotes.update content fields", () => {
		it("blocks patching title or terms on a sent quote", async () => {
			const { asUser, quoteId } = await seed("sent");
			await expect(
				asUser.mutation(api.quotes.update, { id: quoteId, title: "Renamed" })
			).rejects.toThrow(/QUOTE_LOCKED/);
			await expect(
				asUser.mutation(api.quotes.update, { id: quoteId, terms: "Net 15" })
			).rejects.toThrow(/QUOTE_LOCKED/);
		});

		it("allows patching title and terms on a draft quote", async () => {
			const { asUser, quoteId } = await seed("draft");
			await asUser.mutation(api.quotes.update, {
				id: quoteId,
				title: "Renamed",
				terms: "Net 15",
			});
			const quote = await asUser.query(api.quotes.get, { id: quoteId });
			expect(quote?.title).toBe("Renamed");
			expect(quote?.terms).toBe("Net 15");
		});
	});

	describe("reverting to draft", () => {
		it("clears sentAt when a sent quote goes back to draft", async () => {
			const { asUser, quoteId } = await seed("sent");
			expect(typeof (await rawQuote(quoteId))?.sentAt).toBe("number");

			await asUser.mutation(api.quotes.update, { id: quoteId, status: "draft" });

			const quote = await rawQuote(quoteId);
			expect(quote?.status).toBe("draft");
			expect(quote?.sentAt).toBeUndefined();
		});
	});

	describe("quotes.update validUntil", () => {
		it("is exempt from the draft-only lock on a sent quote and bumps contentUpdatedAt", async () => {
			const { asUser, quoteId } = await seed("sent");
			const backdated = await backdateContent(quoteId);
			const validUntil = futureDate(30);

			await asUser.mutation(api.quotes.update, { id: quoteId, validUntil });

			const quote = await rawQuote(quoteId);
			expect(quote?.validUntil).toBe(validUntil);
			expect(quote?.status).toBe("sent");
			expect(quote?.contentUpdatedAt).toBeGreaterThan(backdated);
		});

		it("rejects a validUntil patch on an approved quote", async () => {
			const { asUser, quoteId } = await seed("approved");
			await expect(
				asUser.mutation(api.quotes.update, {
					id: quoteId,
					validUntil: futureDate(30),
				})
			).rejects.toThrow(/QUOTE_LOCKED/);
		});
	});

	describe("quotes.extendValidUntil", () => {
		it("extends a sent quote without changing its status", async () => {
			const { asUser, quoteId } = await seed("sent");
			const backdated = await backdateContent(quoteId);
			const validUntil = futureDate(45);

			await asUser.mutation(api.quotes.extendValidUntil, {
				id: quoteId,
				validUntil,
			});

			const quote = await rawQuote(quoteId);
			expect(quote?.validUntil).toBe(validUntil);
			expect(quote?.status).toBe("sent");
			expect(quote?.contentUpdatedAt).toBeGreaterThan(backdated);
			expect(await statusEvents("quotes.extendValidUntil")).toHaveLength(0);
		});

		it("revives an expired quote to sent and emits the status event", async () => {
			const { asUser, quoteId } = await seed("expired");
			const validUntil = futureDate(45);

			await asUser.mutation(api.quotes.extendValidUntil, {
				id: quoteId,
				validUntil,
			});

			const quote = await rawQuote(quoteId);
			expect(quote?.status).toBe("sent");
			expect(quote?.validUntil).toBe(validUntil);

			const events = await statusEvents("quotes.extendValidUntil");
			expect(events.length).toBe(1);
			expect(events[0]!.payload.entityType).toBe("quote");
			expect(events[0]!.payload.entityId).toBe(quoteId);
			expect(events[0]!.payload.oldValue).toBe("expired");
			expect(events[0]!.payload.newValue).toBe("sent");
		});

		it("rejects a date in the past", async () => {
			const { asUser, quoteId } = await seed("sent");
			await expect(
				asUser.mutation(api.quotes.extendValidUntil, {
					id: quoteId,
					validUntil: Date.now() - 2 * DAY,
				})
			).rejects.toThrow(/past/i);
		});

		it("rejects an approved quote", async () => {
			const { asUser, quoteId } = await seed("approved");
			await expect(
				asUser.mutation(api.quotes.extendValidUntil, {
					id: quoteId,
					validUntil: futureDate(45),
				})
			).rejects.toThrow(/QUOTE_LOCKED/);
		});
	});

	// Regression guard: the quote lock must not leak onto invoices. Invoices are
	// bills, not offers — field corrections before money settles are legitimate.
	describe("invoice asymmetry", () => {
		it("still allows adding a line item to a SENT invoice", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					status: "sent",
				});
				return { invoiceId, clerkUserId, clerkOrgId };
			});
			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const lineItemId = await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "Late add-on",
				quantity: 2,
				unitPrice: 50,
				sortOrder: 0,
			});
			expect(lineItemId).toBeDefined();

			const lineItem = await asUser.query(api.invoiceLineItems.get, {
				id: lineItemId,
			});
			expect(lineItem?.total).toBe(100);
		});
	});
});
