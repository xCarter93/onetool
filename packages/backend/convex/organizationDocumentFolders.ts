import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { optionalUserQuery, userMutation } from "./lib/factories";
import type { UserMutationCtx, UserQueryCtx } from "./lib/factories";

/**
 * Organization document folders — the drive-explorer tree over
 * `organizationDocuments`. Folders carry no storage of their own; documents
 * point at them via `folderId` (undefined = root).
 */

type Folder = Doc<"organizationDocumentFolders">;
type FolderId = Id<"organizationDocumentFolders">;

const MAX_FOLDER_NAME_LENGTH = 120;

function normalizeName(raw: string): string {
	const name = raw.trim();
	if (name.length === 0) {
		throw new Error("Folder name is required");
	}
	if (name.length > MAX_FOLDER_NAME_LENGTH) {
		throw new Error(
			`Folder name must be ${MAX_FOLDER_NAME_LENGTH} characters or fewer`
		);
	}
	return name;
}

/** Direct children of `parentId` (undefined = root level). */
async function childFolders(
	ctx: UserQueryCtx | UserMutationCtx,
	orgId: Id<"organizations">,
	parentId: FolderId | undefined
): Promise<Folder[]> {
	return await ctx.db
		.query("organizationDocumentFolders")
		.withIndex("by_org_parent", (q) =>
			q.eq("orgId", orgId).eq("parentId", parentId)
		)
		.collect();
}

/** Folder + every descendant, breadth-first. */
async function collectSubtree(
	ctx: UserQueryCtx | UserMutationCtx,
	orgId: Id<"organizations">,
	rootId: FolderId
): Promise<FolderId[]> {
	const all: FolderId[] = [rootId];
	const queue: FolderId[] = [rootId];
	while (queue.length > 0) {
		const current = queue.shift()!;
		const children = await childFolders(ctx, orgId, current);
		for (const child of children) {
			all.push(child._id);
			queue.push(child._id);
		}
	}
	return all;
}

/**
 * All folders for the organization. The client builds the tree.
 */
export const list = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<Folder[]> => {
		const orgId = ctx.orgId;
		if (!orgId) {
			return [];
		}
		await ctx.requireLevel("orgDocuments", "view");

		const folders = await ctx.db
			.query("organizationDocumentFolders")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		return folders.sort((a, b) => a.name.localeCompare(b.name));
	},
});

/**
 * Create a folder, optionally nested under an existing org folder.
 */
export const create = userMutation({
	args: {
		name: v.string(),
		parentId: v.optional(v.id("organizationDocumentFolders")),
	},
	handler: async (ctx, args): Promise<FolderId> => {
		await ctx.requireLevel("orgDocuments", "modify");
		const name = normalizeName(args.name);

		if (args.parentId) {
			await ctx.orgEntity("organizationDocumentFolders", args.parentId);
		}

		return await ctx.db.insert("organizationDocumentFolders", {
			orgId: ctx.orgId,
			name,
			parentId: args.parentId,
			createdAt: Date.now(),
			createdBy: ctx.user._id,
		});
	},
});

/**
 * Rename a folder.
 */
export const rename = userMutation({
	args: { id: v.id("organizationDocumentFolders"), name: v.string() },
	handler: async (ctx, args): Promise<FolderId> => {
		await ctx.requireLevel("orgDocuments", "modify");
		const name = normalizeName(args.name);
		await ctx.orgEntity("organizationDocumentFolders", args.id);

		await ctx.db.patch(args.id, { name });
		return args.id;
	},
});

/**
 * Move a folder under a new parent (undefined = root). Rejects cycles.
 */
export const move = userMutation({
	args: {
		id: v.id("organizationDocumentFolders"),
		parentId: v.optional(v.id("organizationDocumentFolders")),
	},
	handler: async (ctx, args): Promise<FolderId> => {
		await ctx.requireLevel("orgDocuments", "modify");
		await ctx.orgEntity("organizationDocumentFolders", args.id);

		if (args.parentId) {
			if (args.parentId === args.id) {
				throw new Error("A folder cannot be moved into itself");
			}
			// Walk the target's ancestor chain — hitting `id` means a cycle.
			let cursor: FolderId | undefined = args.parentId;
			while (cursor) {
				const ancestor: Folder = (await ctx.orgEntity(
					"organizationDocumentFolders",
					cursor
				))!;
				if (ancestor._id === args.id) {
					throw new Error("A folder cannot be moved into its own subtree");
				}
				cursor = ancestor.parentId;
			}
		}

		await ctx.db.patch(args.id, { parentId: args.parentId });
		return args.id;
	},
});

/**
 * What a recursive delete of this folder would remove — powers the confirm
 * dialog. Counts include the folder itself.
 */
export const getDeleteImpact = optionalUserQuery({
	args: { id: v.id("organizationDocumentFolders") },
	handler: async (
		ctx,
		args
	): Promise<{ folderCount: number; documentCount: number }> => {
		const orgId = ctx.orgId;
		if (!orgId) {
			return { folderCount: 0, documentCount: 0 };
		}
		await ctx.requireLevel("orgDocuments", "view");
		await ctx.orgEntity("organizationDocumentFolders", args.id);

		const folderIds = await collectSubtree(ctx, orgId, args.id);

		let documentCount = 0;
		for (const folderId of folderIds) {
			const docs = await ctx.db
				.query("organizationDocuments")
				.withIndex("by_org_folder", (q) =>
					q.eq("orgId", orgId).eq("folderId", folderId)
				)
				.collect();
			documentCount += docs.length;
		}

		return { folderCount: folderIds.length, documentCount };
	},
});

/**
 * Recursively delete a folder: all descendant folders, every document inside
 * them, and each document's stored blob (best effort).
 */
export const remove = userMutation({
	args: { id: v.id("organizationDocumentFolders") },
	handler: async (
		ctx,
		args
	): Promise<{ folderCount: number; documentCount: number }> => {
		await ctx.requireLevel("orgDocuments", "delete");
		await ctx.orgEntity("organizationDocumentFolders", args.id);

		const orgId = ctx.orgId;
		const folderIds = await collectSubtree(ctx, orgId, args.id);

		let documentCount = 0;
		for (const folderId of folderIds) {
			const docs = await ctx.db
				.query("organizationDocuments")
				.withIndex("by_org_folder", (q) =>
					q.eq("orgId", orgId).eq("folderId", folderId)
				)
				.collect();
			for (const doc of docs) {
				try {
					await ctx.storage.delete(doc.storageId);
				} catch (error) {
					console.warn(`Failed to delete file from storage: ${error}`);
				}
				await ctx.db.delete(doc._id);
				documentCount++;
			}
		}

		// Deepest-first so no row briefly points at a deleted parent.
		for (const folderId of [...folderIds].reverse()) {
			await ctx.db.delete(folderId);
		}

		return { folderCount: folderIds.length, documentCount };
	},
});
