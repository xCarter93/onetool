import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserOrgId, getCurrentUserOrThrow } from "./lib/auth";
import { getEntityOrThrow } from "./lib/crud";

/**
 * User Favorites - user-specific client favorites
 *
 * Favorites are scoped to the individual user within an organization.
 * Each user maintains their own list of favorite clients.
 */

/**
 * List user's favorite clients with client details
 * Returns favorites ordered by createdAt DESC (most recent first), limited to 20
 */
export const list = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUserOrThrow(ctx);
		const orgId = await getCurrentUserOrgId(ctx);

		// Get all favorites for this user in this org
		const favorites = await ctx.db
			.query("userFavorites")
			.withIndex("by_user_org", (q) =>
				q.eq("userId", user._id).eq("orgId", orgId)
			)
			.collect();

		// Sort by createdAt DESC (most recent first) and limit to 20
		const sortedFavorites = favorites
			.sort((a, b) => b.createdAt - a.createdAt)
			.slice(0, 20);

		// Fetch client details for each favorite
		const favoritesWithClients = await Promise.all(
			sortedFavorites.map(async (favorite) => {
				const client = await ctx.db.get(favorite.clientId);
				if (!client) return null;
				return {
					_id: favorite._id,
					clientId: favorite.clientId,
					companyName: client.companyName,
					status: client.status,
					createdAt: favorite.createdAt,
				};
			})
		);

		// Filter out any favorites where client was deleted
		return favoritesWithClients.filter(
			(f): f is NonNullable<typeof f> => f !== null
		);
	},
});

/**
 * Check if a specific client is favorited by the current user
 */
export const isFavorited = query({
	args: {
		clientId: v.id("clients"),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);

		const favorite = await ctx.db
			.query("userFavorites")
			.withIndex("by_user_client", (q) =>
				q.eq("userId", user._id).eq("clientId", args.clientId)
			)
			.first();

		return favorite !== null;
	},
});

/**
 * Toggle favorite status for a client
 * If favorited, removes it. If not favorited, adds it.
 * Validates that the client belongs to the user's organization.
 */
export const toggle = mutation({
	args: {
		clientId: v.id("clients"),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);
		const orgId = await getCurrentUserOrgId(ctx);

		// Validate client exists and belongs to user's org
		const client = await getEntityOrThrow(ctx, "clients", args.clientId, "Client");
		if (client.orgId !== orgId) {
			throw new Error("Client not found");
		}

		// Check if already favorited
		const existingFavorite = await ctx.db
			.query("userFavorites")
			.withIndex("by_user_client", (q) =>
				q.eq("userId", user._id).eq("clientId", args.clientId)
			)
			.first();

		if (existingFavorite) {
			// Remove favorite
			await ctx.db.delete(existingFavorite._id);
			return { action: "removed" as const };
		} else {
			// Add favorite
			await ctx.db.insert("userFavorites", {
				userId: user._id,
				orgId,
				clientId: args.clientId,
				createdAt: Date.now(),
			});
			return { action: "added" as const };
		}
	},
});
