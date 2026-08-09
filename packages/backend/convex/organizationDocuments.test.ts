import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { Id } from "./_generated/dataModel";
import { createTestOrg, createTestIdentity } from "./test.helpers";

/**
 * Organization documents + folders (drive explorer).
 *
 * convex-test's `ctx.storage.store()` writes only `size`/`sha256` into the
 * `_storage` system row, so tests patch `contentType` in a `t.run` block to
 * simulate what the real backend records from the upload's Content-Type header.
 */

type T = ReturnType<typeof convexTest>;

async function storeBlob(
	t: T,
	opts: { contentType?: string; bytes?: number } = {}
): Promise<Id<"_storage">> {
	const size = opts.bytes ?? 12;
	const storageId = await t.run(async (ctx) => {
		return await ctx.storage.store(new Blob([new Uint8Array(size)]));
	});
	if (opts.contentType !== undefined) {
		await t.run(async (ctx) => {
			await ctx.db.patch(storageId as unknown as Id<"organizationDocuments">, {
				contentType: opts.contentType,
			} as never);
		});
	}
	return storageId;
}

describe("Organization documents", () => {
	let t: T;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function setup() {
		const org = await t.run(async (ctx) => await createTestOrg(ctx));
		const asUser = t.withIdentity(
			createTestIdentity(org.clerkUserId, org.clerkOrgId)
		);
		return { org, asUser };
	}

	async function createDoc(
		asUser: ReturnType<T["withIdentity"]>,
		name: string,
		opts: {
			folderId?: Id<"organizationDocumentFolders">;
			contentType?: string;
			bytes?: number;
		} = {}
	) {
		const storageId = await storeBlob(t, {
			contentType: opts.contentType ?? "application/pdf",
			bytes: opts.bytes,
		});
		return await asUser.mutation(api.organizationDocuments.create, {
			name,
			storageId,
			folderId: opts.folderId,
		});
	}

	describe("create validation", () => {
		it("persists size and mimeType from storage metadata", async () => {
			const { asUser } = await setup();
			const docId = await createDoc(asUser, "Contract.pdf", { bytes: 2048 });

			const doc = await asUser.query(api.organizationDocuments.get, {
				id: docId,
			});
			expect(doc).toMatchObject({
				name: "Contract.pdf",
				fileSize: 2048,
				mimeType: "application/pdf",
			});
			expect(doc?.folderId).toBeUndefined();
		});

		it("rejects a file over the 25MB ceiling", async () => {
			const { asUser } = await setup();
			const storageId = await storeBlob(t, {
				contentType: "application/pdf",
				bytes: 25 * 1024 * 1024 + 1,
			});

			await expect(
				asUser.mutation(api.organizationDocuments.create, {
					name: "Huge.pdf",
					storageId,
				})
			).rejects.toThrow(/too large/i);

			expect(await asUser.query(api.organizationDocuments.list, {})).toHaveLength(
				0
			);
		});

		it("rejects a disallowed content type", async () => {
			const { asUser } = await setup();
			const storageId = await storeBlob(t, {
				contentType: "application/x-msdownload",
			});

			await expect(
				asUser.mutation(api.organizationDocuments.create, {
					name: "virus.exe",
					storageId,
				})
			).rejects.toThrow(/Unsupported file type/i);

			expect(await asUser.query(api.organizationDocuments.list, {})).toHaveLength(
				0
			);
		});

		it("rejects an upload with no content type at all", async () => {
			const { asUser } = await setup();
			const storageId = await storeBlob(t);

			await expect(
				asUser.mutation(api.organizationDocuments.create, {
					name: "mystery",
					storageId,
				})
			).rejects.toThrow(/Unsupported file type/i);
		});

		it("accepts images and Office documents", async () => {
			const { asUser } = await setup();
			await createDoc(asUser, "logo.png", { contentType: "image/png" });
			await createDoc(asUser, "sheet.xlsx", {
				contentType:
					"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			});

			const docs = await asUser.query(api.organizationDocuments.list, {});
			expect(docs).toHaveLength(2);
		});

		it("rejects a folder from another organization", async () => {
			const { asUser } = await setup();
			const orgB = await t.run(
				async (ctx) =>
					await createTestOrg(ctx, {
						clerkUserId: "user_b",
						clerkOrgId: "org_b",
						userEmail: "b@example.com",
					})
			);
			const asUserB = t.withIdentity(
				createTestIdentity(orgB.clerkUserId, orgB.clerkOrgId)
			);
			const folderB = await asUserB.mutation(
				api.organizationDocumentFolders.create,
				{ name: "B folder" }
			);

			const storageId = await storeBlob(t, { contentType: "application/pdf" });
			await expect(
				asUser.mutation(api.organizationDocuments.create, {
					name: "Sneaky.pdf",
					storageId,
					folderId: folderB,
				})
			).rejects.toThrow(/does not belong to your organization/i);
		});
	});

	describe("list enrichment", () => {
		it("includes uploaderName and normalizes legacy mimeType", async () => {
			const { org, asUser } = await setup();
			await createDoc(asUser, "New.pdf");

			// Legacy row: no mimeType, no fileSize.
			await t.run(async (ctx) => {
				const storageId = await ctx.storage.store(new Blob(["legacy"]));
				await ctx.db.insert("organizationDocuments", {
					orgId: org.orgId,
					name: "Legacy.pdf",
					storageId,
					uploadedAt: Date.now() - 1000,
					uploadedBy: org.userId,
				});
			});

			const docs = await asUser.query(api.organizationDocuments.list, {});
			expect(docs).toHaveLength(2);
			for (const doc of docs) {
				expect(doc.mimeType).toBe("application/pdf");
				expect(doc.uploaderName).toBe("Test User");
			}

			const stats = await asUser.query(api.organizationDocuments.getStats, {});
			// Legacy row contributes 0, the created one its real size.
			expect(stats.totalSize).toBe(12);
			expect(stats.total).toBe(2);
		});
	});

	describe("bulkRemove", () => {
		it("deletes rows and blobs", async () => {
			const { asUser } = await setup();
			const a = await createDoc(asUser, "A.pdf");
			const b = await createDoc(asUser, "B.pdf");

			const result = await asUser.mutation(
				api.organizationDocuments.bulkRemove,
				{ ids: [a, b] }
			);
			expect(result.deleted).toBe(2);

			const docs = await asUser.query(api.organizationDocuments.list, {});
			expect(docs).toHaveLength(0);
		});

		it("rejects the whole batch when one id is cross-org", async () => {
			const { asUser } = await setup();
			const mine = await createDoc(asUser, "Mine.pdf");

			const orgB = await t.run(
				async (ctx) =>
					await createTestOrg(ctx, {
						clerkUserId: "user_b2",
						clerkOrgId: "org_b2",
						userEmail: "b2@example.com",
					})
			);
			const asUserB = t.withIdentity(
				createTestIdentity(orgB.clerkUserId, orgB.clerkOrgId)
			);
			const theirs = await createDoc(asUserB, "Theirs.pdf");

			await expect(
				asUser.mutation(api.organizationDocuments.bulkRemove, {
					ids: [mine, theirs],
				})
			).rejects.toThrow(/does not belong to your organization/i);

			const docs = await asUser.query(api.organizationDocuments.list, {});
			expect(docs).toHaveLength(1);
		});
	});

	describe("move documents", () => {
		it("moves documents into a folder and back to root", async () => {
			const { asUser } = await setup();
			const docId = await createDoc(asUser, "A.pdf");
			const folderId = await asUser.mutation(
				api.organizationDocumentFolders.create,
				{ name: "Contracts" }
			);

			await asUser.mutation(api.organizationDocuments.move, {
				ids: [docId],
				folderId,
			});
			let doc = await asUser.query(api.organizationDocuments.get, { id: docId });
			expect(doc?.folderId).toBe(folderId);

			await asUser.mutation(api.organizationDocuments.move, { ids: [docId] });
			doc = await asUser.query(api.organizationDocuments.get, { id: docId });
			expect(doc?.folderId).toBeUndefined();
		});

		it("rejects a target folder from another organization", async () => {
			const { asUser } = await setup();
			const docId = await createDoc(asUser, "A.pdf");

			const orgB = await t.run(
				async (ctx) =>
					await createTestOrg(ctx, {
						clerkUserId: "user_b3",
						clerkOrgId: "org_b3",
						userEmail: "b3@example.com",
					})
			);
			const asUserB = t.withIdentity(
				createTestIdentity(orgB.clerkUserId, orgB.clerkOrgId)
			);
			const folderB = await asUserB.mutation(
				api.organizationDocumentFolders.create,
				{ name: "B" }
			);

			await expect(
				asUser.mutation(api.organizationDocuments.move, {
					ids: [docId],
					folderId: folderB,
				})
			).rejects.toThrow(/does not belong to your organization/i);
		});
	});
});

describe("Organization document folders", () => {
	let t: T;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function setup() {
		const org = await t.run(async (ctx) => await createTestOrg(ctx));
		const asUser = t.withIdentity(
			createTestIdentity(org.clerkUserId, org.clerkOrgId)
		);
		return { org, asUser };
	}

	it("creates, lists, and renames folders", async () => {
		const { asUser } = await setup();
		const rootId = await asUser.mutation(
			api.organizationDocumentFolders.create,
			{ name: "  Root  " }
		);
		await asUser.mutation(api.organizationDocumentFolders.create, {
			name: "Child",
			parentId: rootId,
		});

		let folders = await asUser.query(api.organizationDocumentFolders.list, {});
		expect(folders.map((f) => f.name).sort()).toEqual(["Child", "Root"]);
		expect(folders.find((f) => f.name === "Child")?.parentId).toBe(rootId);

		await asUser.mutation(api.organizationDocumentFolders.rename, {
			id: rootId,
			name: "Renamed",
		});
		folders = await asUser.query(api.organizationDocumentFolders.list, {});
		expect(folders.find((f) => f._id === rootId)?.name).toBe("Renamed");
	});

	it("rejects blank names", async () => {
		const { asUser } = await setup();
		await expect(
			asUser.mutation(api.organizationDocumentFolders.create, { name: "   " })
		).rejects.toThrow(/name is required/i);
	});

	it("rejects a parent folder from another organization", async () => {
		const { asUser } = await setup();
		const orgB = await t.run(
			async (ctx) =>
				await createTestOrg(ctx, {
					clerkUserId: "user_bf",
					clerkOrgId: "org_bf",
					userEmail: "bf@example.com",
				})
		);
		const asUserB = t.withIdentity(
			createTestIdentity(orgB.clerkUserId, orgB.clerkOrgId)
		);
		const folderB = await asUserB.mutation(
			api.organizationDocumentFolders.create,
			{ name: "B" }
		);

		await expect(
			asUser.mutation(api.organizationDocumentFolders.create, {
				name: "Mine",
				parentId: folderB,
			})
		).rejects.toThrow(/does not belong to your organization/i);
	});

	describe("move", () => {
		it("moves a folder under a new parent and back to root", async () => {
			const { asUser } = await setup();
			const a = await asUser.mutation(api.organizationDocumentFolders.create, {
				name: "A",
			});
			const b = await asUser.mutation(api.organizationDocumentFolders.create, {
				name: "B",
			});

			await asUser.mutation(api.organizationDocumentFolders.move, {
				id: b,
				parentId: a,
			});
			let folders = await asUser.query(api.organizationDocumentFolders.list, {});
			expect(folders.find((f) => f._id === b)?.parentId).toBe(a);

			await asUser.mutation(api.organizationDocumentFolders.move, { id: b });
			folders = await asUser.query(api.organizationDocumentFolders.list, {});
			expect(folders.find((f) => f._id === b)?.parentId).toBeUndefined();
		});

		it("rejects moving a folder into itself", async () => {
			const { asUser } = await setup();
			const a = await asUser.mutation(api.organizationDocumentFolders.create, {
				name: "A",
			});
			await expect(
				asUser.mutation(api.organizationDocumentFolders.move, {
					id: a,
					parentId: a,
				})
			).rejects.toThrow(/into itself/i);
		});

		it("rejects moving a folder into its own descendant", async () => {
			const { asUser } = await setup();
			const a = await asUser.mutation(api.organizationDocumentFolders.create, {
				name: "A",
			});
			const b = await asUser.mutation(api.organizationDocumentFolders.create, {
				name: "B",
				parentId: a,
			});
			const c = await asUser.mutation(api.organizationDocumentFolders.create, {
				name: "C",
				parentId: b,
			});

			await expect(
				asUser.mutation(api.organizationDocumentFolders.move, {
					id: a,
					parentId: c,
				})
			).rejects.toThrow(/own subtree/i);
		});

		it("rejects a cross-org target parent", async () => {
			const { asUser } = await setup();
			const a = await asUser.mutation(api.organizationDocumentFolders.create, {
				name: "A",
			});
			const orgB = await t.run(
				async (ctx) =>
					await createTestOrg(ctx, {
						clerkUserId: "user_bm",
						clerkOrgId: "org_bm",
						userEmail: "bm@example.com",
					})
			);
			const asUserB = t.withIdentity(
				createTestIdentity(orgB.clerkUserId, orgB.clerkOrgId)
			);
			const folderB = await asUserB.mutation(
				api.organizationDocumentFolders.create,
				{ name: "B" }
			);

			await expect(
				asUser.mutation(api.organizationDocumentFolders.move, {
					id: a,
					parentId: folderB,
				})
			).rejects.toThrow(/does not belong to your organization/i);
		});
	});

	describe("recursive remove", () => {
		it("reports and deletes the whole subtree with its documents", async () => {
			const { asUser } = await setup();
			const a = await asUser.mutation(api.organizationDocumentFolders.create, {
				name: "A",
			});
			const b = await asUser.mutation(api.organizationDocumentFolders.create, {
				name: "B",
				parentId: a,
			});
			const other = await asUser.mutation(
				api.organizationDocumentFolders.create,
				{ name: "Untouched" }
			);

			const mkDoc = async (
				name: string,
				folderId?: Id<"organizationDocumentFolders">
			) => {
				const storageId = await storeBlob(t, {
					contentType: "application/pdf",
				});
				return await asUser.mutation(api.organizationDocuments.create, {
					name,
					storageId,
					folderId,
				});
			};

			await mkDoc("inA.pdf", a);
			await mkDoc("inB.pdf", b);
			const survivor = await mkDoc("inOther.pdf", other);
			const rootDoc = await mkDoc("root.pdf");

			const impact = await asUser.query(
				api.organizationDocumentFolders.getDeleteImpact,
				{ id: a }
			);
			expect(impact).toEqual({ folderCount: 2, documentCount: 2 });

			const result = await asUser.mutation(
				api.organizationDocumentFolders.remove,
				{ id: a }
			);
			expect(result).toEqual({ folderCount: 2, documentCount: 2 });

			const folders = await asUser.query(
				api.organizationDocumentFolders.list,
				{}
			);
			expect(folders.map((f) => f._id)).toEqual([other]);

			const docs = await asUser.query(api.organizationDocuments.list, {});
			expect(docs.map((d) => d._id).sort()).toEqual([survivor, rootDoc].sort());
		});

		it("rejects deleting a folder from another organization", async () => {
			const { asUser } = await setup();
			const orgB = await t.run(
				async (ctx) =>
					await createTestOrg(ctx, {
						clerkUserId: "user_bd",
						clerkOrgId: "org_bd",
						userEmail: "bd@example.com",
					})
			);
			const asUserB = t.withIdentity(
				createTestIdentity(orgB.clerkUserId, orgB.clerkOrgId)
			);
			const folderB = await asUserB.mutation(
				api.organizationDocumentFolders.create,
				{ name: "B" }
			);

			await expect(
				asUser.mutation(api.organizationDocumentFolders.remove, {
					id: folderB,
				})
			).rejects.toThrow(/does not belong to your organization/i);
		});
	});
});
