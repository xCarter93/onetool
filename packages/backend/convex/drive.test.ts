import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
	addMemberToOrg,
	createTestClient,
	createTestIdentity,
	createTestInvoice,
	createTestOrg,
	createTestProject,
	createTestQuote,
} from "./test.helpers";

/**
 * Virtual Clients tree (drive.ts).
 *
 * `documents` rows are inserted with raw t.run here: the table is untriggered
 * (no searchText / aggregate), and no public API can create the BoldSign
 * signed-version fixtures these tests need.
 */
describe("drive", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function storeBlob(content: string): Promise<Id<"_storage">> {
		return await t.run(async (ctx) => ctx.storage.store(new Blob([content])));
	}

	async function insertGeneratedDoc(fields: {
		orgId: Id<"organizations">;
		documentType: "quote" | "invoice";
		documentId: string;
		version: number;
		generatedAt?: number;
		signed?: boolean;
	}): Promise<Id<"documents">> {
		const storageId = await storeBlob(`pdf-v${fields.version}`);
		const signedStorageId = fields.signed
			? await storeBlob(`signed-pdf-v${fields.version}`)
			: undefined;

		return await t.run(async (ctx) =>
			ctx.db.insert("documents", {
				orgId: fields.orgId,
				documentType: fields.documentType,
				documentId: fields.documentId,
				storageId,
				signedStorageId,
				generatedAt: fields.generatedAt ?? 1000 * fields.version,
				version: fields.version,
				boldsign: fields.signed
					? {
							documentId: `bs_${fields.documentId}_${fields.version}`,
							status: "Completed" as const,
							sentTo: [],
							completedAt: 5000,
						}
					: undefined,
			})
		);
	}

	async function grantDocumentsView(
		orgId: Id<"organizations">,
		userId: Id<"users">
	) {
		await t.run(async (ctx: { db: MutationCtx["db"] }) => {
			const membership = await ctx.db
				.query("organizationMemberships")
				.withIndex("by_org_user", (q) =>
					q.eq("orgId", orgId).eq("userId", userId)
				)
				.unique();
			if (!membership) throw new Error("membership not found");
			// No allRecords → derived scope from assigned projects.
			await ctx.db.patch(membership._id, {
				permissions: { documents: { level: "view" } },
			});
		});
	}

	describe("listClientsTree", () => {
		it("organizes client + project attachments with reference lists", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run((ctx) =>
				createTestOrg(ctx)
			);
			const { clientA, clientB, projectId } = await t.run(async (ctx) => {
				const clientA = await createTestClient(ctx, orgId, {
					companyName: "Acme Co",
				});
				const clientB = await createTestClient(ctx, orgId, {
					companyName: "Unreferenced Co",
				});
				const projectId = await createTestProject(ctx, orgId, clientA, {
					title: "Spring Cleanup",
				});
				return { clientA, clientB, projectId };
			});

			const asUser = t.withIdentity(
				createTestIdentity(clerkUserId, clerkOrgId)
			);

			await asUser.mutation(api.clientDocuments.create, {
				clientId: clientA,
				name: "Contract.pdf",
				fileName: "Contract.pdf",
				fileSize: 1024,
				mimeType: "application/pdf",
				storageId: await storeBlob("client attachment"),
			});
			await asUser.mutation(api.projectDocuments.create, {
				projectId,
				name: "Site Photos.pdf",
				fileName: "Site Photos.pdf",
				fileSize: 2048,
				mimeType: "application/pdf",
				storageId: await storeBlob("project attachment"),
			});

			const tree = await asUser.query(api.drive.listClientsTree, {});
			expect(tree).not.toBeNull();

			expect(tree!.clientDocs).toHaveLength(1);
			expect(tree!.clientDocs[0]).toMatchObject({
				clientId: clientA,
				name: "Contract.pdf",
				fileName: "Contract.pdf",
				fileSize: 1024,
				mimeType: "application/pdf",
				uploaderName: "Test User",
			});

			expect(tree!.projectDocs).toHaveLength(1);
			expect(tree!.projectDocs[0]).toMatchObject({
				projectId,
				name: "Site Photos.pdf",
				uploaderName: "Test User",
			});

			expect(tree!.projects).toEqual([
				{ _id: projectId, name: "Spring Cleanup", clientId: clientA },
			]);
			// clientB is referenced by nothing, so it must not appear.
			expect(tree!.clients).toEqual([{ _id: clientA, name: "Acme Co" }]);
			expect(tree!.clients.map((c) => c._id)).not.toContain(clientB);
			expect(tree!.generatedDocs).toHaveLength(0);
		});

		it("prefers the signed version and falls back to the max version", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run((ctx) =>
				createTestOrg(ctx)
			);
			const { clientId, projectId, quoteId, invoiceId } = await t.run(
				async (ctx) => {
					const clientId = await createTestClient(ctx, orgId);
					const projectId = await createTestProject(ctx, orgId, clientId);
					const quoteId = await createTestQuote(ctx, orgId, clientId, {
						projectId,
						quoteNumber: "Q-000042",
					});
					const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
						projectId,
						invoiceNumber: "INV-000007",
					});
					return { clientId, projectId, quoteId, invoiceId };
				}
			);

			await insertGeneratedDoc({
				orgId,
				documentType: "quote",
				documentId: quoteId,
				version: 1,
			});
			const signedQuoteDocId = await insertGeneratedDoc({
				orgId,
				documentType: "quote",
				documentId: quoteId,
				version: 2,
				signed: true,
			});
			// Newest version, but unsigned — the signed v2 must still win.
			await insertGeneratedDoc({
				orgId,
				documentType: "quote",
				documentId: quoteId,
				version: 3,
			});

			await insertGeneratedDoc({
				orgId,
				documentType: "invoice",
				documentId: invoiceId,
				version: 1,
			});
			const latestInvoiceDocId = await insertGeneratedDoc({
				orgId,
				documentType: "invoice",
				documentId: invoiceId,
				version: 2,
			});

			const asUser = t.withIdentity(
				createTestIdentity(clerkUserId, clerkOrgId)
			);
			const tree = await asUser.query(api.drive.listClientsTree, {});

			expect(tree!.generatedDocs).toHaveLength(2);

			const quoteRow = tree!.generatedDocs.find(
				(d) => d.documentType === "quote"
			)!;
			expect(quoteRow._id).toBe(signedQuoteDocId);
			expect(quoteRow.signed).toBe(true);
			expect(quoteRow.name).toBe("Quote Q-000042 (Signed).pdf");
			expect(quoteRow.clientId).toBe(clientId);
			expect(quoteRow.projectId).toBe(projectId);
			expect(typeof quoteRow.fileSize).toBe("number");

			const invoiceRow = tree!.generatedDocs.find(
				(d) => d.documentType === "invoice"
			)!;
			expect(invoiceRow._id).toBe(latestInvoiceDocId);
			expect(invoiceRow.signed).toBe(false);
			expect(invoiceRow.name).toBe("Invoice INV-000007.pdf");

			// The referenced project + its client are both resolved.
			expect(tree!.projects).toEqual([
				{ _id: projectId, name: "Test Project", clientId },
			]);
			expect(tree!.clients).toHaveLength(1);
		});

		it("keeps a project-less quote at the client level", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run((ctx) =>
				createTestOrg(ctx)
			);
			const { clientId, quoteId } = await t.run(async (ctx) => {
				const clientId = await createTestClient(ctx, orgId);
				const quoteId = await createTestQuote(ctx, orgId, clientId, {
					quoteNumber: "Q-000001",
				});
				return { clientId, quoteId };
			});

			await insertGeneratedDoc({
				orgId,
				documentType: "quote",
				documentId: quoteId,
				version: 1,
			});

			const asUser = t.withIdentity(
				createTestIdentity(clerkUserId, clerkOrgId)
			);
			const tree = await asUser.query(api.drive.listClientsTree, {});

			expect(tree!.generatedDocs).toHaveLength(1);
			expect(tree!.generatedDocs[0].clientId).toBe(clientId);
			expect(tree!.generatedDocs[0].projectId).toBeUndefined();
			expect(tree!.generatedDocs[0].name).toBe("Quote Q-000001.pdf");
			expect(tree!.projects).toHaveLength(0);
			expect(tree!.clients).toHaveLength(1);
		});

		it("restricts a scoped member to their assigned projects and clients", async () => {
			const { orgId, userId, clerkOrgId } = await t.run((ctx) =>
				createTestOrg(ctx, {
					clerkUserId: "owner_scope",
					clerkOrgId: "org_scope",
				})
			);
			const member = await t.run((ctx) =>
				addMemberToOrg(ctx, orgId, { clerkUserId: "member_scope" })
			);
			await grantDocumentsView(orgId, member.userId);

			const { clientA, clientB, projectA, projectB, quoteB } = await t.run(
				async (ctx) => {
					const clientA = await createTestClient(ctx, orgId, {
						companyName: "In Scope Co",
					});
					const clientB = await createTestClient(ctx, orgId, {
						companyName: "Out Of Scope Co",
					});
					const projectA = await createTestProject(ctx, orgId, clientA, {
						title: "Assigned",
					});
					const projectB = await createTestProject(ctx, orgId, clientB, {
						title: "Unassigned",
					});
					await ctx.db.patch(projectA, { assignedUserIds: [member.userId] });
					const quoteB = await createTestQuote(ctx, orgId, clientB, {
						quoteNumber: "Q-000099",
					});
					return { clientA, clientB, projectA, projectB, quoteB };
				}
			);

			await insertGeneratedDoc({
				orgId,
				documentType: "quote",
				documentId: quoteB,
				version: 1,
			});

			// Attachments on both the in-scope and out-of-scope records.
			await t.run(async (ctx) => {
				for (const [clientId, name] of [
					[clientA, "A.pdf"],
					[clientB, "B.pdf"],
				] as const) {
					await ctx.db.insert("clientDocuments", {
						orgId,
						clientId,
						name,
						fileName: name,
						fileSize: 10,
						mimeType: "application/pdf",
						storageId: await ctx.storage.store(new Blob([name])),
						uploadedAt: 1,
						uploadedBy: userId,
					});
				}
				for (const [projectId, name] of [
					[projectA, "PA.pdf"],
					[projectB, "PB.pdf"],
				] as const) {
					await ctx.db.insert("projectDocuments", {
						orgId,
						projectId,
						name,
						fileName: name,
						fileSize: 10,
						mimeType: "application/pdf",
						storageId: await ctx.storage.store(new Blob([name])),
						uploadedAt: 1,
						uploadedBy: userId,
					});
				}
			});

			const asMember = t.withIdentity(
				createTestIdentity(member.clerkUserId, clerkOrgId)
			);
			const tree = await asMember.query(api.drive.listClientsTree, {});

			expect(tree!.clientDocs.map((d) => d.name)).toEqual(["A.pdf"]);
			expect(tree!.projectDocs.map((d) => d.name)).toEqual(["PA.pdf"]);
			// quoteB hangs off the out-of-scope client.
			expect(tree!.generatedDocs).toHaveLength(0);
			expect(tree!.projects.map((p) => p._id)).toEqual([projectA]);
			expect(tree!.clients.map((c) => c._id)).toEqual([clientA]);
			expect(tree!.clients.map((c) => c._id)).not.toContain(clientB);
		});

		it("caps each bucket at the limit and reports hasMore", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run((ctx) =>
				createTestOrg(ctx)
			);
			const quoteIds = await t.run(async (ctx) => {
				const clientId = await createTestClient(ctx, orgId);
				return await Promise.all(
					[1, 2, 3].map((n) =>
						createTestQuote(ctx, orgId, clientId, {
							quoteNumber: `Q-00000${n}`,
						})
					)
				);
			});

			for (const [index, quoteId] of quoteIds.entries()) {
				await insertGeneratedDoc({
					orgId,
					documentType: "quote",
					documentId: quoteId,
					version: index + 1,
				});
			}

			const asUser = t.withIdentity(
				createTestIdentity(clerkUserId, clerkOrgId)
			);

			const capped = await asUser.query(api.drive.listClientsTree, {
				limit: 2,
			});
			// Newest generatedAt first, so the oldest quote falls off the page.
			expect(capped!.generatedDocs.map((d) => d.name)).toEqual([
				"Quote Q-000003.pdf",
				"Quote Q-000002.pdf",
			]);
			expect(capped!.hasMore).toBe(true);

			const full = await asUser.query(api.drive.listClientsTree, {});
			expect(full!.generatedDocs).toHaveLength(3);
			expect(full!.hasMore).toBe(false);
		});

		it("pages attachments by uploadedAt, not insertion order", async () => {
			const { orgId, userId, clerkUserId, clerkOrgId } = await t.run((ctx) =>
				createTestOrg(ctx)
			);
			const clientId = await t.run((ctx) => createTestClient(ctx, orgId));

			// Inserted newest-first, so creation order is the reverse of uploadedAt.
			await t.run(async (ctx) => {
				for (const [name, uploadedAt] of [
					["Newest.pdf", 30],
					["Middle.pdf", 20],
					["Oldest.pdf", 10],
				] as const) {
					await ctx.db.insert("clientDocuments", {
						orgId,
						clientId,
						name,
						fileName: name,
						fileSize: 10,
						mimeType: "application/pdf",
						storageId: await ctx.storage.store(new Blob([name])),
						uploadedAt,
						uploadedBy: userId,
					});
				}
			});

			const asUser = t.withIdentity(
				createTestIdentity(clerkUserId, clerkOrgId)
			);
			const tree = await asUser.query(api.drive.listClientsTree, { limit: 2 });

			expect(tree!.clientDocs.map((d) => d.name)).toEqual([
				"Newest.pdf",
				"Middle.pdf",
			]);
			expect(tree!.hasMore).toBe(true);
		});

		it("never pages a scoped member past their own attachments", async () => {
			const { orgId, userId, clerkOrgId } = await t.run((ctx) =>
				createTestOrg(ctx, {
					clerkUserId: "owner_page",
					clerkOrgId: "org_page",
				})
			);
			const member = await t.run((ctx) =>
				addMemberToOrg(ctx, orgId, { clerkUserId: "member_page" })
			);
			await grantDocumentsView(orgId, member.userId);

			const { clientA, clientB } = await t.run(async (ctx) => {
				const clientA = await createTestClient(ctx, orgId, {
					companyName: "In Scope Co",
				});
				const clientB = await createTestClient(ctx, orgId, {
					companyName: "Out Of Scope Co",
				});
				const projectA = await createTestProject(ctx, orgId, clientA);
				await ctx.db.patch(projectA, { assignedUserIds: [member.userId] });
				return { clientA, clientB };
			});

			// The member's only file is the oldest row in the org: a bounded page
			// of newer out-of-scope rows would hide it entirely.
			await t.run(async (ctx) => {
				const insert = async (clientId: typeof clientA, name: string) => {
					await ctx.db.insert("clientDocuments", {
						orgId,
						clientId,
						name,
						fileName: name,
						fileSize: 10,
						mimeType: "application/pdf",
						storageId: await ctx.storage.store(new Blob([name])),
						uploadedAt: 1,
						uploadedBy: userId,
					});
				};
				await insert(clientA, "Mine.pdf");
				await insert(clientB, "Newer1.pdf");
				await insert(clientB, "Newer2.pdf");
			});

			const asMember = t.withIdentity(
				createTestIdentity(member.clerkUserId, clerkOrgId)
			);
			const tree = await asMember.query(api.drive.listClientsTree, {
				limit: 1,
			});

			expect(tree!.clientDocs.map((d) => d.name)).toEqual(["Mine.pdf"]);
			expect(tree!.hasMore).toBe(false);
		});
	});

	describe("rename", () => {
		it("renames a client document and rejects an empty name", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run((ctx) =>
				createTestOrg(ctx)
			);
			const clientId = await t.run((ctx) => createTestClient(ctx, orgId));
			const asUser = t.withIdentity(
				createTestIdentity(clerkUserId, clerkOrgId)
			);

			const docId = await asUser.mutation(api.clientDocuments.create, {
				clientId,
				name: "Old.pdf",
				fileName: "Old.pdf",
				fileSize: 10,
				mimeType: "application/pdf",
				storageId: await storeBlob("x"),
			});

			await asUser.mutation(api.clientDocuments.update, {
				id: docId,
				name: "  New Name.pdf  ",
			});

			const docs = await asUser.query(api.clientDocuments.listByClient, {
				clientId,
			});
			expect(docs[0].name).toBe("New Name.pdf");
			// Rename touches the display name only.
			expect(docs[0].fileName).toBe("Old.pdf");

			await expect(
				asUser.mutation(api.clientDocuments.update, { id: docId, name: "   " })
			).rejects.toThrow("Document name is required");
		});

		it("renames a project document and rejects an empty name", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run((ctx) =>
				createTestOrg(ctx)
			);
			const projectId = await t.run(async (ctx) => {
				const clientId = await createTestClient(ctx, orgId);
				return await createTestProject(ctx, orgId, clientId);
			});
			const asUser = t.withIdentity(
				createTestIdentity(clerkUserId, clerkOrgId)
			);

			const docId = await asUser.mutation(api.projectDocuments.create, {
				projectId,
				name: "Old.pdf",
				fileName: "Old.pdf",
				fileSize: 10,
				mimeType: "application/pdf",
				storageId: await storeBlob("x"),
			});

			await asUser.mutation(api.projectDocuments.update, {
				id: docId,
				name: "Renamed.pdf",
			});

			const docs = await asUser.query(api.projectDocuments.listByProject, {
				projectId,
			});
			expect(docs[0].name).toBe("Renamed.pdf");

			await expect(
				asUser.mutation(api.projectDocuments.update, { id: docId, name: "" })
			).rejects.toThrow("Document name is required");
		});
	});

	describe("getFileUrls", () => {
		it("resolves in-scope files and nulls out unknown or out-of-scope ids", async () => {
			const { orgId, userId, clerkUserId, clerkOrgId } = await t.run((ctx) =>
				createTestOrg(ctx, {
					clerkUserId: "owner_urls",
					clerkOrgId: "org_urls",
				})
			);
			const member = await t.run((ctx) =>
				addMemberToOrg(ctx, orgId, { clerkUserId: "member_urls" })
			);
			await grantDocumentsView(orgId, member.userId);

			const { clientA, clientB, quoteId, projectDocId } = await t.run(
				async (ctx) => {
					const clientA = await createTestClient(ctx, orgId);
					const clientB = await createTestClient(ctx, orgId);
					const projectA = await createTestProject(ctx, orgId, clientA);
					await ctx.db.patch(projectA, { assignedUserIds: [member.userId] });
					const quoteId = await createTestQuote(ctx, orgId, clientB);
					const projectDocId = await ctx.db.insert("projectDocuments", {
						orgId,
						projectId: projectA,
						name: "PA.pdf",
						fileName: "PA.pdf",
						fileSize: 10,
						mimeType: "application/pdf",
						storageId: await ctx.storage.store(new Blob(["PA"])),
						uploadedAt: 1,
						uploadedBy: userId,
					});
					return { clientA, clientB, quoteId, projectDocId };
				}
			);

			const generatedId = await insertGeneratedDoc({
				orgId,
				documentType: "quote",
				documentId: quoteId,
				version: 1,
				signed: true,
			});

			const [inScopeDoc, outOfScopeDoc] = await t.run(async (ctx) => {
				const mk = async (clientId: Id<"clients">, name: string) =>
					ctx.db.insert("clientDocuments", {
						orgId,
						clientId,
						name,
						fileName: name,
						fileSize: 10,
						mimeType: "application/pdf",
						storageId: await ctx.storage.store(new Blob([name])),
						uploadedAt: 1,
						uploadedBy: userId,
					});
				return [await mk(clientA, "A.pdf"), await mk(clientB, "B.pdf")];
			});

			const asOwner = t.withIdentity(
				createTestIdentity(clerkUserId, clerkOrgId)
			);
			const ownerUrls = await asOwner.query(api.drive.getFileUrls, {
				files: [
					{ kind: "client", id: inScopeDoc },
					{ kind: "generated", id: generatedId },
					{ kind: "client", id: "not-a-real-id" },
				],
			});
			expect(ownerUrls[0].url).toBeTruthy();
			expect(ownerUrls[1].url).toBeTruthy();
			expect(ownerUrls[2]).toEqual({ id: "not-a-real-id", url: null });

			const asMember = t.withIdentity(
				createTestIdentity(member.clerkUserId, clerkOrgId)
			);
			const memberUrls = await asMember.query(api.drive.getFileUrls, {
				files: [
					{ kind: "client", id: inScopeDoc },
					{ kind: "client", id: outOfScopeDoc },
					{ kind: "generated", id: generatedId },
					{ kind: "project", id: projectDocId },
				],
			});
			expect(memberUrls[0].url).toBeTruthy();
			expect(memberUrls[1].url).toBeNull();
			expect(memberUrls[2].url).toBeNull();
			expect(memberUrls[3].url).toBeTruthy();
		});
	});
});
