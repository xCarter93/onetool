import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./lib/auth";
import { optionalUserQuery, userMutation } from "./lib/factories";

/**
 * Mark the product tour as completed for the current user
 */
export const markTourComplete = userMutation({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new Error("User not authenticated");
		}

		await ctx.db.patch(user._id, { hasSeenTour: true });
		return { success: true };
	},
});

/**
 * Skip the tour without completing it (still marks as seen)
 */
export const skipTour = userMutation({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new Error("User not authenticated");
		}

		await ctx.db.patch(user._id, { hasSeenTour: true });
		return { success: true };
	},
});

/**
 * Check if the current user has seen the tour
 */
export const hasSeenTour = optionalUserQuery({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			return true; // Default to true for unauthenticated users
		}

		return user.hasSeenTour ?? false;
	},
});

/**
 * Reset tour status (for testing/development)
 */
export const resetTourStatus = userMutation({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new Error("User not authenticated");
		}

		await ctx.db.patch(user._id, { hasSeenTour: false });
		return { success: true };
	},
});

