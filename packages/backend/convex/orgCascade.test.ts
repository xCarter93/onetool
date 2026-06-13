import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { internal } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { AggregateHelpers } from "./lib/aggregates";
import { ORG_SCOPED_CASCADE_TABLES } from "./lib/orgCascade";

/**
 * Coverage for the org-deletion cascade (Phase 28-04, REL-02/REL-03):
 *  - full cascade drains every seeded org-scoped table + maintains aggregates
 *  - reconciliation removes an orphan client row AND an orphan membership
 *  - the webhook→scheduler chain (deleteFromClerk) drains child tables
 *  - a schema-coverage guard diffs ORG_SCOPED_CASCADE_TABLES against schema.ts
 */

describe("orgCascade", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("full cascade drains every seeded org-scoped table", () => {
		it("removes all child data + storage-holding rows + maintains aggregates", async () => {
			const { orgId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Owner",
					email: "owner@example.com",
					image: "x",
					externalId: "user_cascade",
				});
				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_cascade",
					name: "Cascade Org",
					ownerUserId: userId,
				});
				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				// client (+ aggregate)
				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "ACME",
					status: "active",
				});
				const client = await ctx.db.get(clientId);
				await AggregateHelpers.addClient(ctx, client!);

				const contactId = await ctx.db.insert("clientContacts", {
					clientId,
					orgId,
					firstName: "Jane",
					lastName: "Doe",
					isPrimary: true,
				});
				await ctx.db.insert("clientProperties", {
					clientId,
					orgId,
					streetAddress: "1 St",
					city: "Town",
					state: "CA",
					zipCode: "90000",
					isPrimary: true,
				});

				// project (+ aggregate)
				const projectId = await ctx.db.insert("projects", {
					orgId,
					clientId,
					title: "Proj",
					status: "planned",
					projectType: "one-off",
				});
				const project = await ctx.db.get(projectId);
				await AggregateHelpers.addProject(ctx, project!);

				// quote (+ aggregate) + line item + approval
				const quoteId = await ctx.db.insert("quotes", {
					orgId,
					clientId,
					status: "draft",
					subtotal: 100,
					total: 100,
				});
				const quote = await ctx.db.get(quoteId);
				await AggregateHelpers.addQuote(ctx, quote!);
				await ctx.db.insert("quoteLineItems", {
					quoteId,
					orgId,
					description: "Work",
					quantity: 1,
					unit: "item",
					rate: 100,
					amount: 100,
					sortOrder: 0,
				});
				const docStorageId = await ctx.storage.store(
					new Blob(["doc"], { type: "application/pdf" })
				);
				const docId = await ctx.db.insert("documents", {
					orgId,
					documentType: "quote",
					documentId: quoteId,
					storageId: docStorageId,
					generatedAt: Date.now(),
					version: 1,
				});
				await ctx.db.insert("quoteApprovals", {
					quoteId,
					orgId,
					clientContactId: contactId,
					action: "approved",
					ipAddress: "0.0.0.0",
					userAgent: "test",
					documentId: docId,
					documentVersion: 1,
					lineItemsSnapshot: [],
					subtotalSnapshot: 100,
					taxSnapshot: 0,
					totalSnapshot: 100,
					createdAt: Date.now(),
				});

				// invoice (+ aggregate) + line item + payment
				const invoiceId = await ctx.db.insert("invoices", {
					orgId,
					clientId,
					invoiceNumber: "INV-1",
					status: "draft",
					subtotal: 100,
					total: 100,
					issuedDate: Date.now(),
					dueDate: Date.now(),
					publicToken: "tok-inv",
				});
				const invoice = await ctx.db.get(invoiceId);
				await AggregateHelpers.addInvoice(ctx, invoice!);
				await ctx.db.insert("invoiceLineItems", {
					invoiceId,
					orgId,
					description: "Work",
					quantity: 1,
					unitPrice: 100,
					total: 100,
					sortOrder: 0,
				});
				await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 100,
					dueDate: Date.now(),
					sortOrder: 0,
					status: "pending",
					publicToken: "tok-pay",
				});

				// task
				await ctx.db.insert("tasks", {
					orgId,
					title: "Do thing",
					date: Date.now(),
					status: "pending",
				});

				// notification
				await ctx.db.insert("notifications", {
					orgId,
					userId,
					notificationType: "task_reminder",
					title: "T",
					message: "M",
					isRead: false,
				});

				// activity (by_org_timestamp shape)
				await ctx.db.insert("activities", {
					orgId,
					userId,
					activityType: "client_created",
					entityType: "client",
					entityId: clientId,
					entityName: "ACME",
					description: "created",
					timestamp: Date.now(),
					isVisible: true,
				});

				// communityPage carrying storage ids (banner + gallery)
				const bannerStorageId = await ctx.storage.store(
					new Blob(["banner"], { type: "image/png" })
				);
				const galleryStorageId = await ctx.storage.store(
					new Blob(["gallery"], { type: "image/png" })
				);
				await ctx.db.insert("communityPages", {
					orgId,
					slug: "acme",
					isPublic: true,
					bannerStorageId,
					galleryItemsDraft: [
						{
							storageId: galleryStorageId,
							sortOrder: 0,
						},
					],
					createdAt: Date.now(),
					updatedAt: Date.now(),
				});

				// portalSessions + portalOtpCodes + userFavorites (exercise new by_org)
				await ctx.db.insert("portalSessions", {
					orgId,
					clientId,
					clientContactId: contactId,
					clientPortalId: "portal-1",
					tokenJti: "jti-1",
					createdAt: Date.now(),
					lastActivityAt: Date.now(),
					expiresAt: Date.now() + 1000,
				});
				await ctx.db.insert("portalOtpCodes", {
					orgId,
					clientId,
					clientContactId: contactId,
					clientPortalId: "portal-1",
					email: "jane@example.com",
					codeHash: "hash",
					salt: "salt",
					attempts: 0,
					expiresAt: Date.now() + 1000,
					createdAt: Date.now(),
				});
				await ctx.db.insert("userFavorites", {
					userId,
					orgId,
					clientId,
					createdAt: Date.now(),
				});

				return { orgId };
			});

			// Delete the org row synchronously (entry-point behaviour), then drain.
			await t.run(async (ctx) => {
				await ctx.db.delete(orgId);
			});
			await t.mutation(internal.orgCascade.cascadeDeleteOrgDataChunk, {
				orgId,
			});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			// Assert every seeded org-scoped table is empty for this org.
			const counts = await t.run(async (ctx) => {
				const tables = [
					"clients",
					"clientContacts",
					"clientProperties",
					"projects",
					"quotes",
					"quoteLineItems",
					"quoteApprovals",
					"documents",
					"invoices",
					"invoiceLineItems",
					"payments",
					"tasks",
					"notifications",
					"activities",
					"communityPages",
					"portalSessions",
					"portalOtpCodes",
					"userFavorites",
				] as const;
				const result: Record<string, number> = {};
				for (const table of tables) {
					const rows = await ctx.db.query(table).collect();
					result[table] = rows.filter(
						(r) => (r as { orgId?: unknown }).orgId === orgId
					).length;
				}
				const org = await ctx.db.get(orgId);
				return { result, orgIsNull: org === null };
			});

			expect(counts.orgIsNull).toBe(true);
			for (const [table, n] of Object.entries(counts.result)) {
				expect(`${table}:${n}`).toBe(`${table}:0`);
			}
		});

		it("does not abort the drain when a parent row was never added to its aggregate (DELETE_MISSING_KEY)", async () => {
			const { orgId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Owner2",
					email: "owner2@example.com",
					image: "x",
					externalId: "user_missingkey",
				});
				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_missingkey",
					name: "MK Org",
					ownerUserId: userId,
				});
				// client NEVER added to its aggregate.
				await ctx.db.insert("clients", {
					orgId,
					companyName: "NoAgg",
					status: "active",
				});
				await ctx.db.delete(orgId);
				return { orgId };
			});

			await t.mutation(internal.orgCascade.cascadeDeleteOrgDataChunk, {
				orgId,
			});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const remaining = await t.run(async (ctx) => {
				const rows = await ctx.db.query("clients").collect();
				return rows.filter((r) => r.orgId === orgId).length;
			});
			expect(remaining).toBe(0);
		});
	});

	describe("reconcileOrphanedOrgData", () => {
		it("removes an orphan client row (via cascade) and an orphan membership (directly)", async () => {
			const { danglingOrgId } = await t.run(async (ctx) => {
				// Create a real org just to mint a valid id, then delete it so the
				// orgId no longer resolves.
				const userId = await ctx.db.insert("users", {
					name: "Ghost",
					email: "ghost@example.com",
					image: "x",
					externalId: "user_ghost",
				});
				const realOrgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_ghost",
					name: "Ghost Org",
					ownerUserId: userId,
				});
				await ctx.db.delete(realOrgId);

				// Orphan rows pointing at the now-deleted org.
				await ctx.db.insert("clients", {
					orgId: realOrgId,
					companyName: "Orphan Co",
					status: "active",
				});
				await ctx.db.insert("organizationMemberships", {
					orgId: realOrgId,
					userId,
					role: "admin",
				});
				return { danglingOrgId: realOrgId };
			});

			await t.mutation(internal.orgCascade.reconcileOrphanedOrgData, {});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const { clientCount, membershipCount } = await t.run(async (ctx) => {
				const clients = await ctx.db.query("clients").collect();
				const memberships = await ctx.db
					.query("organizationMemberships")
					.collect();
				return {
					clientCount: clients.filter((c) => c.orgId === danglingOrgId)
						.length,
					membershipCount: memberships.filter(
						(m) => m.orgId === danglingOrgId
					).length,
				};
			});

			expect(clientCount).toBe(0);
			expect(membershipCount).toBe(0);
		});
	});

	describe("webhook → scheduler integration (deleteFromClerk)", () => {
		it("deletes the org row synchronously and drains child tables", async () => {
			const { orgId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "WH Owner",
					email: "wh@example.com",
					image: "x",
					externalId: "user_wh",
				});
				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_wh",
					name: "WH Org",
					ownerUserId: userId,
				});
				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});
				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "WH Client",
					status: "active",
				});
				const client = await ctx.db.get(clientId);
				await AggregateHelpers.addClient(ctx, client!);
				await ctx.db.insert("tasks", {
					orgId,
					title: "WH task",
					date: Date.now(),
					status: "pending",
				});
				return { orgId };
			});

			await t.mutation(internal.organizations.deleteFromClerk, {
				clerkOrganizationId: "org_wh",
			});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const result = await t.run(async (ctx) => {
				const org = await ctx.db.get(orgId);
				const clients = await ctx.db.query("clients").collect();
				const tasks = await ctx.db.query("tasks").collect();
				return {
					orgIsNull: org === null,
					clientCount: clients.filter((c) => c.orgId === orgId).length,
					taskCount: tasks.filter((tk) => tk.orgId === orgId).length,
				};
			});

			expect(result.orgIsNull).toBe(true);
			expect(result.clientCount).toBe(0);
			expect(result.taskCount).toBe(0);
		});
	});

	describe("schema-coverage guard", () => {
		it("ORG_SCOPED_CASCADE_TABLES covers every org-scoped table in schema.ts (minus org + memberships)", () => {
			const schemaText = readFileSync(
				join(__dirname, "schema.ts"),
				"utf8"
			);

			// Parse table names that declare orgId: v.id("organizations").
			const orgScoped = new Set<string>();
			const tableRegex = /(\w+):\s*defineTable\(\{/g;
			let match: RegExpExecArray | null;
			const matches: { name: string; start: number }[] = [];
			while ((match = tableRegex.exec(schemaText)) !== null) {
				matches.push({ name: match[1], start: match.index });
			}
			for (let i = 0; i < matches.length; i++) {
				const start = matches[i].start;
				const end =
					i + 1 < matches.length ? matches[i + 1].start : schemaText.length;
				const block = schemaText.slice(start, end);
				if (/orgId:\s*v\.id\(\s*["']organizations["']\s*\)/.test(block)) {
					orgScoped.add(matches[i].name);
				}
			}

			// The entry point handles these synchronously; not drained by the page.
			orgScoped.delete("organizations");
			orgScoped.delete("organizationMemberships");

			const covered = new Set<string>(ORG_SCOPED_CASCADE_TABLES);
			const missing = [...orgScoped].filter((t) => !covered.has(t));

			expect(missing).toEqual([]);
		});
	});
});
