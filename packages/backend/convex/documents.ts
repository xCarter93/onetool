import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId } from "./lib/auth";
import { ActivityHelpers } from "./lib/activities";
import { optionalUserQuery, userMutation } from "./lib/factories";

/**
 * Document operations with embedded CRUD helpers
 * All PDF document-specific logic lives in this file for better organization
 */

// Document-specific helper functions

/**
 * Get a document by ID with organization validation
 */
async function getDocumentWithOrgValidation(
	ctx: QueryCtx | MutationCtx,
	id: Id<"documents">
): Promise<Doc<"documents"> | null> {
	const userOrgId = await getCurrentUserOrgId(ctx);
	const document = await ctx.db.get(id);

	if (!document) {
		return null;
	}

	if (document.orgId !== userOrgId) {
		throw new Error("Document does not belong to your organization");
	}

	return document;
}

/**
 * Get a document by ID, throwing if not found
 */
async function getDocumentOrThrow(
	ctx: QueryCtx | MutationCtx,
	id: Id<"documents">
): Promise<Doc<"documents">> {
	const document = await getDocumentWithOrgValidation(ctx, id);
	if (!document) {
		throw new Error("Document not found");
	}
	return document;
}

/**
 * Validate quote or invoice exists and belongs to user's org
 */
async function validateDocumentOwnership(
	ctx: QueryCtx | MutationCtx,
	documentType: "quote" | "invoice",
	documentId: string,
	existingOrgId?: Id<"organizations">
): Promise<void> {
	const userOrgId = existingOrgId ?? (await getCurrentUserOrgId(ctx));
	let document: Doc<"quotes"> | Doc<"invoices"> | null;

	if (documentType === "quote") {
		document = await ctx.db.get(documentId as Id<"quotes">);
	} else {
		document = await ctx.db.get(documentId as Id<"invoices">);
	}

	if (!document) {
		throw new Error(`${documentType} not found`);
	}

	if (document.orgId !== userOrgId) {
		throw new Error(`${documentType} does not belong to your organization`);
	}
}

/**
 * Derived scope check: is the document's parent quote/invoice in the caller's scope?
 */
async function isDocumentParentInScope(
	ctx: (QueryCtx | MutationCtx) & {
		actorScope: () => Promise<{
			projectIds: Set<Id<"projects">>;
			clientIds: Set<Id<"clients">>;
		}>;
	},
	documentType: "quote" | "invoice",
	documentId: string
): Promise<boolean> {
	const parent =
		documentType === "quote"
			? await ctx.db.get(documentId as Id<"quotes">)
			: await ctx.db.get(documentId as Id<"invoices">);
	if (!parent) return false;
	const scope = await ctx.actorScope();
	return parent.projectId
		? scope.projectIds.has(parent.projectId)
		: scope.clientIds.has(parent.clientId);
}

/**
 * Create a document with automatic orgId assignment
 */
async function createDocumentWithOrg(
	ctx: MutationCtx,
	data: Omit<Doc<"documents">, "_id" | "_creationTime" | "orgId">
): Promise<Id<"documents">> {
	const userOrgId = await getCurrentUserOrgId(ctx);

	// Validate document ownership
	await validateDocumentOwnership(ctx, data.documentType, data.documentId);

	const documentData = {
		...data,
		orgId: userOrgId,
	};

	return await ctx.db.insert("documents", documentData);
}

/**
 * Update a document with validation
 */
async function updateDocumentWithValidation(
	ctx: MutationCtx,
	id: Id<"documents">,
	updates: Partial<Doc<"documents">>
): Promise<void> {
	// Validate document exists and belongs to user's org
	await getDocumentOrThrow(ctx, id);

	// If document reference is being updated, validate the new reference
	if (updates.documentType && updates.documentId) {
		await validateDocumentOwnership(
			ctx,
			updates.documentType,
			updates.documentId
		);
	}

	// Update the document
	await ctx.db.patch(id, updates);
}

// Define specific types for document operations
type DocumentDocument = Doc<"documents">;
type DocumentId = Id<"documents">;

/**
 * Get all documents for the current user's organization
 */
