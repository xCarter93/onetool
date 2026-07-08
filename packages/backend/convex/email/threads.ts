import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/** Strip all leading Re:/Fwd:/Fw: prefixes, collapse whitespace, lowercase. */
export function normalizeSubject(subject: string): string {
	return subject
		.replace(/^(\s*(re|fwd|fw)\s*:\s*)+/i, "")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

/**
 * Resolve the emailThreads row for an outbound send: prefer an explicit doc id,
 * then a legacy string threadId lookup, else create a fresh thread. Returns the
 * threadDocId to stamp on the new message.
 */
export async function getOrCreateOutboundThread(
	ctx: MutationCtx,
	args: {
		orgId: Id<"organizations">;
		clientId: Id<"clients"> | null;
		subject: string;
		existingThreadDocId?: Id<"emailThreads">;
		legacyThreadId?: string;
	}
): Promise<Id<"emailThreads">> {
	if (args.existingThreadDocId) return args.existingThreadDocId;

	const legacyThreadId = args.legacyThreadId;
	if (legacyThreadId) {
		const msg = await ctx.db
			.query("emailMessages")
			.withIndex("by_thread", (q) => q.eq("threadId", legacyThreadId))
			.first();
		if (msg?.threadDocId) return msg.threadDocId;
	}

	return await ctx.db.insert("emailThreads", {
		orgId: args.orgId,
		clientId: args.clientId,
		subjectNormalized: normalizeSubject(args.subject),
		rootRfcMessageId: undefined,
		lastMessageAt: Date.now(),
		messageCount: 0,
		unreadCount: 0,
		status: "open",
		participantEmails: [],
	});
}

/** Update thread aggregates after a message is added to it. */
export async function bumpThread(
	ctx: MutationCtx,
	threadDocId: Id<"emailThreads">,
	args: { sentAt: number; participantEmail?: string; incUnread?: boolean }
): Promise<void> {
	const thread = await ctx.db.get(threadDocId);
	if (!thread) return;
	const participantEmails =
		args.participantEmail &&
		!thread.participantEmails.includes(args.participantEmail)
			? [...thread.participantEmails, args.participantEmail]
			: thread.participantEmails;
	await ctx.db.patch(threadDocId, {
		lastMessageAt: Math.max(thread.lastMessageAt, args.sentAt),
		messageCount: thread.messageCount + 1,
		unreadCount: thread.unreadCount + (args.incUnread ? 1 : 0),
		participantEmails,
	});
}
