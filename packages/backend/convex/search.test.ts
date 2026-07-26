import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestProject,
	createTestQuote,
	createTestInvoice,
	createTestTask,
	createTestClientContact,
	createTestClientProperty,
	createTestIdentity,
} from "./test.helpers";

describe("globalSearch", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	describe("organization isolation", () => {
		it("only returns the caller's org records in every bucket", async () => {
			const { clerkUserId1, clerkOrgId1 } = await t.run(async (ctx) => {
				const { orgId: orgId1, clerkUserId, clerkOrgId } = await createTestOrg(
					ctx,
					{ clerkUserId: "user_1", clerkOrgId: "org_1" }
				);
				const clientId1 = await createTestClient(ctx, orgId1, {
					companyName: "Acme Alpha Inc",
				});
				await createTestProject(ctx, orgId1, clientId1, {
					title: "Acme Alpha Project",
				});
				await createTestQuote(ctx, orgId1, clientId1, {
					title: "Plain quote",
					quoteNumber: "Q-ACME-A",
				});
				await createTestInvoice(ctx, orgId1, clientId1, {
					invoiceNumber: "INV-ACME-A",
				});
				await createTestTask(ctx, orgId1, { title: "Acme Alpha Task" });
				await createTestClientContact(ctx, orgId1, clientId1, {
					firstName: "Annie",
					lastName: "Acmeworth",
				});
				await createTestClientProperty(ctx, orgId1, clientId1, {
					streetAddress: "1 Acme Way",
				});

				const { orgId: orgId2 } = await createTestOrg(ctx, {
					clerkUserId: "user_2",
					clerkOrgId: "org_2",
				});
				const clientId2 = await createTestClient(ctx, orgId2, {
					companyName: "Acme Beta LLC",
				});
				await createTestProject(ctx, orgId2, clientId2, {
					title: "Acme Beta Project",
				});
				await createTestQuote(ctx, orgId2, clientId2, {
					title: "Other quote",
					quoteNumber: "Q-ACME-B",
				});
				await createTestInvoice(ctx, orgId2, clientId2, {
					invoiceNumber: "INV-ACME-B",
				});
				await createTestTask(ctx, orgId2, { title: "Acme Beta Task" });
				await createTestClientContact(ctx, orgId2, clientId2, {
					firstName: "Bob",
					lastName: "Acmeburg",
				});
				await createTestClientProperty(ctx, orgId2, clientId2, {
					streetAddress: "2 Acme Blvd",
				});

				return { clerkUserId1: clerkUserId, clerkOrgId1: clerkOrgId };
			});

			const asUser1 = t.withIdentity(
				createTestIdentity(clerkUserId1, clerkOrgId1)
			);
			const result = await asUser1.query(api.search.globalSearch, {
				query: "acme",
			});

			// Clients bucket merges the client hit + contact hit + property hit.
			expect(result.clients).toHaveLength(3);
			const kinds = result.clients.map((c) => c.kind).sort();
			expect(kinds).toEqual(["client", "contact", "property"]);
			expect(
				result.clients.every((c) => c.label === "Acme Alpha Inc")
			).toBe(true);
			const contactHit = result.clients.find((c) => c.kind === "contact");
			expect(contactHit?.detail).toBe("Annie Acmeworth");
			const propertyHit = result.clients.find((c) => c.kind === "property");
			expect(propertyHit?.detail).toContain("1 Acme Way");

			expect(result.projects).toHaveLength(1);
			expect(result.projects[0].label).toBe("Acme Alpha Project");

			expect(result.quotes).toHaveLength(1);
			expect(result.quotes[0].label).toBe("Plain quote");

			expect(result.invoices).toHaveLength(1);
			expect(result.invoices[0].label).toBe("INV-ACME-A");

			expect(result.tasks).toHaveLength(1);
			expect(result.tasks[0].title).toBe("Acme Alpha Task");

			// Nothing from org 2 anywhere in the payload.
			const json = JSON.stringify(result);
			expect(json).not.toContain("Acme Beta");
			expect(json).not.toContain("Q-ACME-B");
			expect(json).not.toContain("INV-ACME-B");
			expect(json).not.toContain("Acmeburg");
			expect(json).not.toContain("Acme Blvd");
		});
	});

	describe("field matching", () => {
		it("matches each bucket on its primary text field", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx, {
					clerkUserId: "user_1",
					clerkOrgId: "org_1",
				});
				const clientId = await createTestClient(ctx, orgId, {
					companyName: "Zenith Corp",
				});
				await createTestProject(ctx, orgId, clientId, {
					title: "Falcon Deck Build",
				});
				await createTestQuote(ctx, orgId, clientId, {
					title: "Plain quote",
					quoteNumber: "Q-9931",
				});
				await createTestInvoice(ctx, orgId, clientId, {
					invoiceNumber: "INV-7742",
				});
				await createTestTask(ctx, orgId, { title: "Mow Lawn Gamma" });
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const byCompany = await asUser.query(api.search.globalSearch, {
				query: "zenith",
			});
			expect(byCompany.clients).toHaveLength(1);
			expect(byCompany.clients[0]).toMatchObject({
				kind: "client",
				label: "Zenith Corp",
			});

			const byProjectTitle = await asUser.query(api.search.globalSearch, {
				query: "falcon",
			});
			expect(byProjectTitle.projects).toHaveLength(1);
			expect(byProjectTitle.projects[0].label).toBe("Falcon Deck Build");

			const byQuoteNumber = await asUser.query(api.search.globalSearch, {
				query: "9931",
			});
			expect(byQuoteNumber.quotes).toHaveLength(1);
			expect(byQuoteNumber.quotes[0].label).toBe("Plain quote");

			const byInvoiceNumber = await asUser.query(api.search.globalSearch, {
				query: "7742",
			});
			expect(byInvoiceNumber.invoices).toHaveLength(1);
			expect(byInvoiceNumber.invoices[0].label).toBe("INV-7742");

			const byTaskTitle = await asUser.query(api.search.globalSearch, {
				query: "gamma",
			});
			expect(byTaskTitle.tasks).toHaveLength(1);
			expect(byTaskTitle.tasks[0].title).toBe("Mow Lawn Gamma");
		});
	});

	describe("contact and property hits", () => {
		it("merges contact and property hits into the clients bucket", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx, {
					clerkUserId: "user_1",
					clerkOrgId: "org_1",
				});
				const clientId = await createTestClient(ctx, orgId, {
					companyName: "Sunrise Homes",
				});
				await createTestClientContact(ctx, orgId, clientId, {
					firstName: "Jane",
					lastName: "Henderson",
				});
				await createTestClientProperty(ctx, orgId, clientId, {
					streetAddress: "12 Maple St",
				});
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const byContact = await asUser.query(api.search.globalSearch, {
				query: "henderson",
			});
			expect(byContact.clients).toHaveLength(1);
			expect(byContact.clients[0]).toMatchObject({
				kind: "contact",
				label: "Sunrise Homes",
				detail: "Jane Henderson",
			});

			const byProperty = await asUser.query(api.search.globalSearch, {
				query: "maple",
			});
			expect(byProperty.clients).toHaveLength(1);
			expect(byProperty.clients[0].kind).toBe("property");
			expect(byProperty.clients[0].label).toBe("Sunrise Homes");
			expect(byProperty.clients[0].detail?.startsWith("12 Maple St")).toBe(
				true
			);
		});
	});

	describe("archived clients", () => {
		it("excludes archived clients and their contact hits", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx, {
					clerkUserId: "user_1",
					clerkOrgId: "org_1",
				});
				const archivedId = await createTestClient(ctx, orgId, {
					companyName: "Ghostly Corp",
					status: "archived",
				});
				await createTestClientContact(ctx, orgId, archivedId, {
					firstName: "Ghostly",
					lastName: "Person",
				});
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const result = await asUser.query(api.search.globalSearch, {
				query: "ghostly",
			});

			expect(result.clients).toHaveLength(0);
		});
	});

	describe("auth and query guards", () => {
		it("returns empty buckets when unauthenticated", async () => {
			await t.run(async (ctx) => {
				const { orgId } = await createTestOrg(ctx, {
					clerkUserId: "user_1",
					clerkOrgId: "org_1",
				});
				await createTestClient(ctx, orgId, { companyName: "Acme Alpha Inc" });
			});

			const result = await t.query(api.search.globalSearch, { query: "acme" });

			expect(result.clients).toHaveLength(0);
			expect(result.projects).toHaveLength(0);
			expect(result.quotes).toHaveLength(0);
			expect(result.invoices).toHaveLength(0);
			expect(result.tasks).toHaveLength(0);
		});

		it("returns empty buckets for queries under 2 characters", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx, {
					clerkUserId: "user_1",
					clerkOrgId: "org_1",
				});
				await createTestClient(ctx, orgId, { companyName: "Acme Alpha Inc" });
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const result = await asUser.query(api.search.globalSearch, {
				query: "a",
			});

			expect(result.clients).toHaveLength(0);
			expect(result.projects).toHaveLength(0);
			expect(result.quotes).toHaveLength(0);
			expect(result.invoices).toHaveLength(0);
			expect(result.tasks).toHaveLength(0);
		});
	});

	describe("bucket limit", () => {
		it("caps client-kind hits at 5", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx, {
					clerkUserId: "user_1",
					clerkOrgId: "org_1",
				});
				for (let i = 1; i <= 7; i++) {
					await createTestClient(ctx, orgId, {
						companyName: `Bulk Client ${i}`,
					});
				}
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const result = await asUser.query(api.search.globalSearch, {
				query: "bulk",
			});

			expect(result.clients).toHaveLength(5);
			expect(result.clients.every((c) => c.kind === "client")).toBe(true);
		});
	});
});
