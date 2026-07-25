import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { getCurrentUserOrThrow, getCurrentUserOrgId } from "./lib/auth";
import { SERVER_EVENTS, trackServerEvent } from "./lib/posthog";

/**
 * Record client-side Mapbox usage (mobile geocoding today; only "geocoding"
 * is client-callable — server-side services are captured directly in
 * routingActions.ts).
 */
export const trackMapboxUsage = mutation({
	args: {
		service: v.union(v.literal("geocoding")),
		count: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		const user = await getCurrentUserOrThrow(ctx);
		const orgId = await getCurrentUserOrgId(ctx);
		const count = Math.min(100, Math.max(1, Math.round(args.count)));

		await trackServerEvent(ctx, {
			event: SERVER_EVENTS.MAPBOX_API_REQUEST,
			orgId,
			actorUserId: user._id,
			properties: { service: args.service, count, platform: "mobile" },
		});
		return null;
	},
});
