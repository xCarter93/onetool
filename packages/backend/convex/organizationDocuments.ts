import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId, getCurrentUserOrThrow } from "./lib/auth";
import { getOptionalOrgId } from "./lib/queries";
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

/**
 * Get all organization documents
 */
export const list = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<OrganizationDocument[]> => {
		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) {
			return [];
		}

		const documents = await ctx.db
			.query("organizationDocuments")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.collect();

		// Sort by upload time (newest first)
		return documents.sort((a, b) => b.uploadedAt - a.uploadedAt);
	},
});

/**
 * Get a specific document by ID
 */
export const get = optionalUserQuery({
	args: { id: v.id("organizationDocuments") },
	handler: async (ctx, args): Promise<OrganizationDocument | null> => {
		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) {
			return null;
		}
		return await getDocumentWithOrgValidation(ctx, args.id);
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
		fileSize: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<OrganizationDocumentId> => {
		const user = await getCurrentUserOrThrow(ctx);
		const userOrgId = await getCurrentUserOrgId(ctx);

		const documentId = await ctx.db.insert("organizationDocuments", {
			orgId: userOrgId,
			name: args.name,
			description: args.description,
			storageId: args.storageId,
			fileSize: args.fileSize,
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
 * Get document URL from storage
 */
export const getDocumentUrl = optionalUserQuery({
	args: { id: v.id("organizationDocuments") },
	handler: async (ctx, args): Promise<string | null> => {
		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) {
			return null;
		}
		const document = await getDocumentWithOrgValidation(ctx, args.id);

		if (!document) {
			return null;
		}

		// Get storage URL
		return await ctx.storage.getUrl(document.storageId);
	},
});

/**
 * Get multiple document URLs from storage (for PDF merging)
 */
export const getDocumentUrls = optionalUserQuery({
	args: { ids: v.array(v.id("organizationDocuments")) },
	handler: async (
		ctx,
		args
	): Promise<Array<{ id: string; url: string | null }>> => {
		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) {
			return [];
		}

		const results = [];
		for (const id of args.ids) {
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
		return await ctx.storage.generateUploadUrl();
	},
});

/**
 * Get document statistics for the organization
 */
export const getStats = optionalUserQuery({
	args: {},
	handler: async (ctx) => {
		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) {
			return {
				total: 0,
				totalSize: 0,
				thisMonth: 0,
				thisWeek: 0,
			};
		}

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
			// Count total size
			if (doc.fileSize) {
				stats.totalSize += doc.fileSize;
			}

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
