import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

/**
 * One-shot backfill (Team Communication cutover): copies legacy mention
 * notifications into the `teamMessages` table so pre-cutover history still
 * renders once the feed switches to `teamMessages.listByEntity`.
 *
 * For each `notifications` row of type client_mention / project_mention /
 * quote_mention, inserts one `teamMessages` post:
 *   - authorType "user"; authorUserId parsed from the legacy "{authorId}:{msg}"
 *     composite (omitted when unparseable -> renders "Unknown user").
 *   - message = the RAW message (author prefix stripped).
 *   - entityType derived from the notification type; entityId from the row.
 *   - mentionedUserIds = [notification.userId] (the tagged recipient).
 *   - createdAt = the notification's ORIGINAL _creationTime (preserve order).
 *   - hasAttachments copied through; its messageAttachments rows are re-keyed to
 *     the new teamMessageId (notificationId kept) so the feed still resolves them.
 *
 * Original notification rows are NEVER mutated or deleted (bell history intact).
 *
 * Idempotent — a notification already carrying a `teamMessages` row (looked up
 * via by_migrated_from) is skipped, so re-runs are safe.
 *
 * Cursor-paginated (matches migrations/backfillMemberPermissions.ts): the
 * operator re-invokes with the returned cursor until `isDone`.
 *
 * Operator workflow (post-deploy of the schema change):
 *   1. `npx convex run migrations/backfillTeamMessagesFromNotifications:backfillTeamMessagesFromNotifications`
 *      -> { migrated, alreadyMigrated, skippedNonMention, attachmentsRelinked, examined, dryRun, isDone, cursor }
 *   2. While `isDone === false`, re-invoke with the returned cursor:
 *      `npx convex run migrations/backfillTeamMessagesFromNotifications:backfillTeamMessagesFromNotifications '{"cursor":"<cursor>"}'`
 *   3. `isDone === true` -> the table is fully traversed.
 *
 * `dryRun` returns the proposed counts without writing:
 *   `npx convex run migrations/backfillTeamMessagesFromNotifications:backfillTeamMessagesFromNotifications '{"dryRun":true}'`
 */

const MENTION_TYPE_TO_ENTITY = {
	client_mention: "client",
	project_mention: "project",
	quote_mention: "quote",
} as const;

/** Split the legacy "{authorId}:{message}" composite (mirrors the web strip). */
function parseAuthorComposite(raw: string): {
	authorUserId: Id<"users"> | undefined;
	message: string;
} {
	const colonIndex = raw.indexOf(":");
	if (colonIndex > 0) {
		const prefix = raw.substring(0, colonIndex);
		// Convex ids are long lowercase-alphanumeric; guards against real ":" text.
		if (prefix.length > 20 && /^[a-z0-9]+$/.test(prefix)) {
			return {
				authorUserId: prefix as Id<"users">,
				message: raw.substring(colonIndex + 1),
			};
		}
	}
	return { authorUserId: undefined, message: raw };
}

export const backfillTeamMessagesFromNotifications = internalMutation({
	args: {
		dryRun: v.optional(v.boolean()),
		batchSize: v.optional(v.number()),
		cursor: v.optional(v.union(v.string(), v.null())),
	},
	handler: async (ctx, { dryRun = false, batchSize = 200, cursor = null }) => {
		const page = await ctx.db.query("notifications").paginate({
			cursor,
			numItems: batchSize,
		});

		let migrated = 0;
		let alreadyMigrated = 0;
		let skippedNonMention = 0;
		let attachmentsRelinked = 0;

		for (const notification of page.page) {
			const entityType =
				MENTION_TYPE_TO_ENTITY[
					notification.notificationType as keyof typeof MENTION_TYPE_TO_ENTITY
				];
			// Only the three mention types with a concrete entity are feed history.
			if (!entityType || !notification.entityId) {
				skippedNonMention++;
				continue;
			}

			// Idempotency: skip if this notification already has a migrated post.
			const existing = await ctx.db
				.query("teamMessages")
				.withIndex("by_migrated_from", (q) =>
					q.eq("migratedFromNotificationId", notification._id)
				)
				.first();
			if (existing) {
				alreadyMigrated++;
				continue;
			}

			if (dryRun) {
				migrated++;
				continue;
			}

			const { authorUserId, message } = parseAuthorComposite(
				notification.message
			);
			const hasAttachments = notification.hasAttachments ?? false;

			const teamMessageId = await ctx.db.insert("teamMessages", {
				orgId: notification.orgId,
				entityType,
				entityId: notification.entityId,
				message,
				authorType: "user",
				authorUserId,
				mentionedUserIds: [notification.userId],
				hasAttachments: hasAttachments || undefined,
				createdAt: notification._creationTime, // preserve original timestamp
				migratedFromNotificationId: notification._id,
			});

			// Re-key this notification's attachments onto the new post.
			if (hasAttachments) {
				const attachments = await ctx.db
					.query("messageAttachments")
					.withIndex("by_notification", (q) =>
						q.eq("notificationId", notification._id)
					)
					.collect();
				for (const attachment of attachments) {
					await ctx.db.patch(attachment._id, { teamMessageId });
					attachmentsRelinked++;
				}
			}

			migrated++;
		}

		const result = {
			migrated,
			alreadyMigrated,
			skippedNonMention,
			attachmentsRelinked,
			examined: page.page.length,
			dryRun,
			isDone: page.isDone,
			cursor: page.continueCursor,
		};
		console.log(
			`[backfillTeamMessagesFromNotifications] ${JSON.stringify(result)}`
		);
		return result;
	},
});
