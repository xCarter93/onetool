import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestClientContact,
	createTestIdentity,
} from "./test.helpers";

// sendToClient schedules a fire-and-forget email action. The action short-
// circuits on this sentinel before touching the Resend component (unregistered
// in tests); PORTAL_JWT_ISSUER feeds the portal deep-link it builds first.
// Stubbed (not assigned) so the sentinel key can't leak into other test files
// sharing this worker's process.env.
beforeEach(() => {
	vi.stubEnv("RESEND_API_KEY", "test-key");
	vi.stubEnv("PORTAL_JWT_ISSUER", "https://portal.example.com");
});

afterEach(() => {
	vi.unstubAllEnvs();
});

// quotes.sendToClient flips draft/declined/expired→sent and schedules the
// portal-invite email. Tests assert the mutation's contract (recipient guards,
// status transition, status event, email scheduling); the scheduled action is
// drained to a guarded no-op so it can't leak a post-transaction write.
describe("quotes.sendToClient", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	/** Status-change events emitted by sendToClient specifically (quotes.update
	 * emits its own from the same table, so filter on eventSource). */
	async function sendEvents() {
		return await t.run(async (ctx) => {
			const rows = await ctx.db.query("domainEvents").collect();
			return rows.filter(
				(row) =>
					row.eventType === "entity.status_changed" &&
					row.eventSource === "quotes.sendToClient"
			);
		});
	}

	/** Pending scheduled sendQuoteReadyEmail actions (assert before draining). */
	async function pendingQuoteEmails() {
		return await t.run(async (ctx) => {
			const rows = await ctx.db.system.query("_scheduled_functions").collect();
			return rows.filter(
				(row) =>
					row.name.includes("sendQuoteReadyEmail") &&
					row.state.kind === "pending"
			);
		});
	}

	async function seed(opts: {
		portalAccess: boolean;
		contactEmail?: string | null;
		status?: "draft" | "sent" | "approved" | "declined" | "expired";
	}) {
		const { orgId, clientId, clerkUserId, clerkOrgId } = await t.run(
			async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				if (opts.portalAccess) {
					await ctx.db.patch(clientId, { portalAccessId: "portal-abc-123" });
				}
				if (opts.contactEmail !== undefined) {
					await createTestClientContact(ctx, orgId, clientId, {
						isPrimary: true,
						email: opts.contactEmail ?? undefined,
					});
				}
				return { orgId, clientId, clerkUserId, clerkOrgId };
			}
		);

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		// Create via API so quote aggregates initialize and searchText is written.
		const quoteId = await asUser.mutation(api.quotes.create, {
			clientId,
			title: "Test Quote",
			status: opts.status ?? "draft",
			subtotal: 1000,
			total: 1000,
		});
		return { asUser, quoteId, orgId, clientId };
	}

	it("flips a draft quote to sent, stamps sentAt, emits the status event and schedules the email", async () => {
		const { asUser, quoteId } = await seed({
			portalAccess: true,
			contactEmail: "client@example.com",
		});

		await asUser.mutation(api.quotes.sendToClient, { id: quoteId });

		const scheduled = await pendingQuoteEmails();
		expect(scheduled.length).toBe(1);

		const events = await sendEvents();
		expect(events.length).toBe(1);
		expect(events[0]!.payload.entityType).toBe("quote");
		expect(events[0]!.payload.entityId).toBe(quoteId);
		expect(events[0]!.payload.oldValue).toBe("draft");
		expect(events[0]!.payload.newValue).toBe("sent");

		// Drain the scheduled email action (guarded no-op) inside the harness so
		// it doesn't write to _scheduled_functions after the test transaction.
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const quote = await asUser.query(api.quotes.get, { id: quoteId });
		expect(quote?.status).toBe("sent");
		expect(typeof quote?.sentAt).toBe("number");
	});

	it("refuses to send when the valid-until date has passed", async () => {
		const { asUser, quoteId } = await seed({
			portalAccess: true,
			contactEmail: "client@example.com",
			status: "expired",
		});
		// create rejects past dates, so backdate directly — the state a quote
		// reaches once its window lapses.
		await t.run(async (ctx) => {
			await ctx.db.patch(quoteId, {
				validUntil: Date.now() - 30 * 24 * 60 * 60 * 1000,
			});
		});

		await expect(
			asUser.mutation(api.quotes.sendToClient, { id: quoteId })
		).rejects.toThrow(/valid-until date has passed/);

		// No revive: the portal must not regain an approvable expired offer.
		const quote = await asUser.query(api.quotes.get, { id: quoteId });
		expect(quote?.status).toBe("expired");
		expect(await pendingQuoteEmails()).toHaveLength(0);
	});

	it("revives an expired quote whose valid-until date is still ahead", async () => {
		const { asUser, quoteId } = await seed({
			portalAccess: true,
			contactEmail: "client@example.com",
			status: "expired",
		});
		await t.run(async (ctx) => {
			await ctx.db.patch(quoteId, {
				validUntil: Date.now() + 30 * 24 * 60 * 60 * 1000,
			});
		});

		await asUser.mutation(api.quotes.sendToClient, { id: quoteId });
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const quote = await asUser.query(api.quotes.get, { id: quoteId });
		expect(quote?.status).toBe("sent");
	});

	it("schedules a server-side PDF render when the quote has no document", async () => {
		const { asUser, quoteId } = await seed({
			portalAccess: true,
			contactEmail: "client@example.com",
		});

		await asUser.mutation(api.quotes.sendToClient, { id: quoteId });

		const pending = await t.run(async (ctx) => {
			const rows = await ctx.db.system.query("_scheduled_functions").collect();
			return rows.filter(
				(row) =>
					row.name.includes("generateQuotePdf") && row.state.kind === "pending"
			);
		});
		expect(pending.length).toBe(1);

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		// The drained action rendered a real PDF and inserted the documents row.
		const docs = await t.run(async (ctx) =>
			(await ctx.db.query("documents").collect()).filter(
				(d) => d.documentType === "quote" && d.documentId === quoteId
			)
		);
		expect(docs.length).toBe(1);
		expect(docs[0]!.version).toBe(1);
	});

	it("does not schedule a PDF render when the quote already has one", async () => {
		const { asUser, quoteId, orgId } = await seed({
			portalAccess: true,
			contactEmail: "client@example.com",
		});
		await t.run(async (ctx) => {
			const storageId = await ctx.storage.store(
				new Blob(["%PDF-existing"], { type: "application/pdf" })
			);
			await ctx.db.insert("documents", {
				orgId,
				documentType: "quote",
				documentId: quoteId,
				storageId,
				generatedAt: Date.now(),
				version: 1,
			});
		});

		await asUser.mutation(api.quotes.sendToClient, { id: quoteId });

		const pending = await t.run(async (ctx) => {
			const rows = await ctx.db.system.query("_scheduled_functions").collect();
			return rows.filter((row) => row.name.includes("generateQuotePdf"));
		});
		expect(pending.length).toBe(0);
		await t.finishAllScheduledFunctions(vi.runAllTimers);
	});

	it("schedules a fresh render when the newest PDF predates a content edit", async () => {
		const { asUser, quoteId, orgId } = await seed({
			portalAccess: true,
			contactEmail: "client@example.com",
		});
		// A PDF from before the latest edit (revert→edit→resend leaves exactly
		// this state): generatedAt far behind the seed's contentUpdatedAt stamp.
		await t.run(async (ctx) => {
			const storageId = await ctx.storage.store(
				new Blob(["%PDF-stale"], { type: "application/pdf" })
			);
			await ctx.db.insert("documents", {
				orgId,
				documentType: "quote",
				documentId: quoteId,
				storageId,
				generatedAt: 1000,
				version: 1,
			});
			// The edit's touchContent stamp (the seed's raw inserts don't set it).
			await ctx.db.patch(quoteId, { contentUpdatedAt: Date.now() });
		});

		await asUser.mutation(api.quotes.sendToClient, { id: quoteId });

		const pending = await t.run(async (ctx) => {
			const rows = await ctx.db.system.query("_scheduled_functions").collect();
			return rows.filter((row) => row.name.includes("generateQuotePdf"));
		});
		expect(pending.length).toBe(1);
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const versions = await t.run(async (ctx) => {
			const rows = await ctx.db.query("documents").collect();
			return rows
				.filter((row) => row.documentId === quoteId)
				.map((row) => row.version)
				.sort();
		});
		expect(versions).toEqual([1, 2]);
	});

	it("re-sends an already-sent quote without a status change or duplicate event", async () => {
		const { asUser, quoteId } = await seed({
			portalAccess: true,
			contactEmail: "client@example.com",
			status: "sent",
		});

		await asUser.mutation(api.quotes.sendToClient, { id: quoteId });

		// Email still scheduled, but no transition event.
		expect((await pendingQuoteEmails()).length).toBe(1);
		expect((await sendEvents()).length).toBe(0);

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const quote = await asUser.query(api.quotes.get, { id: quoteId });
		expect(quote?.status).toBe("sent");
	});

	it("re-opens a declined quote to sent", async () => {
		const { asUser, quoteId } = await seed({
			portalAccess: true,
			contactEmail: "client@example.com",
		});
		await asUser.mutation(api.quotes.update, {
			id: quoteId,
			status: "declined",
		});

		await asUser.mutation(api.quotes.sendToClient, { id: quoteId });

		const events = await sendEvents();
		expect(events.length).toBe(1);
		expect(events[0]!.payload.oldValue).toBe("declined");
		expect(events[0]!.payload.newValue).toBe("sent");

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const quote = await asUser.query(api.quotes.get, { id: quoteId });
		expect(quote?.status).toBe("sent");
	});

	it("re-opens an expired quote to sent", async () => {
		const { asUser, quoteId } = await seed({
			portalAccess: true,
			contactEmail: "client@example.com",
		});
		await asUser.mutation(api.quotes.update, {
			id: quoteId,
			status: "expired",
		});

		await asUser.mutation(api.quotes.sendToClient, { id: quoteId });

		const events = await sendEvents();
		expect(events.length).toBe(1);
		expect(events[0]!.payload.oldValue).toBe("expired");

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const quote = await asUser.query(api.quotes.get, { id: quoteId });
		expect(quote?.status).toBe("sent");
	});

	it("refuses to send an approved quote", async () => {
		const { asUser, quoteId } = await seed({
			portalAccess: true,
			contactEmail: "client@example.com",
			status: "approved",
		});

		await expect(
			asUser.mutation(api.quotes.sendToClient, { id: quoteId })
		).rejects.toThrow(/already approved/i);
	});

	it("throws when the client has no portal access", async () => {
		const { asUser, quoteId } = await seed({
			portalAccess: false,
			contactEmail: "client@example.com",
		});

		await expect(
			asUser.mutation(api.quotes.sendToClient, { id: quoteId })
		).rejects.toThrow(/portal access/i);
	});

	it("throws when the primary contact has no email", async () => {
		// Empty string models a primary contact row that exists but has no email
		// (the test helper substitutes a default when email is undefined).
		const { asUser, quoteId } = await seed({
			portalAccess: true,
			contactEmail: "",
		});

		await expect(
			asUser.mutation(api.quotes.sendToClient, { id: quoteId })
		).rejects.toThrow(/email/i);
	});

	it("refuses to send a quote belonging to another organization", async () => {
		const { quoteId } = await seed({
			portalAccess: true,
			contactEmail: "client@example.com",
		});

		// Explicit Clerk IDs: createTestOrg's Date.now() defaults collide when two
		// orgs are created inside the same millisecond.
		const other = await t.run(async (ctx) =>
			createTestOrg(ctx, {
				clerkUserId: "user_other_org",
				clerkOrgId: "org_other_org",
			})
		);
		const asOther = t.withIdentity(
			createTestIdentity(other.clerkUserId, other.clerkOrgId)
		);

		await expect(
			asOther.mutation(api.quotes.sendToClient, { id: quoteId })
		).rejects.toThrow();
	});
});
