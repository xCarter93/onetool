import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { Id } from "./_generated/dataModel";
import {
	createTestOrg,
	createTestClient,
	createTestIdentity,
} from "./test.helpers";

describe("ClientDocuments", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	describe("create", () => {
		it("should create a document with valid data", async () => {
			const { userId, orgId, clerkUserId, clerkOrgId } = await t.run(
				async (ctx) => {
					return await createTestOrg(ctx);
				}
			);

			const clientId = await t.run(async (ctx) => {
				return await createTestClient(ctx, orgId);
			});

			const asUser = t.withIdentity(
				createTestIdentity(clerkUserId, clerkOrgId)
			);

			// Generate upload URL and simulate file upload
			const storageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob(["test content"]));
			});

			const docId = await asUser.mutation(api.clientDocuments.create, {
				clientId,
				name: "Contract.pdf",
				fileName: "Contract.pdf",
				fileSize: 1024,
				mimeType: "application/pdf",
				storageId,
			});

			expect(docId).toBeDefined();

			const docs = await asUser.query(api.clientDocuments.listByClient, {
				clientId,
			});
			expect(docs).toHaveLength(1);
			expect(docs[0]).toMatchObject({
				name: "Contract.pdf",
				fileName: "Contract.pdf",
				fileSize: 1024,
				mimeType: "application/pdf",
			});
			expect(docs[0].downloadUrl).toBeTruthy();
		});

		it("should fail with client from different org", async () => {
			// Create org A
			const orgA = await t.run(async (ctx) => {
				return await createTestOrg(ctx, {
					clerkUserId: "user_a",
					clerkOrgId: "org_a",
				});
			});

			// Create org B with its own client
			const { clientId: clientB } = await t.run(async (ctx) => {
				const orgB = await createTestOrg(ctx, {
					clerkUserId: "user_b",
					clerkOrgId: "org_b",
					userName: "User B",
					userEmail: "b@example.com",
					orgName: "Org B",
				});
				const clientId = await createTestClient(ctx, orgB.orgId);
				return { clientId };
			});

			const asUserA = t.withIdentity(
				createTestIdentity("user_a", "org_a")
			);

			const storageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob(["test"]));
			});

			await expect(
				asUserA.mutation(api.clientDocuments.create, {
					clientId: clientB,
					name: "File.pdf",
					fileName: "File.pdf",
					fileSize: 512,
					mimeType: "application/pdf",
					storageId,
				})
			).rejects.toThrow("Client does not belong to your organization");
		});

		it("should fail with invalid file metadata", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(
				async (ctx) => {
					return await createTestOrg(ctx);
				}
			);

			const clientId = await t.run(async (ctx) => {
				return await createTestClient(ctx, orgId);
			});

			const asUser = t.withIdentity(
				createTestIdentity(clerkUserId, clerkOrgId)
			);

			const storageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob(["test"]));
			});

			// Invalid MIME type
			await expect(
				asUser.mutation(api.clientDocuments.create, {
					clientId,
					name: "virus.exe",
					fileName: "virus.exe",
					fileSize: 512,
					mimeType: "application/x-executable",
					storageId,
				})
			).rejects.toThrow("not allowed");

			// Zero file size
			await expect(
				asUser.mutation(api.clientDocuments.create, {
					clientId,
					name: "empty.pdf",
					fileName: "empty.pdf",
					fileSize: 0,
					mimeType: "application/pdf",
					storageId,
				})
			).rejects.toThrow("greater than 0");
		});
	});

	describe("listByClient", () => {
		it("should return only same-org documents", async () => {
			const orgA = await t.run(async (ctx) => {
				return await createTestOrg(ctx, {
					clerkUserId: "user_a",
					clerkOrgId: "org_a",
				});
			});

			const clientA = await t.run(async (ctx) => {
				return await createTestClient(ctx, orgA.orgId);
			});

			// Create a doc in org A
			const asUserA = t.withIdentity(
				createTestIdentity("user_a", "org_a")
			);

			const storageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob(["content"]));
			});

			await asUserA.mutation(api.clientDocuments.create, {
				clientId: clientA,
				name: "OrgA-Doc.pdf",
				fileName: "OrgA-Doc.pdf",
				fileSize: 100,
				mimeType: "application/pdf",
				storageId,
			});

			// Create org B and try to list org A's client documents
			await t.run(async (ctx) => {
				return await createTestOrg(ctx, {
					clerkUserId: "user_b",
					clerkOrgId: "org_b",
					userName: "User B",
					userEmail: "b@example.com",
					orgName: "Org B",
				});
			});

			const asUserB = t.withIdentity(
				createTestIdentity("user_b", "org_b")
			);

			const docsFromB = await asUserB.query(
				api.clientDocuments.listByClient,
				{ clientId: clientA }
			);
			expect(docsFromB).toHaveLength(0);

			// Org A should see its own docs
			const docsFromA = await asUserA.query(
				api.clientDocuments.listByClient,
				{ clientId: clientA }
			);
			expect(docsFromA).toHaveLength(1);
			expect(docsFromA[0].name).toBe("OrgA-Doc.pdf");
		});

		it("should return documents sorted newest first", async () => {
			const { userId, orgId, clerkUserId, clerkOrgId } = await t.run(
				async (ctx) => {
					return await createTestOrg(ctx);
				}
			);

			const clientId = await t.run(async (ctx) => {
				return await createTestClient(ctx, orgId);
			});

			// Insert docs directly with explicit timestamps to ensure ordering
			await t.run(async (ctx) => {
				const storageId1 = await ctx.storage.store(new Blob(["first"]));
				const storageId2 = await ctx.storage.store(new Blob(["second"]));

				await ctx.db.insert("clientDocuments", {
					orgId,
					clientId,
					name: "First.pdf",
					fileName: "First.pdf",
					fileSize: 100,
					mimeType: "application/pdf",
					storageId: storageId1,
					uploadedAt: 1000,
					uploadedBy: userId,
				});

				await ctx.db.insert("clientDocuments", {
					orgId,
					clientId,
					name: "Second.pdf",
					fileName: "Second.pdf",
					fileSize: 200,
					mimeType: "application/pdf",
					storageId: storageId2,
					uploadedAt: 2000,
					uploadedBy: userId,
				});
			});

			const asUser = t.withIdentity(
				createTestIdentity(clerkUserId, clerkOrgId)
			);

			const docs = await asUser.query(api.clientDocuments.listByClient, {
				clientId,
			});
			expect(docs).toHaveLength(2);
			// Most recent first
			expect(docs[0].name).toBe("Second.pdf");
			expect(docs[1].name).toBe("First.pdf");
		});
	});

	describe("remove", () => {
		it("should delete from storage and DB", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(
				async (ctx) => {
					return await createTestOrg(ctx);
				}
			);

			const clientId = await t.run(async (ctx) => {
				return await createTestClient(ctx, orgId);
			});

			const asUser = t.withIdentity(
				createTestIdentity(clerkUserId, clerkOrgId)
			);

			const storageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob(["test content"]));
			});

			const docId = await asUser.mutation(api.clientDocuments.create, {
				clientId,
				name: "ToDelete.pdf",
				fileName: "ToDelete.pdf",
				fileSize: 512,
				mimeType: "application/pdf",
				storageId,
			});

			// Verify it exists
			let docs = await asUser.query(api.clientDocuments.listByClient, {
				clientId,
			});
			expect(docs).toHaveLength(1);

			// Delete it
			await asUser.mutation(api.clientDocuments.remove, { id: docId });

			// Verify it's gone
			docs = await asUser.query(api.clientDocuments.listByClient, {
				clientId,
			});
			expect(docs).toHaveLength(0);
		});

		it("should not allow deleting documents from another org", async () => {
			// Create org A with a document
			const orgA = await t.run(async (ctx) => {
				return await createTestOrg(ctx, {
					clerkUserId: "user_a",
					clerkOrgId: "org_a",
				});
			});

			const clientA = await t.run(async (ctx) => {
				return await createTestClient(ctx, orgA.orgId);
			});

			const asUserA = t.withIdentity(
				createTestIdentity("user_a", "org_a")
			);

			const storageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob(["content"]));
			});

			const docId = await asUserA.mutation(api.clientDocuments.create, {
				clientId: clientA,
				name: "Secret.pdf",
				fileName: "Secret.pdf",
				fileSize: 100,
				mimeType: "application/pdf",
				storageId,
			});

			// Create org B and try to delete org A's document
			await t.run(async (ctx) => {
				return await createTestOrg(ctx, {
					clerkUserId: "user_b",
					clerkOrgId: "org_b",
					userName: "User B",
					userEmail: "b@example.com",
					orgName: "Org B",
				});
			});

			const asUserB = t.withIdentity(
				createTestIdentity("user_b", "org_b")
			);

			await expect(
				asUserB.mutation(api.clientDocuments.remove, { id: docId })
			).rejects.toThrow();
		});
	});
});
