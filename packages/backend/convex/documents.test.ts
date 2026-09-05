import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { ConvexError } from "convex/values";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { Id } from "./_generated/dataModel";
import {
	addMemberToOrg,
	createTestClient,
	createTestIdentity,
	createTestOrg,
	createTestProject,
	createTestQuote,
} from "./test.helpers";

/**
 * `documents` rows are inserted with raw t.run: the table is untriggered and no
 * public API can create the BoldSign signed-version fixtures these tests need.
 */
describe("documents.listSignedByProject", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function storeBlob(content: string): Promise<Id<"_storage">> {
		return await t.run(async (ctx) => ctx.storage.store(new Blob([content])));
	}

	async function insertGeneratedDoc(fields: {
		orgId: Id<"organizations">;
		documentId: string;
		version: number;
		signed?: boolean;
		completedAt?: number;
	}): Promise<Id<"documents">> {
		const storageId = await storeBlob(`pdf-v${fields.version}`);
		const signedStorageId = fields.signed
			? await storeBlob(`signed-pdf-v${fields.version}`)
			: undefined;

		return await t.run(async (ctx) =>
			ctx.db.insert("documents", {
				orgId: fields.orgId,
				documentType: "quote" as const,
				documentId: fields.documentId,
				storageId,
				signedStorageId,
				generatedAt: 1000 * fields.version,
				version: fields.version,
				boldsign: fields.signed
					? {
							documentId: `bs_${fields.documentId}_${fields.version}`,
							status: "Completed" as const,
							sentTo: [],
							completedAt: fields.completedAt ?? 5000,
						}
					: undefined,
			})
		);
	}

	it("returns signed quote docs for the project only, newest first", async () => {
		const { orgId, clerkUserId, clerkOrgId } = await t.run((ctx) =>
			createTestOrg(ctx)
		);
		const other = await t.run((ctx) =>
			createTestOrg(ctx, {
				clerkUserId: "user_other",
				clerkOrgId: "org_other",
				userEmail: "other@example.com",
			})
		);

		const { projectId, quoteA, quoteB, otherProjectQuote } = await t.run(
			async (ctx) => {
				const clientId = await createTestClient(ctx, orgId);
				const projectId = await createTestProject(ctx, orgId, clientId);
				const otherProjectId = await createTestProject(ctx, orgId, clientId, {
					title: "Other Project",
				});
				const quoteA = await createTestQuote(ctx, orgId, clientId, {
					projectId,
					quoteNumber: "Q-000001",
				});
				const quoteB = await createTestQuote(ctx, orgId, clientId, {
					projectId,
					quoteNumber: "Q-000002",
				});
				const otherProjectQuote = await createTestQuote(ctx, orgId, clientId, {
					projectId: otherProjectId,
					quoteNumber: "Q-000003",
				});
				return { projectId, quoteA, quoteB, otherProjectQuote };
			}
		);

		// Unsigned version of quoteA — excluded.
		await insertGeneratedDoc({ orgId, documentId: quoteA, version: 1 });
		const signedA = await insertGeneratedDoc({
			orgId,
			documentId: quoteA,
			version: 2,
			signed: true,
			completedAt: 5000,
		});
		const signedB = await insertGeneratedDoc({
			orgId,
			documentId: quoteB,
			version: 1,
			signed: true,
			completedAt: 9000,
		});
		// A quote on a different project — excluded.
		await insertGeneratedDoc({
			orgId,
			documentId: otherProjectQuote,
			version: 1,
			signed: true,
			completedAt: 9999,
		});
		// A row in another org pointing at this org's quote — excluded.
		await insertGeneratedDoc({
			orgId: other.orgId,
			documentId: quoteA,
			version: 3,
			signed: true,
			completedAt: 9999,
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const results = await asUser.query(api.documents.listSignedByProject, {
			projectId,
		});

		expect(results.map((r) => r._id)).toEqual([signedB, signedA]);
		expect(results[0]).toMatchObject({
			fileName: "Quote-Q-000002-Signed.pdf",
			fileSize: 0,
			mimeType: "application/pdf",
			uploadedAt: 9000,
			quoteNumber: "Q-000002",
			quoteId: quoteB,
			completedAt: 9000,
			type: "signed-quote",
		});
		expect(results[0].downloadUrl).toBeTruthy();
	});

	it("breaks completedAt ties by creation order", async () => {
		const { orgId, clerkUserId, clerkOrgId } = await t.run((ctx) =>
			createTestOrg(ctx)
		);
		const { projectId, quoteA, quoteB } = await t.run(async (ctx) => {
			const clientId = await createTestClient(ctx, orgId);
			const projectId = await createTestProject(ctx, orgId, clientId);
			const quoteA = await createTestQuote(ctx, orgId, clientId, {
				projectId,
				quoteNumber: "Q-000010",
			});
			const quoteB = await createTestQuote(ctx, orgId, clientId, {
				projectId,
				quoteNumber: "Q-000011",
			});
			return { projectId, quoteA, quoteB };
		});

		// Same completedAt: the stable sort must keep insertion order, which the
		// old org-wide collect produced via by_org (_creationTime asc).
		const first = await insertGeneratedDoc({
			orgId,
			documentId: quoteB,
			version: 1,
			signed: true,
			completedAt: 7000,
		});
		const second = await insertGeneratedDoc({
			orgId,
			documentId: quoteA,
			version: 1,
			signed: true,
			completedAt: 7000,
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const results = await asUser.query(api.documents.listSignedByProject, {
			projectId,
		});

		expect(results.map((r) => r._id)).toEqual([first, second]);
	});

	it("returns an empty array when the project has no quotes", async () => {
		const { orgId, clerkUserId, clerkOrgId } = await t.run((ctx) =>
			createTestOrg(ctx)
		);
		const projectId = await t.run(async (ctx) => {
			const clientId = await createTestClient(ctx, orgId);
			return await createTestProject(ctx, orgId, clientId);
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		expect(
			await asUser.query(api.documents.listSignedByProject, { projectId })
		).toEqual([]);
	});
});

/**
 * Record scope on `documents` derives from the parent quote/invoice's project
 * (else its client). Both branches resolve by point read, so both need proving.
 */
describe("documents.create — record scope", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seed() {
		const org = await t.run((ctx) => createTestOrg(ctx));
		const member = await t.run((ctx) =>
			addMemberToOrg(ctx, org.orgId, {
				clerkUserId: "user_doc_member",
				userEmail: "doc-member@example.com",
			})
		);

		const ids = await t.run(async (ctx) => {
			const membership = await ctx.db
				.query("organizationMemberships")
				.withIndex("by_org_user", (q) =>
					q.eq("orgId", org.orgId).eq("userId", member.userId)
				)
				.unique();
			if (!membership) throw new Error("membership not found");
			// Scoped grant: modify without allRecords, so the scope check runs.
			await ctx.db.patch(membership._id, {
				permissions: { documents: { level: "modify" as const } },
			});

			const assignedClientId = await createTestClient(ctx, org.orgId, {
				companyName: "Assigned Client",
			});
			const otherClientId = await createTestClient(ctx, org.orgId, {
				companyName: "Other Client",
			});
			const assignedProjectId = await createTestProject(
				ctx,
				org.orgId,
				assignedClientId,
				{ title: "Assigned Project" }
			);
			await ctx.db.patch(assignedProjectId, {
				assignedUserIds: [member.userId],
			});
			const unassignedProjectId = await createTestProject(
				ctx,
				org.orgId,
				otherClientId,
				{ title: "Unassigned Project" }
			);

			return {
				assignedClientId,
				assignedQuoteId: await createTestQuote(ctx, org.orgId, assignedClientId, {
					projectId: assignedProjectId,
					quoteNumber: "Q-100001",
				}),
				unassignedQuoteId: await createTestQuote(ctx, org.orgId, otherClientId, {
					projectId: unassignedProjectId,
					quoteNumber: "Q-100002",
				}),
				// No projectId: falls through to the client branch.
				clientOnlyQuoteId: await createTestQuote(
					ctx,
					org.orgId,
					assignedClientId,
					{ quoteNumber: "Q-100003" }
				),
			};
		});

		const storageId = await t.run(async (ctx) =>
			ctx.storage.store(new Blob(["pdf"]))
		);

		return {
			asMember: t.withIdentity(
				createTestIdentity(member.clerkUserId, org.clerkOrgId)
			),
			storageId,
			...ids,
		};
	}

	it("allows a document on a quote for an assigned project", async () => {
		const { asMember, assignedQuoteId, storageId } = await seed();

		await expect(
			asMember.mutation(api.documents.create, {
				documentType: "quote",
				documentId: assignedQuoteId,
				storageId,
			})
		).resolves.toBeTruthy();
	});

	it("denies a document on a quote for an unassigned project", async () => {
		const { asMember, unassignedQuoteId, storageId } = await seed();

		const caught = await asMember
			.mutation(api.documents.create, {
				documentType: "quote",
				documentId: unassignedQuoteId,
				storageId,
			})
			.then(
				() => null,
				(error: unknown) => error
			);

		let data: unknown = (caught as ConvexError<string>)?.data;
		while (typeof data === "string") data = JSON.parse(data);
		expect(data).toMatchObject({
			code: "FORBIDDEN",
			object: "documents",
			scope: true,
		});
	});

	it("allows a project-less quote whose client has an assigned project", async () => {
		const { asMember, clientOnlyQuoteId, storageId } = await seed();

		await expect(
			asMember.mutation(api.documents.create, {
				documentType: "quote",
				documentId: clientOnlyQuoteId,
				storageId,
			})
		).resolves.toBeTruthy();
	});
});
