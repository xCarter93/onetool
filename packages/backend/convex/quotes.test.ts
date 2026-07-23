import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { Id } from "./_generated/dataModel";
import {
	createTestOrg,
	createTestClient,
	createTestQuote,
	createTestIdentity,
} from "./test.helpers";

describe("Quotes", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	describe("create", () => {
		it.skip("should create a quote with valid data", async () => {
			const { userId, orgId, clientId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});

				return { userId, orgId, clientId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			const quoteId = await asUser.mutation(api.quotes.create, {
				clientId,
				title: "Test Quote",
				status: "draft",
				subtotal: 1000,
				total: 1000,
			});

			expect(quoteId).toBeDefined();

			const quote = await asUser.query(api.quotes.get, { id: quoteId });
			expect(quote).toMatchObject({
				clientId,
				title: "Test Quote",
				status: "draft",
				subtotal: 1000,
				total: 1000,
				orgId,
			});
		});

		it("should generate sequential quote numbers", async () => {
			const { userId, clientId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});

				return { userId, clientId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			// Create first quote
			const quote1Id = await asUser.mutation(api.quotes.create, {
				clientId,
				title: "Quote 1",
				status: "draft",
				subtotal: 1000,
				total: 1000,
			});

			const quote1 = await asUser.query(api.quotes.get, { id: quote1Id });
			expect(quote1?.quoteNumber).toBe("Q-000001");

			// Create second quote
			const quote2Id = await asUser.mutation(api.quotes.create, {
				clientId,
				title: "Quote 2",
				status: "draft",
				subtotal: 2000,
				total: 2000,
			});

			const quote2 = await asUser.query(api.quotes.get, { id: quote2Id });
			expect(quote2?.quoteNumber).toBe("Q-000002");

			// Create third quote
			const quote3Id = await asUser.mutation(api.quotes.create, {
				clientId,
				title: "Quote 3",
				status: "draft",
				subtotal: 3000,
				total: 3000,
			});

			const quote3 = await asUser.query(api.quotes.get, { id: quote3Id });
			expect(quote3?.quoteNumber).toBe("Q-000003");
		});
	});

	describe("list", () => {
		it("should return empty array when no quotes exist", async () => {
			await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			const quotes = await asUser.query(api.quotes.list, {});
			expect(quotes).toEqual([]);
		});

		it("should filter quotes by status", async () => {
			const { userId, clientId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});

				return { userId, clientId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			// Create quotes with different statuses
			await asUser.mutation(api.quotes.create, {
				clientId,
				title: "Draft Quote",
				status: "draft",
				subtotal: 1000,
				total: 1000,
			});

			await asUser.mutation(api.quotes.create, {
				clientId,
				title: "Sent Quote",
				status: "sent",
				subtotal: 2000,
				total: 2000,
			});

			await asUser.mutation(api.quotes.create, {
				clientId,
				title: "Approved Quote",
				status: "approved",
				subtotal: 3000,
				total: 3000,
			});

			const draftQuotes = await asUser.query(api.quotes.list, {
				status: "draft",
			});
			expect(draftQuotes).toHaveLength(1);
			expect(draftQuotes[0].title).toBe("Draft Quote");

			const sentQuotes = await asUser.query(api.quotes.list, {
				status: "sent",
			});
			expect(sentQuotes).toHaveLength(1);
			expect(sentQuotes[0].title).toBe("Sent Quote");

			const allQuotes = await asUser.query(api.quotes.list, {});
			expect(allQuotes).toHaveLength(3);
		});

		it("should filter quotes by clientId", async () => {
			const { userId, clientId1, clientId2 } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				const clientId1 = await ctx.db.insert("clients", {
					orgId,
					companyName: "Client 1",
					status: "active",
				});

				const clientId2 = await ctx.db.insert("clients", {
					orgId,
					companyName: "Client 2",
					status: "active",
				});

				return { userId, clientId1, clientId2 };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			await asUser.mutation(api.quotes.create, {
				clientId: clientId1,
				title: "Quote for Client 1",
				status: "draft",
				subtotal: 1000,
				total: 1000,
			});

			await asUser.mutation(api.quotes.create, {
				clientId: clientId2,
				title: "Quote for Client 2",
				status: "draft",
				subtotal: 2000,
				total: 2000,
			});

			const client1Quotes = await asUser.query(api.quotes.list, {
				clientId: clientId1,
			});
			expect(client1Quotes).toHaveLength(1);
			expect(client1Quotes[0].title).toBe("Quote for Client 1");
		});
	});

	describe("update", () => {
		it.skip("should update quote status", async () => {
			const { userId, clientId, quoteId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});

				const quoteId = await ctx.db.insert("quotes", {
					orgId,
					clientId,
					title: "Test Quote",
					status: "draft",
					subtotal: 1000,
					total: 1000,
					publicToken: "test_token_123",
				});

				return { userId, clientId, quoteId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			await asUser.mutation(api.quotes.update, {
				id: quoteId,
				status: "sent",
			});

			const quote = await asUser.query(api.quotes.get, { id: quoteId });
			expect(quote?.status).toBe("sent");
		});
	});

	describe("getAwaitingSigning", () => {
		const DAY_MS = 24 * 60 * 60 * 1000;

		it("should return sent quotes with validUntil within 7 days", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				// Quote valid until 3 days from now
				await ctx.db.insert("quotes", {
					orgId,
					clientId,
					title: "Expiring Soon Quote",
					status: "sent",
					sentAt: Date.now() - 4 * DAY_MS,
					validUntil: Date.now() + 3 * DAY_MS,
					subtotal: 1000,
					total: 1000,
				});
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const quotes = await asUser.query(api.quotes.getAwaitingSigning, {});
			expect(quotes).toHaveLength(1);
			expect(quotes[0].title).toBe("Expiring Soon Quote");
		});

		it("should return sent quotes with validUntil already passed", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				// Quote expired 2 days ago
				await ctx.db.insert("quotes", {
					orgId,
					clientId,
					title: "Expired Quote",
					status: "sent",
					sentAt: Date.now() - 10 * DAY_MS,
					validUntil: Date.now() - 2 * DAY_MS,
					subtotal: 1000,
					total: 1000,
				});
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const quotes = await asUser.query(api.quotes.getAwaitingSigning, {});
			expect(quotes).toHaveLength(1);
			expect(quotes[0].title).toBe("Expired Quote");
		});

		it("should exclude sent quotes with validUntil more than 7 days away", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				// Quote valid until 14 days from now
				await ctx.db.insert("quotes", {
					orgId,
					clientId,
					title: "Far Future Quote",
					status: "sent",
					sentAt: Date.now() - 1 * DAY_MS,
					validUntil: Date.now() + 14 * DAY_MS,
					subtotal: 1000,
					total: 1000,
				});
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const quotes = await asUser.query(api.quotes.getAwaitingSigning, {});
			expect(quotes).toHaveLength(0);
		});

		it("should exclude sent quotes with no validUntil field", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				await ctx.db.insert("quotes", {
					orgId,
					clientId,
					title: "No ValidUntil Quote",
					status: "sent",
					subtotal: 1000,
					total: 1000,
				});
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const quotes = await asUser.query(api.quotes.getAwaitingSigning, {});
			expect(quotes).toHaveLength(0);
		});

		it("should exclude quotes with non-sent statuses", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				for (const status of ["draft", "approved", "declined", "expired"] as const) {
					await ctx.db.insert("quotes", {
						orgId,
						clientId,
						title: `${status} Quote`,
						status,
						validUntil: Date.now() + 3 * DAY_MS,
						subtotal: 1000,
						total: 1000,
					});
				}
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const quotes = await asUser.query(api.quotes.getAwaitingSigning, {});
			expect(quotes).toHaveLength(0);
		});

		it("should return empty array when no org context", async () => {
			const quotes = await t.query(api.quotes.getAwaitingSigning, {});
			expect(quotes).toEqual([]);
		});

		it("should not return quotes from other organizations", async () => {
			const { clerkUserId1, clerkOrgId1 } = await t.run(async (ctx) => {
				const { orgId: orgId1, clerkUserId: clerkUserId1, clerkOrgId: clerkOrgId1 } =
					await createTestOrg(ctx, { clerkUserId: "user_1", clerkOrgId: "org_1" });
				const clientId1 = await createTestClient(ctx, orgId1);

				const { orgId: orgId2 } = await createTestOrg(ctx, {
					clerkUserId: "user_2",
					clerkOrgId: "org_2",
				});
				const clientId2 = await createTestClient(ctx, orgId2);
				await ctx.db.insert("quotes", {
					orgId: orgId2,
					clientId: clientId2,
					title: "Other Org Quote",
					status: "sent",
					validUntil: Date.now() + 3 * DAY_MS,
					subtotal: 1000,
					total: 1000,
				});

				return { clerkUserId1, clerkOrgId1 };
			});

			const asUser1 = t.withIdentity(createTestIdentity(clerkUserId1, clerkOrgId1));
			const quotes = await asUser1.query(api.quotes.getAwaitingSigning, {});
			expect(quotes).toHaveLength(0);
		});

		it("returns null instead of throwing for a cross-org quote id", async () => {
			// Opening a quote belonging to another org must degrade to an empty
			// state rather than throw an uncaught org-mismatch error.
			const { quoteId1, clerkUserId2, clerkOrgId2 } = await t.run(
				async (ctx) => {
					const { orgId: orgId1 } = await createTestOrg(ctx, {
						clerkUserId: "user_1",
						clerkOrgId: "org_1",
					});
					const clientId1 = await createTestClient(ctx, orgId1);
					const quoteId1 = await createTestQuote(ctx, orgId1, clientId1);

					const { clerkUserId: clerkUserId2, clerkOrgId: clerkOrgId2 } =
						await createTestOrg(ctx, {
							clerkUserId: "user_2",
							clerkOrgId: "org_2",
						});

					return { quoteId1, clerkUserId2, clerkOrgId2 };
				}
			);

			const asUser2 = t.withIdentity(
				createTestIdentity(clerkUserId2, clerkOrgId2)
			);

			await expect(
				asUser2.query(api.quotes.get, { id: quoteId1 })
			).resolves.toBeNull();
		});
	});

	describe("getStats", () => {
		it.skip("should return correct quote statistics", async () => {
			const { userId, clientId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});

				return { userId, clientId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			// Create quotes with different statuses
			await asUser.mutation(api.quotes.create, {
				clientId,
				title: "Draft Quote",
				status: "draft",
				subtotal: 1000,
				total: 1000,
			});

			await asUser.mutation(api.quotes.create, {
				clientId,
				title: "Sent Quote",
				status: "sent",
				subtotal: 2000,
				total: 2000,
			});

			await asUser.mutation(api.quotes.create, {
				clientId,
				title: "Approved Quote",
				status: "approved",
				subtotal: 3000,
				total: 3000,
			});

			const stats = await asUser.query(api.quotes.getStats, {});

			expect(stats.total).toBe(3);
			expect(stats.byStatus.draft).toBe(1);
			expect(stats.byStatus.sent).toBe(1);
			expect(stats.byStatus.approved).toBe(1);
			expect(stats.totalValue).toBe(6000); // Sum of all totals
		});
	});
});

