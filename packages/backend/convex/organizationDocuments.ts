import { query, QueryCtx, MutationCtx } from "./_generated/server";
import { mutation } from "./lib/triggers";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId, getCurrentUserOrThrow } from "./lib/auth";
import { optionalUserQuery, userMutation } from "./lib/factories";

/**
 * Organization Document operations
 * Reusable documents that can be appended to quotes and invoices
 */

// Document-specific helper functions

/**
 * Get a document by ID with organization validation
 */
async function getDocumentWithOrgValidation(
	ctx: QueryCtx | MutationCtx,
	id: Id<"organizationDocuments">
): Promise<Doc<"organizationDocuments"> | null> {
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
	id: Id<"organizationDocuments">
): Promise<Doc<"organizationDocuments">> {
	const document = await getDocumentWithOrgValidation(ctx, id);
	if (!document) {
		throw new Error("Document not found");
	}
	return document;
}

// Define specific types for document operations
type OrganizationDocument = Doc<"organizationDocuments">;
type OrganizationDocumentId = Id<"organizationDocuments">;

/** Enriched shape returned by `list`/`get` for the drive explorer. */
export type OrganizationDocumentWithMeta = OrganizationDocument & {
	mimeType: string;
	uploaderName: string | null;
	uploaderImage: string | null;
};

/** Hard server-side upload ceiling (25 MB). */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

/** Content types accepted for organization document uploads. */
export const ALLOWED_MIME_TYPES = [
	"application/pdf",
	// Images
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
	"image/heic",
	"image/heif",
	// Office (OpenXML)
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	// Office (legacy)
	"application/msword",
	"application/vnd.ms-excel",
	"application/vnd.ms-powerpoint",
	// Text
	"text/csv",
	"text/plain",
] as const;

const ALLOWED_MIME_TYPE_SET: ReadonlySet<string> = new Set(ALLOWED_MIME_TYPES);

/**
 * Legacy rows predate `mimeType` and were always PDFs.
 */
function normalizeMimeType(doc: OrganizationDocument): string {
	return doc.mimeType ?? "application/pdf";
}

/**
 * Get all organization documents
 */
export const list = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<OrganizationDocumentWithMeta[]> => {
		const userOrgId = ctx.orgId;
		if (!userOrgId) {
			return [];
		}
		await ctx.requireLevel("orgDocuments", "view");

		const documents = await ctx.db
			.query("organizationDocuments")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.collect();

		// Batch-load the distinct uploaders once, not once per document.
		const uploaderIds = [...new Set(documents.map((d) => d.uploadedBy))];
		const uploaders = new Map<
			Id<"users">,
			{ name: string | null; image: string | null }
		>();
		for (const uploaderId of uploaderIds) {
			const uploader = await ctx.db.get(uploaderId);
			uploaders.set(uploaderId, {
				name: uploader?.name ?? uploader?.email ?? null,
				image: uploader?.image || null,
			});
		}

		return documents
			.sort((a, b) => b.uploadedAt - a.uploadedAt)
			.map((doc) => ({
				...doc,
				mimeType: normalizeMimeType(doc),
				uploaderName: uploaders.get(doc.uploadedBy)?.name ?? null,
				uploaderImage: uploaders.get(doc.uploadedBy)?.image ?? null,
			}));
	},
});

/**
 * Get a specific document by ID
 */
export const get = optionalUserQuery({
	args: { id: v.id("organizationDocuments") },
	handler: async (ctx, args): Promise<OrganizationDocumentWithMeta | null> => {
		const userOrgId = ctx.orgId;
		if (!userOrgId) {
			return null;
		}
		await ctx.requireLevel("orgDocuments", "view");
		const document = await getDocumentWithOrgValidation(ctx, args.id);
		if (!document) {
			return null;
		}
		const uploader = await ctx.db.get(document.uploadedBy);
		return {
			...document,
			mimeType: normalizeMimeType(document),
			uploaderName: uploader?.name ?? uploader?.email ?? null,
			uploaderImage: uploader?.image || null,
		};
	},
});

