import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId, getCurrentUserOrThrow } from "./lib/auth";
import { StorageHelpers, StorageConfig } from "./lib/storage";

/**
 * Project Document operations
 * Documents uploaded directly to project records
 */

/**
 * Get a project document by ID with organization validation
 */
async function getDocumentWithOrgValidation(
	ctx: QueryCtx | MutationCtx,
	id: Id<"projectDocuments">
): Promise<Doc<"projectDocuments"> | null> {
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
 * Get a project document by ID, throwing if not found
 */
async function getDocumentOrThrow(
	ctx: QueryCtx | MutationCtx,
	id: Id<"projectDocuments">
): Promise<Doc<"projectDocuments">> {
	const document = await getDocumentWithOrgValidation(ctx, id);
	if (!document) {
		throw new Error("Document not found");
	}
	return document;
}

/**
 * Generate a signed upload URL for Convex storage
 */
export const generateUploadUrl = mutation({
	args: {},
	handler: async (ctx) => {
		await getCurrentUserOrThrow(ctx);
		return await ctx.storage.generateUploadUrl();
	},
});

/**
 * Create a new project document record
 */
export const create = mutation({
	args: {
		projectId: v.id("projects"),
		name: v.string(),
		fileName: v.string(),
		fileSize: v.number(),
		mimeType: v.string(),
		storageId: v.id("_storage"),
	},
	handler: async (ctx, args): Promise<Id<"projectDocuments">> => {
		const user = await getCurrentUserOrThrow(ctx);
		const userOrgId = await getCurrentUserOrgId(ctx);

		// Validate project belongs to user's org
		const project = await ctx.db.get(args.projectId);
		if (!project) {
			throw new Error("Project not found");
		}
		if (project.orgId !== userOrgId) {
			throw new Error("Project does not belong to your organization");
		}

		// Validate file metadata
		const validation = StorageHelpers.validateFileMetadata(
			{
				fileName: args.fileName,
				fileSize: args.fileSize,
				mimeType: args.mimeType,
			},
			StorageConfig.ALLOWED_MESSAGE_ATTACHMENT_TYPES
		);
		if (!validation.valid) {
			throw new Error(validation.error);
		}

		return await ctx.db.insert("projectDocuments", {
			orgId: userOrgId,
			projectId: args.projectId,
			name: args.name,
			fileName: args.fileName,
			fileSize: args.fileSize,
			mimeType: args.mimeType,
			storageId: args.storageId,
			uploadedAt: Date.now(),
			uploadedBy: user._id,
		});
	},
});

/**
 * List all documents for a project, sorted newest first
 * Includes download URLs to avoid N+1 query problem
 */
export const listByProject = query({
	args: {
		projectId: v.id("projects"),
	},
	handler: async (ctx, args) => {
		const userOrgId = await getCurrentUserOrgId(ctx, { require: false });
		if (!userOrgId) {
			return [];
		}

		const documents = await ctx.db
			.query("projectDocuments")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();

		// Filter by org and sort newest first
		const filtered = documents
			.filter((d) => d.orgId === userOrgId)
			.sort((a, b) => b.uploadedAt - a.uploadedAt);

		// Fetch download URLs in parallel
		const withUrls = await Promise.all(
			filtered.map(async (doc) => {
				const downloadUrl = await StorageHelpers.getStorageUrl(
					ctx,
					doc.storageId
				);
				return {
					...doc,
					downloadUrl,
				};
			})
		);

		return withUrls;
	},
});

/**
 * Delete a project document (removes from storage and DB)
 */
export const remove = mutation({
	args: { id: v.id("projectDocuments") },
	handler: async (ctx, args): Promise<Id<"projectDocuments">> => {
		const document = await getDocumentOrThrow(ctx, args.id);

		// Delete from storage
		await StorageHelpers.deleteFromStorage(ctx, document.storageId);

		// Delete DB record
		await ctx.db.delete(args.id);

		return args.id;
	},
});
