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
		// A legacy group can mix linked and pre-migration (unlinked) messages;
		// find ANY linked one — the index-first message may predate the backfill.
		// Then heal the whole group so a later reply to a different old message
		// can't fork the conversation into a second thread row.
		const group = (
			await ctx.db
				.query("emailMessages")
				.withIndex("by_thread", (q) => q.eq("threadId", legacyThreadId))
				.collect()
		).filter((m) => m.orgId === args.orgId);
		const linked = group.find((m) => m.threadDocId)?.threadDocId;
		if (linked) {
			const orphans = group.filter((m) => !m.threadDocId);
			for (const m of orphans) {
				await ctx.db.patch(m._id, { threadDocId: linked });
			}
			// Fold the newly-adopted messages into the thread's aggregates so
			// counts/recency/display fields don't go stale after the heal.
			if (orphans.length > 0) {
				const thread = await ctx.db.get(linked);
				if (thread) {
					const newestOrphan = orphans.reduce((a, b) =>
						a.sentAt >= b.sentAt ? a : b
					);
					const orphanEmails = orphans
						.map((m) => (m.direction === "inbound" ? m.fromEmail : m.toEmail))
						.filter((e): e is string => Boolean(e));
					const isNewest = newestOrphan.sentAt > thread.lastMessageAt;
					await ctx.db.patch(linked, {
						messageCount: thread.messageCount + orphans.length,
						lastMessageAt: Math.max(thread.lastMessageAt, newestOrphan.sentAt),
						participantEmails: Array.from(
							new Set([...thread.participantEmails, ...orphanEmails])
						),
						...(isNewest
							? {
									subject: newestOrphan.subject,
									lastMessagePreview: newestOrphan.messagePreview,
									lastMessageDirection: newestOrphan.direction,
								}
							: {}),
					});
				}
			}
			return linked;
		}
		if (group.length > 0) {
			group.sort((a, b) => a.sentAt - b.sentAt);
			const last = group[group.length - 1];
			const participantEmails = Array.from(
				new Set(
					group
						// external counterparty only — never the org's own address
						.map((m) => (m.direction === "inbound" ? m.fromEmail : m.toEmail))
						.filter((e): e is string => Boolean(e))
				)
			);
			const threadDocId = await ctx.db.insert("emailThreads", {
				orgId: args.orgId,
				clientId: args.clientId,
				subjectNormalized: normalizeSubject(args.subject),
				subject: last.subject,
				lastMessagePreview: last.messagePreview,
				lastMessageDirection: last.direction,
				rootRfcMessageId: group[0].rfcMessageId,
				lastMessageAt: last.sentAt,
				messageCount: group.length,
				unreadCount: 0,
				status: "open",
				participantEmails,
			});
			for (const m of group) {
				await ctx.db.patch(m._id, { threadDocId });
			}
			return threadDocId;
		}
	}

	return await ctx.db.insert("emailThreads", {
		orgId: args.orgId,
		clientId: args.clientId,
		subjectNormalized: normalizeSubject(args.subject),
		subject: args.subject,
		rootRfcMessageId: undefined,
		lastMessageAt: Date.now(),
		messageCount: 0,
		unreadCount: 0,
		status: "open",
		participantEmails: [],
	});
}

/**
 * Update thread aggregates after a message is added to it. When this message is
 * the newest in the thread, the denormalized display fields (subject, preview,
 * direction) are refreshed so the inbox list renders without a per-thread
 * message fetch. An out-of-order (older) message bumps counts but never clobbers
 * the latest-message display fields.
 */
export async function bumpThread(
	ctx: MutationCtx,
	threadDocId: Id<"emailThreads">,
	args: {
		sentAt: number;
		participantEmail?: string;
		incUnread?: boolean;
		subject?: string;
		preview?: string;
		direction?: "inbound" | "outbound";
	}
): Promise<void> {
	const thread = await ctx.db.get(threadDocId);
	if (!thread) return;
	const participantEmails =
		args.participantEmail &&
		!thread.participantEmails.includes(args.participantEmail)
			? [...thread.participantEmails, args.participantEmail]
			: thread.participantEmails;
	const isNewest = args.sentAt >= thread.lastMessageAt;
	await ctx.db.patch(threadDocId, {
		lastMessageAt: Math.max(thread.lastMessageAt, args.sentAt),
		messageCount: thread.messageCount + 1,
		unreadCount: thread.unreadCount + (args.incUnread ? 1 : 0),
		participantEmails,
		...(isNewest && args.subject !== undefined
			? { subject: args.subject }
			: {}),
		...(isNewest && args.preview !== undefined
			? { lastMessagePreview: args.preview }
			: {}),
		...(isNewest && args.direction !== undefined
			? { lastMessageDirection: args.direction }
			: {}),
	});
}