/**
 * Create a new organization document
 */
export const create = userMutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
		storageId: v.id("_storage"),
		// Accepted for backwards compatibility; the authoritative size comes from
		// the _storage system document.
		fileSize: v.optional(v.number()),
		folderId: v.optional(v.id("organizationDocumentFolders")),
	},
	handler: async (ctx, args): Promise<OrganizationDocumentId> => {
		const user = await getCurrentUserOrThrow(ctx);
		const userOrgId = await getCurrentUserOrgId(ctx);
		await ctx.requireLevel("orgDocuments", "modify");

		const name = args.name.trim();
		if (name.length === 0) {
			throw new Error("Document name is required");
		}

		// Authoritative file facts live on the _storage system document, not on
		// anything the client sent. Reject + drop the blob on violation.
		const metadata = await ctx.db.system.get(args.storageId);
		if (!metadata) {
			throw new Error("Uploaded file could not be found in storage");
		}

		// NOTE: a rejected upload's blob cannot be cleaned up here — Convex
		// mutations are transactional, so throwing rolls back any
		// `ctx.storage.delete` in the same call. The client is responsible for
		// not retaining the storageId of a rejected upload.
		if (metadata.size > MAX_DOCUMENT_BYTES) {
			throw new Error(
				`File is too large. Maximum size is ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB.`
			);
		}

		const contentType = metadata.contentType ?? undefined;
		if (!contentType || !ALLOWED_MIME_TYPE_SET.has(contentType)) {
			throw new Error(
				`Unsupported file type${contentType ? `: ${contentType}` : ""}. Allowed types: PDF, images, Office documents, CSV and plain text.`
			);
		}

		if (args.folderId) {
			await ctx.orgEntity("organizationDocumentFolders", args.folderId);
		}

		const documentId = await ctx.db.insert("organizationDocuments", {
			orgId: userOrgId,
			name,
			description: args.description,
			storageId: args.storageId,
			fileSize: metadata.size,
			mimeType: contentType,
			folderId: args.folderId,
			uploadedAt: Date.now(),
			uploadedBy: user._id,
		});

		return documentId;
	},
});

/**
 * Update an organization document
 */
