import { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getOptionalOrgId, emptyListResult } from "./lib/queries";
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

/**
 * List Team Communication messages for a specific entity, newest first, with
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
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult<TeamMessageFeedItem>();

		const messages = await ctx.db
			.query("teamMessages")
			.withIndex("by_org_entity", (q) =>
				q
					.eq("orgId", orgId)
					.eq("entityType", args.entityType)
					.eq("entityId", args.entityId)
			)
			.collect();

		const items = await Promise.all(
			messages.map(async (m): Promise<TeamMessageFeedItem> => {
				let authorName = "Automation";
				let authorImageUrl: string | null = null;
				let authorUserId: Id<"users"> | null = null;

				if (m.authorType === "user" && m.authorUserId) {
					const author: Doc<"users"> | null = await ctx.db.get(m.authorUserId);
					if (author) {
						authorUserId = author._id;
						authorName = author.name;
						authorImageUrl = author.image ?? null;
					} else {
						authorName = "Unknown user";
					}
				} else if (m.authorType === "automation" && m.automationId) {
					const automation: Doc<"workflowAutomations"> | null = await ctx.db.get(
						m.automationId
					);
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