// Plan 14.1-02 (QUOTE-04 workspace half) — getApprovalAudit query tests.
// Six tests cover happy path + cross-org FORBIDDEN + empty + audit-pin
// + per-row defense-in-depth (REVIEWS HIGH 2026-05-10) + empty-snapshot
// normalization. ConvexError data is parsed via err.data shape (string or
// object) per STATE.md note [13-03] — `instanceof ConvexError` is unreliable
// across the convex-test module realm boundary.
describe("quotes.getApprovalAudit (Plan 14.1-02)", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seedOrgA() {
		return await t.run(async (ctx) => {
			const orgSetup = await createTestOrg(ctx, {
				clerkUserId: "user_orgA",
				clerkOrgId: "org_A",
				userEmail: "admin-a@example.com",
			});
			const clientId = await createTestClient(ctx, orgSetup.orgId);
			const contactId = await ctx.db.insert("clientContacts", {
				orgId: orgSetup.orgId,
				clientId,
				firstName: "Client",
				lastName: "A",
				email: "client@example.com",
				isPrimary: true,
			});
			const quoteId = await createTestQuote(ctx, orgSetup.orgId, clientId);
			return { ...orgSetup, clientId, contactId, quoteId };
		});
	}

	async function seedOrgB() {
		return await t.run(async (ctx) => {
			const orgSetup = await createTestOrg(ctx, {
				clerkUserId: "user_orgB",
				clerkOrgId: "org_B",
				userEmail: "admin-b@example.com",
			});
			return orgSetup;
		});
	}

	async function insertDocument(
		orgId: Id<"organizations">,
		quoteId: Id<"quotes">,
		version: number,
		storageBytes: string
	): Promise<{ docId: Id<"documents">; storageId: Id<"_storage"> }> {
		return await t.run(async (ctx) => {
			const blob = new Blob([storageBytes], { type: "application/pdf" });
			const storageId = await ctx.storage.store(blob);
			const docId = await ctx.db.insert("documents", {
				orgId,
				documentType: "quote",
				documentId: quoteId,
				storageId,
				generatedAt: Date.now(),
				version,
			});
			return { docId, storageId };
		});
	}

	async function insertSignatureBlob(): Promise<Id<"_storage">> {
		return await t.run(async (ctx) => {
			const blob = new Blob(["fake-png-bytes"], { type: "image/png" });
			return await ctx.storage.store(blob);
		});
	}

	it("Test A — returns rows for owner org with email join, newest first, with lineItemsSnapshot populated", async () => {
		const seed = await seedOrgA();
		const { docId: docAId } = await insertDocument(
			seed.orgId,
			seed.quoteId,
			1,
			"v1-pdf-bytes"
		);
		const sigStorageId = await insertSignatureBlob();

		await t.run(async (ctx) => {
			// row1: approved, drawn signature, line-items snapshot of 1 item.
			await ctx.db.insert("quoteApprovals", {
				quoteId: seed.quoteId,
				orgId: seed.orgId,
				clientContactId: seed.contactId,
				action: "approved",
				signatureStorageId: sigStorageId,
				signatureMode: "drawn",
				ipAddress: "1.2.3.4",
				userAgent: "UA-1",
				documentId: docAId,
				documentVersion: 1,
				lineItemsSnapshot: [
					{
						description: "Cleaning",
						quantity: 1,
						unit: "hr",
						rate: 50,
						amount: 50,
						sortOrder: 0,
					},
				],
				subtotalSnapshot: 50,
				taxSnapshot: 0,
				totalSnapshot: 50,
				createdAt: 1000,
			});
			// row2: declined, no signature, snapshot of 1 item.
			await ctx.db.insert("quoteApprovals", {
				quoteId: seed.quoteId,
				orgId: seed.orgId,
				clientContactId: seed.contactId,
				action: "declined",
				declineReason: "too expensive",
				ipAddress: "5.6.7.8",
				userAgent: "UA-2",
				documentId: docAId,
				documentVersion: 2,
				lineItemsSnapshot: [
					{
						description: "Item A",
						quantity: 2,
						unit: "each",
						rate: 10,
						amount: 20,
						sortOrder: 0,
					},
				],
				subtotalSnapshot: 20,
				taxSnapshot: 0,
				totalSnapshot: 20,
				createdAt: 2000,
			});
		});

		const asUser = t.withIdentity(
			createTestIdentity(seed.clerkUserId, seed.clerkOrgId)
		);
		const result = await asUser.query(api.quotes.getApprovalAudit, {
			quoteId: seed.quoteId,
		});

		expect(result).toHaveLength(2);
		expect(result[0].createdAt).toBe(2000);
		expect(result[1].createdAt).toBe(1000);
		expect(result[0].contactEmail).toBe("client@example.com");
		expect(result[0].action).toBe("declined");
		expect(result[0].declineReason).toBe("too expensive");
		expect(Array.isArray(result[0].lineItemsSnapshot)).toBe(true);
		expect(result[0].lineItemsSnapshot![0].description).toBe("Item A");
		expect(result[0].lineItemsSnapshot![0].amount).toBe(20);
		expect(result[1].lineItemsSnapshot![0].description).toBe("Cleaning");
		expect(result[1].action).toBe("approved");
		expect(result[1].signatureUrl).toBeTruthy();
		expect(result[1].signatureMode).toBe("drawn");
	});

	it("Test B — throws FORBIDDEN when caller's org does not own the quote", async () => {
		const seed = await seedOrgA();
		const orgB = await seedOrgB();

		const asOrgB = t.withIdentity(
			createTestIdentity(orgB.clerkUserId, orgB.clerkOrgId)
		);

		try {
			await asOrgB.query(api.quotes.getApprovalAudit, {
				quoteId: seed.quoteId,
			});
			throw new Error("expected throw");
		} catch (err: unknown) {
			const e = err as { data?: unknown };
			const data =
				typeof e.data === "string"
					? JSON.parse(e.data as string)
					: (e.data as { code?: string } | undefined);
			expect(data?.code).toBe("FORBIDDEN");
		}
	});

	it("Test C — returns [] for a quote with no audit rows", async () => {
		const seed = await seedOrgA();
		const asUser = t.withIdentity(
			createTestIdentity(seed.clerkUserId, seed.clerkOrgId)
		);
		const result = await asUser.query(api.quotes.getApprovalAudit, {
			quoteId: seed.quoteId,
		});
		expect(result).toEqual([]);
	});

	it("Test D — auditPinnedPdfUrl uses the row's documentId, not quote.latestDocumentId [audit-pin]", async () => {
		const seed = await seedOrgA();
		const { docId: docV1Id, storageId: storageV1 } = await insertDocument(
			seed.orgId,
			seed.quoteId,
			1,
			"v1-pdf-bytes"
		);
		const { docId: docV2Id } = await insertDocument(
			seed.orgId,
			seed.quoteId,
			2,
			"v2-pdf-bytes"
		);

		await t.run(async (ctx) => {
			// Pin the quote to v2 but pin the audit row to v1 — the row's documentId wins.
			await ctx.db.patch(seed.quoteId, { latestDocumentId: docV2Id });
			await ctx.db.insert("quoteApprovals", {
				quoteId: seed.quoteId,
				orgId: seed.orgId,
				clientContactId: seed.contactId,
				action: "approved",
				ipAddress: "1.2.3.4",
				userAgent: "UA",
				documentId: docV1Id,
				documentVersion: 1,
				lineItemsSnapshot: [
					{
						description: "Item",
						quantity: 1,
						unit: "ea",
						rate: 1,
						amount: 1,
						sortOrder: 0,
					},
				],
				subtotalSnapshot: 1,
				taxSnapshot: 0,
				totalSnapshot: 1,
				createdAt: 5000,
			});
		});

		const asUser = t.withIdentity(
			createTestIdentity(seed.clerkUserId, seed.clerkOrgId)
		);
		const result = await asUser.query(api.quotes.getApprovalAudit, {
			quoteId: seed.quoteId,
		});

		expect(result).toHaveLength(1);
		expect(result[0].documentId).toBe(docV1Id);
		expect(result[0].auditPinnedPdfUrl).toBeTruthy();

		// The URL should resolve from the v1 storage blob, not v2.
		const expectedV1Url = await t.run(
			async (ctx) => await ctx.storage.getUrl(storageV1)
		);
		expect(result[0].auditPinnedPdfUrl).toBe(expectedV1Url);
	});

	it("Test E [REVIEWS HIGH] — defense-in-depth drops rows with foreign row.orgId, contact.orgId, or document.orgId", async () => {
		const seed = await seedOrgA();
		const orgB = await seedOrgB();

		// Seed a foreign contact (orgB) and a foreign document (orgB).
		const { foreignContactId, clientBId } = await t.run(async (ctx) => {
			const clientB = await createTestClient(ctx, orgB.orgId);
			const fc = await ctx.db.insert("clientContacts", {
				orgId: orgB.orgId,
				clientId: clientB,
				firstName: "Foreign",
				lastName: "Contact",
				email: "foreign@example.com",
				isPrimary: false,
			});
			return { foreignContactId: fc, clientBId: clientB };
		});
		const { docId: docAId } = await insertDocument(
			seed.orgId,
			seed.quoteId,
			1,
			"v1-orgA"
		);
		const { docId: docBId } = await insertDocument(
			orgB.orgId,
			seed.quoteId,
			1,
			"v1-orgB"
		);

		const rowGoodId = await t.run(async (ctx) => {
			const goodId = await ctx.db.insert("quoteApprovals", {
				quoteId: seed.quoteId,
				orgId: seed.orgId,
				clientContactId: seed.contactId,
				action: "approved",
				ipAddress: "1.1.1.1",
				userAgent: "UA-good",
				documentId: docAId,
				documentVersion: 1,
				lineItemsSnapshot: [
					{
						description: "ok",
						quantity: 1,
						unit: "ea",
						rate: 1,
						amount: 1,
						sortOrder: 0,
					},
				],
				subtotalSnapshot: 1,
				taxSnapshot: 0,
				totalSnapshot: 1,
				createdAt: 4000,
			});
			// rowBadRow: row.orgId is foreign.
			await ctx.db.insert("quoteApprovals", {
				quoteId: seed.quoteId,
				orgId: orgB.orgId,
				clientContactId: seed.contactId,
				action: "approved",
				ipAddress: "2.2.2.2",
				userAgent: "UA-bad-row",
				documentId: docAId,
				documentVersion: 1,
				lineItemsSnapshot: [],
				subtotalSnapshot: 0,
				taxSnapshot: 0,
				totalSnapshot: 0,
				createdAt: 3000,
			});
			// rowBadContact: row.orgId=orgA but contact is foreign.
			await ctx.db.insert("quoteApprovals", {
				quoteId: seed.quoteId,
				orgId: seed.orgId,
				clientContactId: foreignContactId,
				action: "approved",
				ipAddress: "3.3.3.3",
				userAgent: "UA-bad-contact",
				documentId: docAId,
				documentVersion: 1,
				lineItemsSnapshot: [],
				subtotalSnapshot: 0,
				taxSnapshot: 0,
				totalSnapshot: 0,
				createdAt: 2000,
			});
			// rowBadDoc: row.orgId=orgA, contact ok, but document is foreign.
			await ctx.db.insert("quoteApprovals", {
				quoteId: seed.quoteId,
				orgId: seed.orgId,
				clientContactId: seed.contactId,
				action: "approved",
				ipAddress: "4.4.4.4",
				userAgent: "UA-bad-doc",
				documentId: docBId,
				documentVersion: 1,
				lineItemsSnapshot: [],
				subtotalSnapshot: 0,
				taxSnapshot: 0,
				totalSnapshot: 0,
				createdAt: 1500,
			});
			return goodId;
		});
		void clientBId;

		const asUser = t.withIdentity(
			createTestIdentity(seed.clerkUserId, seed.clerkOrgId)
		);
		const result = await asUser.query(api.quotes.getApprovalAudit, {
			quoteId: seed.quoteId,
		});

		// rowBadRow: filtered (row.orgId mismatch)
		// rowBadContact: filtered (contact.orgId mismatch)
		// rowBadDoc: filtered (document.orgId mismatch — implementation choice: drop entirely)
		expect(result).toHaveLength(1);
		expect(result[0].auditId).toBe(rowGoodId);
		expect(result[0].documentId).toBe(docAId);
	});

	it("Test F — lineItemsSnapshot is null for empty arrays (DTO normalization, per D-2)", async () => {
		const seed = await seedOrgA();
		const { docId: docAId } = await insertDocument(
			seed.orgId,
			seed.quoteId,
			1,
			"v1-pdf"
		);

		await t.run(async (ctx) => {
			await ctx.db.insert("quoteApprovals", {
				quoteId: seed.quoteId,
				orgId: seed.orgId,
				clientContactId: seed.contactId,
				action: "approved",
				ipAddress: "1.2.3.4",
				userAgent: "UA",
				documentId: docAId,
				documentVersion: 1,
				lineItemsSnapshot: [],
				subtotalSnapshot: 0,
				taxSnapshot: 0,
				totalSnapshot: 0,
				createdAt: 9000,
			});
		});

		const asUser = t.withIdentity(
			createTestIdentity(seed.clerkUserId, seed.clerkOrgId)
		);
		const result = await asUser.query(api.quotes.getApprovalAudit, {
			quoteId: seed.quoteId,
		});

		expect(result).toHaveLength(1);
		expect(result[0].lineItemsSnapshot).toBeNull();
	});
});
