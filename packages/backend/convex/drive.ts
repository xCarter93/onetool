import { v } from "convex/values";
import { QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { optionalUserQuery } from "./lib/factories";
import { StorageHelpers } from "./lib/storage";

/**
 * Virtual "Clients" tree for the org documents drive.
 *
 * Synthesizes a Clients > Client > Project folder hierarchy out of three real
 * sources: client attachments, project attachments, and generated quote/invoice
 * PDFs. Deliberately has no folders table — the hierarchy is derived from the
 * parent records on every read.
 */

type GeneratedParent = Doc<"quotes"> | Doc<"invoices">;

/**
 * `documents.documentId` is a raw string, so normalize before reading — a
 * malformed value must resolve to null rather than throw.
 */
async function getGeneratedParent(
	ctx: QueryCtx,
	doc: { documentType: "quote" | "invoice"; documentId: string }
): Promise<GeneratedParent | null> {
	if (doc.documentType === "quote") {
		const id = ctx.db.normalizeId("quotes", doc.documentId);
		return id ? await ctx.db.get(id) : null;
	}
	const id = ctx.db.normalizeId("invoices", doc.documentId);
	return id ? await ctx.db.get(id) : null;
}

/** A generated PDF counts as signed only when BoldSign actually completed it. */
function isSignedDocument(doc: Doc<"documents">): boolean {
	return doc.signedStorageId !== undefined && doc.boldsign?.status === "Completed";
}

/** House ordering key: legacy rows predate `version` and fall back to generatedAt. */
function versionKey(doc: Doc<"documents">): number {
	return doc.version ?? doc.generatedAt;
}

function generatedDisplayName(
	doc: Doc<"documents">,
	parent: GeneratedParent,
	signed: boolean
): string {
	const suffix = signed ? " (Signed)" : "";
	if (doc.documentType === "quote") {
		const number =
			(parent as Doc<"quotes">).quoteNumber || doc.documentId.slice(-6);
		return `Quote ${number}${suffix}.pdf`;
	}
	return `Invoice ${(parent as Doc<"invoices">).invoiceNumber}${suffix}.pdf`;
}

export const listClientsTree = optionalUserQuery({
	args: {},
	handler: async (ctx) => {
		const userOrgId = ctx.orgId;
		if (!userOrgId) {
			return null;
		}
		await ctx.requireLevel("documents", "view");

		const [allClientDocs, allProjectDocs, allGenerated] = await Promise.all([
			ctx.db
				.query("clientDocuments")
				.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
				.collect(),
			ctx.db
				.query("projectDocuments")
				.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
				.collect(),
			ctx.db
				.query("documents")
				.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
				.collect(),
		]);

		const scopedClientDocs = await ctx.applyReadScope(
			"documents",
			allClientDocs,
			(doc, scope) => scope.clientIds.has(doc.clientId)
		);
		const scopedProjectDocs = await ctx.applyReadScope(
			"documents",
			allProjectDocs,
			(doc, scope) => scope.projectIds.has(doc.projectId)
		);

		// One display row per (documentType, documentId): the signed version wins,
		// otherwise the newest version.
		const groups = new Map<string, Doc<"documents">[]>();
		for (const doc of allGenerated) {
			const key = `${doc.documentType}:${doc.documentId}`;
			const bucket = groups.get(key);
			if (bucket) {
				bucket.push(doc);
			} else {
				groups.set(key, [doc]);
			}
		}

		const parents = new Map<string, GeneratedParent | null>();
		await Promise.all(
			[...groups.entries()].map(async ([key, docs]) => {
				parents.set(key, await getGeneratedParent(ctx, docs[0]));
			})
		);

		const candidates: {
			doc: Doc<"documents">;
			parent: GeneratedParent;
			signed: boolean;
		}[] = [];
		for (const [key, docs] of groups) {
			const parent = parents.get(key);
			if (!parent || parent.orgId !== userOrgId) continue;

			const signedVersions = docs.filter(isSignedDocument);
			const pool = signedVersions.length > 0 ? signedVersions : docs;
			const chosen = pool.reduce((best, doc) =>
				versionKey(doc) > versionKey(best) ? doc : best
			);
			candidates.push({
				doc: chosen,
				parent,
				signed: signedVersions.length > 0,
			});
		}

		const scopedCandidates = await ctx.applyReadScope(
			"documents",
			candidates,
			({ parent }, scope) =>
				parent.projectId
					? scope.projectIds.has(parent.projectId)
					: scope.clientIds.has(parent.clientId)
		);

		const generatedDocs = await Promise.all(
			scopedCandidates.map(async ({ doc, parent, signed }) => {
				const storageId =
					signed && doc.signedStorageId ? doc.signedStorageId : doc.storageId;
				const metadata = await ctx.db.system.get(storageId);
				return {
					_id: doc._id,
					documentType: doc.documentType,
					clientId: parent.clientId,
					projectId: parent.projectId,
					signed,
					generatedAt: doc.generatedAt,
					name: generatedDisplayName(doc, parent, signed),
					fileSize: metadata?.size ?? null,
				};
			})
		);
		generatedDocs.sort((a, b) => b.generatedAt - a.generatedAt);

		// Batch-load the distinct uploaders once, not once per attachment.
		const uploaderIds = [
			...new Set(
				[...scopedClientDocs, ...scopedProjectDocs].map((d) => d.uploadedBy)
			),
		];
		const uploaders = new Map<
			Id<"users">,
			{ name: string | null; image: string | null }
		>();
		await Promise.all(
			uploaderIds.map(async (uploaderId) => {
				const uploader = await ctx.db.get(uploaderId);
				uploaders.set(uploaderId, {
					name: uploader?.name ?? uploader?.email ?? null,
					image: uploader?.image || null,
				});
			})
		);

		const clientDocs = scopedClientDocs
			.sort((a, b) => b.uploadedAt - a.uploadedAt)
			.map((doc) => ({
				_id: doc._id,
				clientId: doc.clientId,
				name: doc.name,
				fileName: doc.fileName,
				fileSize: doc.fileSize,
				mimeType: doc.mimeType,
				uploadedAt: doc.uploadedAt,
				uploaderName: uploaders.get(doc.uploadedBy)?.name ?? null,
				uploaderImage: uploaders.get(doc.uploadedBy)?.image ?? null,
			}));

		const projectDocs = scopedProjectDocs
			.sort((a, b) => b.uploadedAt - a.uploadedAt)
			.map((doc) => ({
				_id: doc._id,
				projectId: doc.projectId,
				name: doc.name,
				fileName: doc.fileName,
				fileSize: doc.fileSize,
				mimeType: doc.mimeType,
				uploadedAt: doc.uploadedAt,
				uploaderName: uploaders.get(doc.uploadedBy)?.name ?? null,
				uploaderImage: uploaders.get(doc.uploadedBy)?.image ?? null,
			}));

		// Reference lists come from post-scope rows only — deriving them from the
		// unscoped rows would leak client/project names to restricted members.
		const projectIds = new Set<Id<"projects">>();
		for (const doc of projectDocs) projectIds.add(doc.projectId);
		for (const doc of generatedDocs) {
			if (doc.projectId) projectIds.add(doc.projectId);
		}

		const projectRows = await Promise.all(
			[...projectIds].map((id) => ctx.db.get(id))
		);
		const projects: { _id: Id<"projects">; name: string; clientId: Id<"clients"> }[] =
			[];
		const clientIds = new Set<Id<"clients">>();
		for (const project of projectRows) {
			if (!project || project.orgId !== userOrgId) continue;
			projects.push({
				_id: project._id,
				name: project.title,
				clientId: project.clientId,
			});
			clientIds.add(project.clientId);
		}

		for (const doc of clientDocs) clientIds.add(doc.clientId);
		for (const doc of generatedDocs) clientIds.add(doc.clientId);

		const clientRows = await Promise.all(
			[...clientIds].map((id) => ctx.db.get(id))
		);
		const clients: { _id: Id<"clients">; name: string }[] = [];
		for (const client of clientRows) {
			if (!client || client.orgId !== userOrgId) continue;
			clients.push({ _id: client._id, name: client.companyName });
		}

		return { clients, projects, clientDocs, projectDocs, generatedDocs };
	},
});

export const getFileUrls = optionalUserQuery({
	args: {
		files: v.array(
			v.object({
				kind: v.union(
					v.literal("client"),
					v.literal("project"),
					v.literal("generated")
				),
				id: v.string(),
			})
		),
	},
	handler: async (ctx, args) => {
		const userOrgId = ctx.orgId;
		if (!userOrgId) {
			return [];
		}
		await ctx.requireLevel("documents", "view");

		const results: { id: string; url: string | null }[] = [];

		// Batch downloads must degrade, not throw: anything missing or out of
		// scope resolves to a null url.
		for (const file of args.files) {
			let url: string | null = null;

			if (file.kind === "client") {
				const id: Id<"clientDocuments"> | null = ctx.db.normalizeId(
					"clientDocuments",
					file.id
				);
				const doc: Doc<"clientDocuments"> | null = id
					? await ctx.db.get(id)
					: null;
				if (doc && doc.orgId === userOrgId) {
					const allowed = await ctx.applyReadScope(
						"documents",
						[doc],
						(row, scope) => scope.clientIds.has(row.clientId)
					);
					if (allowed.length > 0) {
						url = await StorageHelpers.getStorageUrl(ctx, doc.storageId);
					}
				}
			} else if (file.kind === "project") {
				const id: Id<"projectDocuments"> | null = ctx.db.normalizeId(
					"projectDocuments",
					file.id
				);
				const doc: Doc<"projectDocuments"> | null = id
					? await ctx.db.get(id)
					: null;
				if (doc && doc.orgId === userOrgId) {
					const allowed = await ctx.applyReadScope(
						"documents",
						[doc],
						(row, scope) => scope.projectIds.has(row.projectId)
					);
					if (allowed.length > 0) {
						url = await StorageHelpers.getStorageUrl(ctx, doc.storageId);
					}
				}
			} else {
				const id: Id<"documents"> | null = ctx.db.normalizeId(
					"documents",
					file.id
				);
				const doc: Doc<"documents"> | null = id ? await ctx.db.get(id) : null;
				if (doc && doc.orgId === userOrgId) {
					const parent = await getGeneratedParent(ctx, doc);
					if (parent && parent.orgId === userOrgId) {
						const allowed = await ctx.applyReadScope(
							"documents",
							[parent],
							(row, scope) =>
								row.projectId
									? scope.projectIds.has(row.projectId)
									: scope.clientIds.has(row.clientId)
						);
						if (allowed.length > 0) {
							const signed = isSignedDocument(doc);
							url = await StorageHelpers.getStorageUrl(
								ctx,
								signed && doc.signedStorageId
									? doc.signedStorageId
									: doc.storageId
							);
						}
					}
				}
			}

			results.push({ id: file.id, url });
		}

		return results;
	},
});
