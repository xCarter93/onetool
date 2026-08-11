import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestClientContact,
	createTestIdentity,
} from "./test.helpers";

// quotes.approveInPerson writes a FULL quoteApprovals audit row (channel
// "in_person") and applies portal-parity status effects. These tests assert
// the audit-row shape, the document OCC/pinning behavior, the sent-only
// precondition, the contact scope check, and the downstream effects (status
// event, activity, celebration notification).
describe("quotes.approveInPerson", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seed(opts?: { status?: "draft" | "sent" | "approved" }) {
		const seeded = await t.run(async (ctx) => {
			const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, orgId);
			const contactId = await createTestClientContact(ctx, orgId, clientId, {
				isPrimary: true,
				email: "signer@example.com",
			});
			const signatureStorageId = await ctx.storage.store(
				new Blob(["<svg/>"], { type: "image/svg+xml" })
			);
			const pdfStorageId = await ctx.storage.store(
				new Blob(["%PDF-fake"], { type: "application/pdf" })
			);
			return {
				orgId,
				clerkUserId,
				clerkOrgId,
				clientId,
				contactId,
				signatureStorageId,
				pdfStorageId,
			};
		});
		const asUser = t.withIdentity(
			createTestIdentity(seeded.clerkUserId, seeded.clerkOrgId)
		);
		// Content lands while the quote is a draft (approved quotes lock line
		// items), then the quote transitions to the target status.
		const quoteId = await asUser.mutation(api.quotes.create, {
			clientId: seeded.clientId,
			title: "Signed Job",
			status: "draft",
			subtotal: 0,
			total: 0,
		});
		await asUser.mutation(api.quoteLineItems.create, {
			quoteId,
			description: "Spring cleanup",
			quantity: 2,
			unit: "hour",
			rate: 75,
			sortOrder: 0,
		});
		const targetStatus = opts?.status ?? "sent";
		if (targetStatus !== "draft") {
			await asUser.mutation(api.quotes.update, {
				id: quoteId,
				status: targetStatus,
			});
		}
		const documentId = await asUser.mutation(api.documents.create, {
			documentType: "quote",
			documentId: quoteId,
			storageId: seeded.pdfStorageId,
		});
		return { ...seeded, asUser, quoteId, documentId };
	}

	function approveArgs(s: Awaited<ReturnType<typeof seed>>) {
		return {
			id: s.quoteId,
			clientContactId: s.contactId,
			expectedDocumentId: s.documentId,
			signatureStorageId: s.signatureStorageId,
			signatureRawData: JSON.stringify([{ d: "M0,0 L10,10" }]),
			deviceDescription: "iPhone 17 Pro · OneTool 3.0",
		};
	}

	it("writes a full in-person audit row and approves the quote", async () => {
		const s = await seed();
		const receipt = await s.asUser.mutation(
			api.quotes.approveInPerson,
			approveArgs(s)
		);
		expect(receipt.auditId).toBeTruthy();

		const row = await t.run(async (ctx) => ctx.db.get(receipt.auditId));
		expect(row).toMatchObject({
			quoteId: s.quoteId,
			clientContactId: s.contactId,
			action: "approved",
			signatureMode: "drawn",
			signatureStorageId: s.signatureStorageId,
			ipAddress: "in-person",
			userAgent: "iPhone 17 Pro · OneTool 3.0",
			channel: "in_person",
			documentId: s.documentId,
			documentVersion: 1,
			subtotalSnapshot: 150,
			totalSnapshot: 150,
		});
		expect(row?.capturedByUserId).toBeTruthy();
		expect(typeof row?.termsAcceptedAt).toBe("number");
		// Intent affirmation is a typed-signature concept — never on drawn rows.
		expect(row?.intentAffirmedAt).toBeUndefined();
		expect(row?.lineItemsSnapshot).toEqual([
			{
				description: "Spring cleanup",
				quantity: 2,
				unit: "hour",
				rate: 75,
				amount: 150,
				sortOrder: 0,
			},
		]);

		const quote = await s.asUser.query(api.quotes.get, { id: s.quoteId });
		expect(quote?.status).toBe("approved");
		expect(typeof quote?.approvedAt).toBe("number");
	});

	it("emits the status event, activity, and celebration notification", async () => {
		const s = await seed();
		await s.asUser.mutation(api.quotes.approveInPerson, approveArgs(s));

		const { events, activities, notifications } = await t.run(async (ctx) => ({
			events: (await ctx.db.query("domainEvents").collect()).filter(
				(row) =>
					row.eventType === "entity.status_changed" &&
					row.eventSource === "quotes.approveInPerson"
			),
			activities: (await ctx.db.query("activities").collect()).filter(
				(row) => row.activityType === "quote_approved"
			),
			notifications: await ctx.db.query("notifications").collect(),
		}));
		expect(events.length).toBe(1);
		expect(events[0]!.payload.oldValue).toBe("sent");
		expect(events[0]!.payload.newValue).toBe("approved");
		expect(activities.length).toBe(1);
		expect(notifications.length).toBeGreaterThan(0);
	});

	it("pins latestDocumentId when the quote had none pinned", async () => {
		const s = await seed();
		await s.asUser.mutation(api.quotes.approveInPerson, approveArgs(s));
		const quote = await t.run(async (ctx) => ctx.db.get(s.quoteId));
		expect(quote?.latestDocumentId).toBe(s.documentId);
	});

	it("rejects a stale expectedDocumentId when a different version is pinned", async () => {
		const s = await seed();
		const otherDocId = await t.run(async (ctx) => {
			const storageId = await ctx.storage.store(
				new Blob(["%PDF-v2"], { type: "application/pdf" })
			);
			const id = await ctx.db.insert("documents", {
				orgId: s.orgId,
				documentType: "quote",
				documentId: s.quoteId,
				storageId,
				generatedAt: Date.now(),
				version: 2,
			});
			await ctx.db.patch(s.quoteId, { latestDocumentId: id });
			return id;
		});
		await expect(
			s.asUser.mutation(api.quotes.approveInPerson, approveArgs(s))
		).rejects.toThrow(/QUOTE_VERSION_STALE/);
		// The pinned v2 satisfies OCC.
		await s.asUser.mutation(api.quotes.approveInPerson, {
			...approveArgs(s),
			expectedDocumentId: otherDocId,
		});
		const quote = await t.run(async (ctx) => ctx.db.get(s.quoteId));
		expect(quote?.status).toBe("approved");
		expect(quote?.latestDocumentId).toBe(otherDocId);
	});

	it("lets a current document supersede a pin that predates a content edit", async () => {
		// revert→edit→resend after a BoldSign pin: the pin points at a PDF older
		// than the content, ensureQuotePdf renders a fresh version, and signing
		// with it must succeed (and move the pin) rather than dead-end on OCC.
		const s = await seed();
		const freshDocId = await t.run(async (ctx) => {
			await ctx.db.patch(s.documentId, { generatedAt: 1000 });
			await ctx.db.patch(s.quoteId, {
				latestDocumentId: s.documentId,
				contentUpdatedAt: 5000,
			});
			const storageId = await ctx.storage.store(
				new Blob(["%PDF-fresh"], { type: "application/pdf" })
			);
			return await ctx.db.insert("documents", {
				orgId: s.orgId,
				documentType: "quote",
				documentId: s.quoteId,
				storageId,
				generatedAt: Date.now(),
				version: 2,
			});
		});

		await s.asUser.mutation(api.quotes.approveInPerson, {
			...approveArgs(s),
			expectedDocumentId: freshDocId,
		});

		const quote = await t.run(async (ctx) => ctx.db.get(s.quoteId));
		expect(quote?.status).toBe("approved");
		expect(quote?.latestDocumentId).toBe(freshDocId);
	});

	it("rejects a document that belongs to a different quote", async () => {
		const s = await seed();
		const foreignDocId = await t.run(async (ctx) => {
			const storageId = await ctx.storage.store(
				new Blob(["%PDF-other"], { type: "application/pdf" })
			);
			return await ctx.db.insert("documents", {
				orgId: s.orgId,
				documentType: "quote",
				documentId: "some-other-quote",
				storageId,
				generatedAt: Date.now(),
				version: 1,
			});
		});
		await expect(
			s.asUser.mutation(api.quotes.approveInPerson, {
				...approveArgs(s),
				expectedDocumentId: foreignDocId as Id<"documents">,
			})
		).rejects.toThrow(/QUOTE_VERSION_STALE/);
	});

	it("only signs sent quotes", async () => {
		for (const status of ["draft", "approved"] as const) {
			const s = await seed({ status });
			await expect(
				s.asUser.mutation(api.quotes.approveInPerson, approveArgs(s))
			).rejects.toThrow(/QUOTE_NOT_PENDING/);
		}
	});

	it("rejects a signer contact from a different client", async () => {
		const s = await seed();
		const strangerContactId = await t.run(async (ctx) => {
			const otherClientId = await createTestClient(ctx, s.orgId, {
				companyName: "Other LLC",
			});
			return await createTestClientContact(ctx, s.orgId, otherClientId, {
				isPrimary: true,
				email: "stranger@example.com",
			});
		});
		await expect(
			s.asUser.mutation(api.quotes.approveInPerson, {
				...approveArgs(s),
				clientContactId: strangerContactId,
			})
		).rejects.toThrow(/FORBIDDEN/);
	});

	it("surfaces channel and capturedByName in the approval audit", async () => {
		const s = await seed();
		await s.asUser.mutation(api.quotes.approveInPerson, approveArgs(s));
		const audit = await s.asUser.query(api.quotes.getApprovalAudit, {
			quoteId: s.quoteId,
		});
		expect(audit.length).toBe(1);
		expect(audit[0]!.channel).toBe("in_person");
		expect(typeof audit[0]!.capturedByName).toBe("string");
		expect(audit[0]!.signatureUrl).toBeTruthy();
	});
});
