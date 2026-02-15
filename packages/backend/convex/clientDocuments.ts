import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId, getCurrentUserOrThrow } from "./lib/auth";
import {
	StorageHelpers,
	StorageConfig,
} from "./lib/storage";

/**
 * Client Document operations
 * Documents uploaded directly to client records
 */

/**
 * Get a client document by ID with organization validation
 */
async function getDocumentWithOrgValidation(
	ctx: QueryCtx | MutationCtx,
	id: Id<"clientDocuments">
): Promise<Doc<"clientDocuments"> | null> {
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
 * Get a client document by ID, throwing if not found
 */
async function getDocumentOrThrow(
	ctx: QueryCtx | MutationCtx,
	id: Id<"clientDocuments">
): Promise<Doc<"clientDocuments">> {
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
 * Create a new client document record
 */
export const create = mutation({
	args: {
		clientId: v.id("clients"),
		name: v.string(),
		fileName: v.string(),
		fileSize: v.number(),
		mimeType: v.string(),
		storageId: v.id("_storage"),
	},
	handler: async (ctx, args): Promise<Id<"clientDocuments">> => {
		const user = await getCurrentUserOrThrow(ctx);
		const userOrgId = await getCurrentUserOrgId(ctx);

		// Validate client belongs to user's org
		const client = await ctx.db.get(args.clientId);
		if (!client) {
			throw new Error("Client not found");
		}
		if (client.orgId !== userOrgId) {
			throw new Error("Client does not belong to your organization");
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

		return await ctx.db.insert("clientDocuments", {
			orgId: userOrgId,
			clientId: args.clientId,
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
 * List all documents for a client, sorted newest first
 * Includes download URLs to avoid N+1 query problem
 */
export const listByClient = query({
	args: {
		clientId: v.id("clients"),
	},
	handler: async (ctx, args) => {
		const userOrgId = await getCurrentUserOrgId(ctx, { require: false });
		if (!userOrgId) {
			return [];
		}

		const documents = await ctx.db
			.query("clientDocuments")
			.withIndex("by_client", (q) => q.eq("clientId", args.clientId))
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
 * Delete a client document (removes from storage and DB)
 */
export const remove = mutation({
	args: { id: v.id("clientDocuments") },
	handler: async (ctx, args): Promise<Id<"clientDocuments">> => {
		const document = await getDocumentOrThrow(ctx, args.id);

		// Delete from storage
		await StorageHelpers.deleteFromStorage(ctx, document.storageId);

		// Delete DB record
		await ctx.db.delete(args.id);

		return args.id;
	},
});