// TODO: Candidate for deletion if confirmed unused.
export const list = optionalUserQuery({
	args: {
		documentType: v.optional(v.union(v.literal("quote"), v.literal("invoice"))),
		documentId: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<DocumentDocument[]> => {
		const userOrgId = ctx.orgId;
		if (!userOrgId) {
			return [];
		}
		await ctx.requireLevel("documents", "view");

		let documents: DocumentDocument[];

		if (args.documentType && args.documentId) {
			// Get documents for specific quote or invoice
			documents = await ctx.db
				.query("documents")
				.withIndex("by_document", (q) =>
					q
						.eq("documentType", args.documentType!)
						.eq("documentId", args.documentId!)
				)
				.collect();

			// Filter by organization
			documents = documents.filter((doc) => doc.orgId === userOrgId);

			// Single shared parent - scope check is cheap here.
			const inScope = await isDocumentParentInScope(
				ctx,
				args.documentType,
				args.documentId
			);
			documents = await ctx.applyReadScope("documents", documents, () => inScope);
		} else {
			// Get all documents for organization
			documents = await ctx.db
				.query("documents")
				.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
				.collect();

			// Filter by document type if specified
			if (args.documentType) {
				documents = documents.filter(
					(doc) => doc.documentType === args.documentType
				);
			}
			// NOTE: mixed parents (many quotes/invoices) - not scope-filtered,
			// would require a per-row parent fetch. Level-gated only.
		}

		// Sort by generation time (newest first)
		return documents.sort((a, b) => b.generatedAt - a.generatedAt);
	},
});

/**
 * Get a specific document by ID
 */
export const get = optionalUserQuery({
	args: { id: v.id("documents") },
	handler: async (ctx, args): Promise<DocumentDocument | null> => {
		const userOrgId = ctx.orgId;
		if (!userOrgId) {
			return null;
		}
		await ctx.requireLevel("documents", "view");
		const document = await getDocumentWithOrgValidation(ctx, args.id);
		if (!document) {
			return null;
		}
		const inScope = await isDocumentParentInScope(
			ctx,
			document.documentType,
			document.documentId
		);
		const [visible] = await ctx.applyReadScope("documents", [document], () => inScope);
		return visible ?? null;
	},
});

/**
 * Get the latest document for a quote or invoice
 */
export const getLatest = optionalUserQuery({
	args: {
		documentType: v.union(v.literal("quote"), v.literal("invoice")),
		documentId: v.string(),
	},
	handler: async (ctx, args): Promise<DocumentDocument | null> => {
		const userOrgId = ctx.orgId;
		if (!userOrgId) {
			return null;
		}
		await ctx.requireLevel("documents", "view");
		// Validate document ownership
		await validateDocumentOwnership(
			ctx,
			args.documentType,
			args.documentId,
			userOrgId
		);

		const documents = await ctx.db
			.query("documents")
			.withIndex("by_document", (q) =>
				q
					.eq("documentType", args.documentType)
					.eq("documentId", args.documentId)
			)
			.collect();

		// Filter by organization and find the latest
		let orgDocuments = documents.filter((doc) => doc.orgId === userOrgId);

		if (orgDocuments.length === 0) {
			return null;
		}

		// Single shared parent - scope check is cheap here.
		const inScope = await isDocumentParentInScope(
			ctx,
			args.documentType,
			args.documentId
		);
		orgDocuments = await ctx.applyReadScope("documents", orgDocuments, () => inScope);

		if (orgDocuments.length === 0) {
			return null;
		}

		// Return the document with the highest version or latest generation time
		return orgDocuments.reduce((latest, current) => {
			if (current.version && latest.version) {
				return current.version > latest.version ? current : latest;
			}
			return current.generatedAt > latest.generatedAt ? current : latest;
		});
	},
});

/**
 * Get all versions of a document for a quote or invoice
 */
export const getAllVersions = optionalUserQuery({
	args: {
		documentType: v.union(v.literal("quote"), v.literal("invoice")),
		documentId: v.string(),
	},
	handler: async (ctx, args): Promise<DocumentDocument[]> => {
		const userOrgId = ctx.orgId;
		if (!userOrgId) {
			return [];
		}
		await ctx.requireLevel("documents", "view");
		// Validate document ownership
		await validateDocumentOwnership(
			ctx,
			args.documentType,
			args.documentId,
			userOrgId
		);

		const documents = await ctx.db
			.query("documents")
			.withIndex("by_document", (q) =>
				q
					.eq("documentType", args.documentType)
					.eq("documentId", args.documentId)
			)
			.collect();

		// Filter by organization
		let orgDocuments = documents.filter((doc) => doc.orgId === userOrgId);

		// Single shared parent - scope check is cheap here.
		const inScope = await isDocumentParentInScope(
			ctx,
			args.documentType,
			args.documentId
		);
		orgDocuments = await ctx.applyReadScope("documents", orgDocuments, () => inScope);

		// Sort by version (descending - newest first)
		return orgDocuments.sort((a, b) => {
			if (a.version && b.version) {
				return b.version - a.version;
			}
			return b.generatedAt - a.generatedAt;
		});
	},
});

/**
 * Create a new document
 */
export const create = userMutation({
	args: {
		documentType: v.union(v.literal("quote"), v.literal("invoice")),
		documentId: v.string(),
		storageId: v.id("_storage"),
		version: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<DocumentId> => {
		await ctx.requireLevel("documents", "modify");
		await ctx.requireRecordScope("documents", () =>
			isDocumentParentInScope(ctx, args.documentType, args.documentId)
		);
		// If no version specified, auto-increment from existing documents
		let version = args.version;
		if (!version) {
			const existingDocs = await ctx.db
				.query("documents")
				.withIndex("by_document", (q) =>
					q
						.eq("documentType", args.documentType)
						.eq("documentId", args.documentId)
				)
				.collect();

			const userOrgId = await getCurrentUserOrgId(ctx);
			const orgDocs = existingDocs.filter((doc) => doc.orgId === userOrgId);

			const maxVersion = orgDocs.reduce((max, doc) => {
				return doc.version && doc.version > max ? doc.version : max;
			}, 0);

			version = maxVersion + 1;
		}

		const documentId = await createDocumentWithOrg(ctx, {
			documentType: args.documentType,
			documentId: args.documentId,
			storageId: args.storageId,
			generatedAt: Date.now(),
			version,
		});

		// Log activity for quote PDFs
		if (args.documentType === "quote") {
			const quote = await ctx.db.get(args.documentId as Id<"quotes">);
			if (quote) {
				await ActivityHelpers.quotePdfGenerated(
					ctx,
					quote as Doc<"quotes">,
					version
				);
			}
		}

		return documentId;
	},
});

/**
 * Update a document
 */
// TODO: Candidate for deletion if confirmed unused.
export const update = userMutation({
	args: {
		id: v.id("documents"),
		documentType: v.optional(v.union(v.literal("quote"), v.literal("invoice"))),
		documentId: v.optional(v.string()),
		storageId: v.optional(v.id("_storage")),
		version: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<DocumentId> => {
		await ctx.requireLevel("documents", "modify");
		const { id, ...updates } = args;

		// Filter out undefined values
		const filteredUpdates = Object.fromEntries(
			Object.entries(updates).filter(([, value]) => value !== undefined)
		) as Partial<DocumentDocument>;

		if (Object.keys(filteredUpdates).length === 0) {
			throw new Error("No valid updates provided");
		}

		const document = await getDocumentOrThrow(ctx, id);
		await ctx.requireRecordScope("documents", () =>
			isDocumentParentInScope(ctx, document.documentType, document.documentId)
		);

		await updateDocumentWithValidation(ctx, id, filteredUpdates);

		return id;
	},
});

/**
 * Delete a document (also removes the file from storage)
 */
// TODO: Candidate for deletion if confirmed unused.
export const remove = userMutation({
	args: { id: v.id("documents") },
	handler: async (ctx, args): Promise<DocumentId> => {
		await ctx.requireLevel("documents", "delete");
		const document = await getDocumentOrThrow(ctx, args.id);
		await ctx.requireRecordScope("documents", () =>
			isDocumentParentInScope(ctx, document.documentType, document.documentId)
		);

		// Delete the file from storage
		try {
			await ctx.storage.delete(document.storageId);
		} catch (error) {
			// Log error but don't fail the operation if storage deletion fails
			console.warn(`Failed to delete file from storage: ${error}`);
		}

		// Delete the document record
		await ctx.db.delete(args.id);

		return args.id;
	},
});

/**
 * Get document statistics for the organization
 */
// TODO: Candidate for deletion if confirmed unused.
export const getStats = optionalUserQuery({
	args: {},
	handler: async (ctx) => {
		const userOrgId = ctx.orgId;
		if (!userOrgId) {
			return {
				total: 0,
				byType: {
					quote: 0,
					invoice: 0,
				},
				thisMonth: 0,
				thisWeek: 0,
				totalVersions: 0,
				averageVersionsPerDocument: 0,
			};
		}
		await ctx.requireLevel("documents", "view");
		// NOTE: aggregate over all org documents (mixed parents) - not
		// scope-filtered, would require a per-row parent fetch.
		const documents = await ctx.db
			.query("documents")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.collect();

		const stats = {
			total: documents.length,
			byType: {
				quote: 0,
				invoice: 0,
			},
			thisMonth: 0,
			thisWeek: 0,
			totalVersions: 0,
			averageVersionsPerDocument: 0,
		};

		const now = Date.now();
		const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
		const monthStart = new Date();
		monthStart.setDate(1);
		monthStart.setHours(0, 0, 0, 0);
		const monthStartTime = monthStart.getTime();

		// Group documents by type and reference
		const documentGroups = new Map<string, DocumentDocument[]>();

		documents.forEach((doc: DocumentDocument) => {
			// Count by type
			stats.byType[doc.documentType]++;

			// Count this month and week
			if (doc.generatedAt >= monthStartTime) {
				stats.thisMonth++;
			}

			if (doc.generatedAt >= oneWeekAgo) {
				stats.thisWeek++;
			}

			// Group by document reference for version counting
			const key = `${doc.documentType}:${doc.documentId}`;
			if (!documentGroups.has(key)) {
				documentGroups.set(key, []);
			}
			documentGroups.get(key)!.push(doc);
		});

		// Calculate version statistics
		const uniqueDocuments = documentGroups.size;
		stats.totalVersions = documents.length;

		if (uniqueDocuments > 0) {
			stats.averageVersionsPerDocument =
				Math.round((stats.totalVersions / uniqueDocuments) * 100) / 100;
		}

		return stats;
	},
});

/**
 * Clean up old document versions (keep only the latest N versions)
 */
// TODO: Candidate for deletion if confirmed unused.
export const cleanupOldVersions = userMutation({
	args: {
		documentType: v.union(v.literal("quote"), v.literal("invoice")),
		documentId: v.string(),
		keepVersions: v.number(), // How many versions to keep
	},
	handler: async (ctx, args): Promise<{ deletedCount: number }> => {
		await ctx.requireLevel("documents", "delete");
		// Validate document ownership
		await validateDocumentOwnership(ctx, args.documentType, args.documentId);
		await ctx.requireRecordScope("documents", () =>
			isDocumentParentInScope(ctx, args.documentType, args.documentId)
		);

		if (args.keepVersions < 1) {
			throw new Error("Must keep at least 1 version");
		}

		// Get all documents for this reference
		const documents = await ctx.db
			.query("documents")
			.withIndex("by_document", (q) =>
				q
					.eq("documentType", args.documentType)
					.eq("documentId", args.documentId)
			)
			.collect();

		// Filter by organization
		const userOrgId = await getCurrentUserOrgId(ctx);
		const orgDocuments = documents.filter((doc) => doc.orgId === userOrgId);

		if (orgDocuments.length <= args.keepVersions) {
			return { deletedCount: 0 };
		}

		// Sort by version (descending) or generation time (descending)
		orgDocuments.sort((a, b) => {
			if (a.version && b.version) {
				return b.version - a.version;
			}
			return b.generatedAt - a.generatedAt;
		});

		// Keep only the latest N versions
		const toDelete = orgDocuments.slice(args.keepVersions);

		// Delete old versions
		for (const doc of toDelete) {
			// Delete from storage
			try {
				await ctx.storage.delete(doc.storageId);
			} catch (error) {
				console.warn(`Failed to delete file from storage: ${error}`);
			}

			// Delete document record
			await ctx.db.delete(doc._id);
		}

		return { deletedCount: toDelete.length };
	},
});

/**
 * Get document URL from storage
 */
export const getDocumentUrl = optionalUserQuery({
	args: { id: v.id("documents") },
	handler: async (ctx, args): Promise<string | null> => {
		const userOrgId = ctx.orgId;
		if (!userOrgId) {
			return null;
		}
		await ctx.requireLevel("documents", "view");
		const document = await getDocumentWithOrgValidation(ctx, args.id);

		if (!document) {
			return null;
		}

		const inScope = await isDocumentParentInScope(
			ctx,
			document.documentType,
			document.documentId
		);
		const [visible] = await ctx.applyReadScope("documents", [document], () => inScope);
		if (!visible) {
			return null;
		}

		// Get storage URL
		return await ctx.storage.getUrl(visible.storageId);
	},
});

/**
 * Generate a signed upload URL for Convex storage
 */
export const generateUploadUrl = userMutation({
	args: {},
	handler: async (ctx) => {
		await ctx.requireLevel("documents", "modify");
		return await ctx.storage.generateUploadUrl();
	},
});

/**
 * Get BoldSign status for a document
 */
export const getBoldsignStatus = optionalUserQuery({
	args: { documentId: v.id("documents") },
	handler: async (ctx, args) => {
		const userOrgId = ctx.orgId;
		if (!userOrgId) {
			return null;
		}
		await ctx.requireLevel("documents", "view");
		const document = await getDocumentWithOrgValidation(ctx, args.documentId);
		if (!document) {
			return null;
		}
		const inScope = await isDocumentParentInScope(
			ctx,
			document.documentType,
			document.documentId
		);
		const [visible] = await ctx.applyReadScope("documents", [document], () => inScope);
		return visible?.boldsign || null;
	},
});

/**
 * Get all documents with BoldSign signatures for a quote or invoice
 */
export const getAllDocumentsWithSignatures = optionalUserQuery({
	args: {
		documentType: v.union(v.literal("quote"), v.literal("invoice")),
		documentId: v.string(),
	},
	handler: async (
		ctx,
		args
	): Promise<
		Array<{
			_id: DocumentId;
			version: number;
			generatedAt: number;
			boldsign: NonNullable<DocumentDocument["boldsign"]>;
		}>
	> => {
		const userOrgId = ctx.orgId;
		if (!userOrgId) {
			return [];
		}
		await ctx.requireLevel("documents", "view");

		// Validate document ownership
		await validateDocumentOwnership(
			ctx,
			args.documentType,
			args.documentId,
			userOrgId
		);

		const documents = await ctx.db
			.query("documents")
			.withIndex("by_document", (q) =>
				q
					.eq("documentType", args.documentType)
					.eq("documentId", args.documentId)
			)
			.collect();

		// Filter by organization and only return documents with boldsign data
		let orgDocuments = documents
			.filter(
				(doc) =>
					doc.orgId === userOrgId && doc.boldsign && doc.version !== undefined
			)
			.map((doc) => ({
				_id: doc._id,
				version: doc.version,
				generatedAt: doc.generatedAt,
				boldsign: doc.boldsign!,
			}));

		// Single shared parent - scope check is cheap here.
		const inScope = await isDocumentParentInScope(
			ctx,
			args.documentType,
			args.documentId
		);
		orgDocuments = await ctx.applyReadScope("documents", orgDocuments, () => inScope);

		// Sort by version (descending - newest first), falling back to generatedAt
		return orgDocuments.sort((a, b) => {
			const aKey = a.version ?? a.generatedAt;
			const bKey = b.version ?? b.generatedAt;
			return bKey - aKey;
		});
	},
});

/**
 * Get signed documents for a project
 * Returns completed and signed quote documents that are linked to the project
 */
export const listSignedByProject = optionalUserQuery({
	args: {
		projectId: v.id("projects"),
	},
	handler: async (ctx, args) => {
		const userOrgId = ctx.orgId;
		if (!userOrgId) {
			return [];
		}
		await ctx.requireLevel("documents", "view");

		// Validate project access
		const project = await ctx.db.get(args.projectId);
		if (!project || project.orgId !== userOrgId) {
			throw new Error("Project not found or access denied");
		}

		// Get all quotes for this project
		const quotes = await ctx.db
			.query("quotes")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();

		if (quotes.length === 0) {
			return [];
		}

		// Get all documents for these quotes that have signed PDFs
		const quoteIds = quotes.map((q) => q._id);
		const allDocuments = await ctx.db
			.query("documents")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.collect();

		// Filter to documents for our quotes that have signed storage IDs
		let signedDocuments = allDocuments.filter(
			(doc) =>
				doc.documentType === "quote" &&
				quoteIds.includes(doc.documentId as Id<"quotes">) &&
				doc.signedStorageId !== undefined &&
				doc.boldsign?.status === "Completed"
		);

		// Single shared parent project - scope check is cheap here.
		signedDocuments = await ctx.applyReadScope(
			"documents",
			signedDocuments,
			(_doc, scope) => scope.projectIds.has(args.projectId)
		);

		// Generate download URLs and return metadata
		const results = await Promise.all(
			signedDocuments.map(async (doc) => {
				const quote = quotes.find((q) => q._id === doc.documentId);
				const downloadUrl = doc.signedStorageId
					? await ctx.storage.getUrl(doc.signedStorageId)
					: null;

				return {
					_id: doc._id,
					fileName: `Quote-${quote?.quoteNumber || doc.documentId.slice(-6)}-Signed.pdf`,
					fileSize: 0, // We don't track file size for BoldSign downloads
					mimeType: "application/pdf",
					uploadedAt: doc.boldsign?.completedAt || doc.generatedAt,
					downloadUrl,
					quoteNumber: quote?.quoteNumber || null,
					quoteId: doc.documentId as Id<"quotes">,
					completedAt: doc.boldsign?.completedAt,
					type: "signed-quote" as const,
				};
			})
		);

		// Sort by completion date (most recent first)
		return results.sort((a, b) => b.uploadedAt - a.uploadedAt);
	},
});