/**
 * Parse a plus-addressed inbound recipient: `org-slug+t<token>@domain` →
 * `{ base: "org-slug@domain", token: "<token>" }`. The token is the
 * threadDocId we stamped on the outbound Reply-To (validated: Resend inbound
 * preserves the +tag in received_for).
 */
export function stripPlusTag(address: string): {
	base: string;
	token: string | null;
} {
	const at = address.indexOf("@");
	if (at < 0) return { base: address, token: null };
	const local = address.slice(0, at);
	const domain = address.slice(at);
	const plus = local.indexOf("+");
	if (plus < 0) return { base: address, token: null };
	const tag = local.slice(plus + 1);
	const base = local.slice(0, plus) + domain;
	const token = tag.startsWith("t") && tag.length > 1 ? tag.slice(1) : null;
	return { base, token };
}

/**
 * Resolve the thread an inbound message belongs to (PRD §3.4), provider-agnostic:
 * (1) plus-token from the recipient address (deterministic for mail we sent),
 * (2) In-Reply-To via by_rfc_message_id, (3) References newest-first,
 * (4) subject-normalized + same participant fallback (never cross-participant),
 * else (5) create a new thread.
 */
/**
 * Find the thread of a message with this RFC Message-ID, constrained to the org.
 * A Message-ID could (rarely) collide across orgs, so we must match on orgId
 * before selecting — never `.first()` then post-filter.
 */
async function findThreadByRfcId(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	rfcMessageId: string
): Promise<Id<"emailThreads"> | null> {
	const matches = await ctx.db
		.query("emailMessages")
		.withIndex("by_rfc_message_id", (q) => q.eq("rfcMessageId", rfcMessageId))
		.collect();
	const m = matches.find((x) => x.orgId === orgId && x.threadDocId);
	return m?.threadDocId ?? null;
}

export async function resolveInboundThread(
	ctx: MutationCtx,
	args: {
		orgId: Id<"organizations">;
		clientId: Id<"clients"> | null;
		plusToken: string | null;
		inReplyTo: string | null;
		references: string[];
		subject: string;
		rfcMessageId: string;
		fromEmail: string;
		receivedAt: number;
	}
): Promise<Id<"emailThreads">> {
	// (1) plus-token
	if (args.plusToken) {
		const tid = ctx.db.normalizeId("emailThreads", args.plusToken);
		if (tid) {
			const t = await ctx.db.get(tid);
			if (t && t.orgId === args.orgId) return t._id;
		}
	}

	// (2) In-Reply-To exact match on a stored RFC Message-ID (org-scoped)
	const inReplyTo = args.inReplyTo;
	if (inReplyTo) {
		const t = await findThreadByRfcId(ctx, args.orgId, inReplyTo);
		if (t) return t;
	}

	// (3) References chain, newest first (org-scoped)
	for (let i = args.references.length - 1; i >= 0; i--) {
		const t = await findThreadByRfcId(ctx, args.orgId, args.references[i]);
		if (t) return t;
	}

	// (4) subject-normalized + same participant, recent (never cross-participant)
	const normSubject = normalizeSubject(args.subject);
	const recent = await ctx.db
		.query("emailThreads")
		.withIndex("by_org_last_message", (q) => q.eq("orgId", args.orgId))
		.order("desc")
		.take(50);
	const match = recent.find(
		(t) =>
			t.subjectNormalized === normSubject &&
			t.participantEmails.includes(args.fromEmail)
	);
	if (match) return match._id;

	// (5) new thread
	return await ctx.db.insert("emailThreads", {
		orgId: args.orgId,
		clientId: args.clientId,
		subjectNormalized: normSubject,
		subject: args.subject,
		rootRfcMessageId: args.rfcMessageId,
		lastMessageAt: args.receivedAt,
		messageCount: 0,
		unreadCount: 0,
		status: "open",
		participantEmails: [],
	});
}

/**
 * Build a plus-addressed Reply-To that carries the thread id, so replies route
 * back deterministically: `org-slug@domain` -> `org-slug+t<threadDocId>@domain`.
 * (Validated: Resend inbound preserves the +tag in received_for.)
 */
export function plusTagAddress(
	baseAddress: string,
	threadDocId: string
): string {
	const at = baseAddress.indexOf("@");
	if (at < 0) return baseAddress;
	return `${baseAddress.slice(0, at)}+t${threadDocId}${baseAddress.slice(at)}`;
}
