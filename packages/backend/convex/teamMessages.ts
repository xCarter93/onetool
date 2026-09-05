import { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { emptyListResult } from "./lib/queries";
import { optionalUserQuery } from "./lib/factories";

/**
 * Team Communication messages.
 *
 * Go-forward home for the Team Communication feed shown on client/project/quote
 * detail pages. Both the human mention write path (notifications.createMention)
 * and the automation send_team_message action write rows here. Bell
 * notifications continue to live in the `notifications` table.
 */

type TeamMessageEntityType = "client" | "project" | "quote";

/** Normalized feed row the frontend renders (author already resolved). */
export type TeamMessageFeedItem = {
	_id: Id<"teamMessages">;
	message: string;
	createdAt: number;
	authorType: "user" | "automation";
	authorUserId: Id<"users"> | null;
	authorName: string;
	authorImageUrl: string | null;
	mentionedUserIds: Id<"users">[];
	hasAttachments: boolean;
	source: "teamMessage";
};

/**
 * Insert a team message row. Plain helper (not a Convex function) so both the
 * human write path and the automation executor can call it inside their own
 * mutation transaction — mirrors how those callers write `notifications` rows
 * inline via ctx.db.insert.
 */
export async function insertTeamMessage(
	ctx: MutationCtx,
	args: {
		orgId: Id<"organizations">;
		entityType: TeamMessageEntityType;
		entityId: string;
		message: string;
		authorType: "user" | "automation";
		authorUserId?: Id<"users">;
		automationId?: Id<"workflowAutomations">;
		mentionedUserIds?: Id<"users">[];
		hasAttachments?: boolean;
	}
): Promise<Id<"teamMessages">> {
	return await ctx.db.insert("teamMessages", {
		orgId: args.orgId,
		entityType: args.entityType,
		entityId: args.entityId,
		message: args.message,
		authorType: args.authorType,
		authorUserId: args.authorUserId,
		automationId: args.automationId,
		mentionedUserIds:
			args.mentionedUserIds && args.mentionedUserIds.length > 0
				? args.mentionedUserIds
				: undefined,
		hasAttachments: args.hasAttachments || undefined,
		createdAt: Date.now(),
	});
}

// Feed is capped to the newest N by createdAt (by_org_entity index's trailing field).
const TEAM_MESSAGE_FEED_LIMIT = 200;

/**
 * List the newest 200 Team Communication messages for a specific entity, with
 * author identity resolved for rendering.
 */
export const listByEntity = optionalUserQuery({
	args: {
		entityType: v.union(
			v.literal("client"),
			v.literal("project"),
			v.literal("quote")
		),
		entityId: v.string(),
	},
	handler: async (ctx, args): Promise<TeamMessageFeedItem[]> => {
		const orgId = ctx.orgId;
		if (!orgId) return emptyListResult<TeamMessageFeedItem>();

		// Team chat follows the parent entity's view grant (as messageAttachments does).
		const entityObject = (
			{ client: "clients", project: "projects", quote: "quotes" } as const
		)[args.entityType];
		if (!(await ctx.gateRead(entityObject))) {
			return emptyListResult<TeamMessageFeedItem>();
		}

		const messages = await ctx.db
			.query("teamMessages")
			.withIndex("by_org_entity", (q) =>
				q
					.eq("orgId", orgId)
					.eq("entityType", args.entityType)
					.eq("entityId", args.entityId)
			)
			.order("desc")
			.take(TEAM_MESSAGE_FEED_LIMIT);

		// A feed page repeats a few authors across many rows, and an automation
		// doc carries its whole node graph — resolve each distinct id once.
		const userCache = new Map<Id<"users">, Promise<Doc<"users"> | null>>();
		const automationCache = new Map<
			Id<"workflowAutomations">,
			Promise<Doc<"workflowAutomations"> | null>
		>();
		const getUser = (id: Id<"users">) => {
			const cached = userCache.get(id);
			if (cached) return cached;
			const pending = ctx.db.get(id);
			userCache.set(id, pending);
			return pending;
		};
		const getAutomation = (id: Id<"workflowAutomations">) => {
			const cached = automationCache.get(id);
			if (cached) return cached;
			const pending = ctx.db.get(id);
			automationCache.set(id, pending);
			return pending;
		};

		const items = await Promise.all(
			messages.map(async (m): Promise<TeamMessageFeedItem> => {
				let authorName = "Automation";
				let authorImageUrl: string | null = null;
				let authorUserId: Id<"users"> | null = null;

				if (m.authorType === "user" && m.authorUserId) {
					const author: Doc<"users"> | null = await getUser(m.authorUserId);
					if (author) {
						authorUserId = author._id;
						authorName = author.name;
						authorImageUrl = author.image ?? null;
					} else {
						authorName = "Unknown user";
					}
				} else if (m.authorType === "automation" && m.automationId) {
					const automation: Doc<"workflowAutomations"> | null =
						await getAutomation(m.automationId);
					authorName = automation?.name ?? "Automation";
				}

				return {
					_id: m._id,
					message: m.message,
					createdAt: m.createdAt,
					authorType: m.authorType,
					authorUserId,
					authorName,
					authorImageUrl,
					mentionedUserIds: m.mentionedUserIds ?? [],
					hasAttachments: m.hasAttachments ?? false,
					source: "teamMessage",
				};
			})
		);

		return items.sort((a, b) => b.createdAt - a.createdAt);
	},
});