export const update = userMutation({
	args: {
		id: v.id("organizationDocuments"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<OrganizationDocumentId> => {
		await ctx.requireLevel("orgDocuments", "modify");
		const { id, ...updates } = args;

		// Validate document exists and belongs to user's org
		await getDocumentOrThrow(ctx, id);

		// Filter out undefined values
		const filteredUpdates = Object.fromEntries(
			Object.entries(updates).filter(([, value]) => value !== undefined)
		) as Partial<OrganizationDocument>;

		if (Object.keys(filteredUpdates).length === 0) {
			throw new Error("No valid updates provided");
		}

		// Update the document
		await ctx.db.patch(id, filteredUpdates);

		return id;
	},
});

/**
 * Delete an organization document (also removes the file from storage)
 */
export const remove = userMutation({
	args: { id: v.id("organizationDocuments") },
	handler: async (ctx, args): Promise<OrganizationDocumentId> => {
		await ctx.requireLevel("orgDocuments", "delete");
		const document = await getDocumentOrThrow(ctx, args.id);

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
 * Delete several documents at once (drive-explorer multi-select).
 */
export const bulkRemove = userMutation({
	args: { ids: v.array(v.id("organizationDocuments")) },
	handler: async (ctx, args): Promise<{ deleted: number }> => {
		await ctx.requireLevel("orgDocuments", "delete");

		// Validate every id first so a cross-org id aborts the whole batch.
		const documents: OrganizationDocument[] = [];
		for (const id of args.ids) {
			documents.push(await ctx.orgEntity("organizationDocuments", id));
		}

		for (const document of documents) {
			try {
				await ctx.storage.delete(document.storageId);
			} catch (error) {
				console.warn(`Failed to delete file from storage: ${error}`);
			}
			await ctx.db.delete(document._id);
		}

		return { deleted: documents.length };
	},
});

/**
 * Move documents into a folder (undefined folderId = root).
 */
export const move = userMutation({
	args: {
		ids: v.array(v.id("organizationDocuments")),
		folderId: v.optional(v.id("organizationDocumentFolders")),
	},
	handler: async (ctx, args): Promise<{ moved: number }> => {
		await ctx.requireLevel("orgDocuments", "modify");

		if (args.folderId) {
			await ctx.orgEntity("organizationDocumentFolders", args.folderId);
		}

		const documents: OrganizationDocument[] = [];
		for (const id of args.ids) {
			documents.push(await ctx.orgEntity("organizationDocuments", id));
		}

		for (const document of documents) {
			await ctx.db.patch(document._id, { folderId: args.folderId });
		}

		return { moved: documents.length };
	},
});

/**
 * Get document URL from storage
 */
export const getDocumentUrl = optionalUserQuery({
	args: { id: v.id("organizationDocuments") },
	handler: async (ctx, args): Promise<string | null> => {
		const userOrgId = ctx.orgId;
		if (!userOrgId) {
			return null;
		}
		await ctx.requireLevel("orgDocuments", "view");
		const document = await getDocumentWithOrgValidation(ctx, args.id);

		if (!document) {
			return null;
		}

		// Get storage URL
		return await ctx.storage.getUrl(document.storageId);
	},
});

/** Per-call ceiling (same as drive.getFileUrls); extra ids are dropped, so callers chunk their batches. */
const MAX_DOCUMENT_URLS = 100;

/**
 * Get multiple document URLs from storage (for PDF merging)
 */
export const getDocumentUrls = optionalUserQuery({
	args: { ids: v.array(v.id("organizationDocuments")) },
	handler: async (
		ctx,
		args
	): Promise<Array<{ id: string; url: string | null }>> => {
		const userOrgId = ctx.orgId;
		if (!userOrgId) {
			return [];
		}
		await ctx.requireLevel("orgDocuments", "view");

		const results = [];
		for (const id of args.ids.slice(0, MAX_DOCUMENT_URLS)) {
			try {
				const document = await getDocumentWithOrgValidation(ctx, id);
				if (document) {
					const url = await ctx.storage.getUrl(document.storageId);
					results.push({ id, url });
				} else {
					results.push({ id, url: null });
				}
			} catch (error) {
				console.warn(`Error fetching document ${id}:`, error);
				results.push({ id, url: null });
			}
		}

		return results;
	},
});

/**
 * Generate a signed upload URL for Convex storage
 */
export const generateUploadUrl = userMutation({
	args: {},
	handler: async (ctx) => {
		// Ensure user is authenticated
		await getCurrentUserOrThrow(ctx);
		await ctx.requireLevel("orgDocuments", "modify");
		return await ctx.storage.generateUploadUrl();
	},
});

/**
 * Get document statistics for the organization
 */
export const getStats = optionalUserQuery({
	args: {},
	handler: async (ctx) => {
		const userOrgId = ctx.orgId;
		if (!userOrgId) {
			return {
				total: 0,
				totalSize: 0,
				thisMonth: 0,
				thisWeek: 0,
			};
		}
		await ctx.requireLevel("orgDocuments", "view");

		const documents = await ctx.db
			.query("organizationDocuments")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.collect();

		const stats = {
			total: documents.length,
			totalSize: 0,
			thisMonth: 0,
			thisWeek: 0,
		};

		const now = Date.now();
		const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
		const monthStart = new Date();
		monthStart.setDate(1);
		monthStart.setHours(0, 0, 0, 0);
		const monthStartTime = monthStart.getTime();

		documents.forEach((doc: OrganizationDocument) => {
			// Count total size (legacy rows may have no fileSize)
			stats.totalSize += doc.fileSize ?? 0;

			// Count this month
			if (doc.uploadedAt >= monthStartTime) {
				stats.thisMonth++;
			}

			// Count this week
			if (doc.uploadedAt >= oneWeekAgo) {
				stats.thisWeek++;
			}
		});

		return stats;
	},
});
