import { internalMutation, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { normalizeSubject } from "../email/threads";

/**
 * Phase 1 backfill: create first-class `emailThreads` rows from existing
 * `emailMessages`, and stamp `threadDocId` + best-effort `rfcMessageId` on
 * each message.
 *
 * To run:
 * 1. Deploy: `cd packages/backend && npx convex deploy`
 * 2. Convex dashboard -> Functions -> run `migrations/backfillEmailThreads:backfillEmailThreads`
 *
 * Idempotent: re-running only touches messages that still lack a `threadDocId`,
 * and reuses an existing thread doc for a group if one message already links to it.
 *
 * Lossy-by-design (documented in the PRD, §3.5/R3): pre-migration messages have
 * no real RFC Message-ID, so `rfcMessageId` is stamped from `resendEmailId` as a
 * placeholder. New mail (post-Phase-3) gets real Message-IDs; old threads read
 * correctly but may mis-group against future header-based matches.
 *
 * Assumes email volume fits one mutation's read/write budget (early-stage table).
 * If the table grows large, chunk by orgId before re-running.
 */

export const backfillEmailThreads = internalMutation({
	args: {},
	handler: async (ctx: MutationCtx) => {
		const messages = await ctx.db.query("emailMessages").collect();

		// Group by (orgId, threadId-or-own-id). Today `threadId` holds the Resend
		// emailId; where it is unset, each message is its own single-message thread.
		const groups = new Map<string, Doc<"emailMessages">[]>();
		for (const m of messages) {
			const key = `${m.orgId}:${m.threadId ?? m._id}`;
			const bucket = groups.get(key);
			if (bucket) bucket.push(m);
			else groups.set(key, [m]);
		}

		let threadsCreated = 0;
		let messagesLinked = 0;

		for (const group of groups.values()) {
			group.sort((a, b) => a.sentAt - b.sentAt);
			const first = group[0];
			const last = group[group.length - 1];

			// Reuse an existing thread doc if a prior run already linked one.
			let threadDocId: Id<"emailThreads"> | undefined = group.find(
				(m) => m.threadDocId
			)?.threadDocId;

			if (!threadDocId) {
				// External counterparty addresses only (inbound sender / outbound
				// recipient) — the live paths never record the org's own address,
				// and the inbox resolves the counterparty from participantEmails[0].
				const participantEmails = Array.from(
					new Set(
						group
							.map((m) =>
								m.direction === "inbound" ? m.fromEmail : m.toEmail
							)
							.filter((e): e is string => Boolean(e))
					)
				);
				const clientId: Id<"clients"> | null =
					group.find((m) => m.clientId)?.clientId ?? null;

				threadDocId = await ctx.db.insert("emailThreads", {
					orgId: first.orgId,
					clientId,
					subjectNormalized: normalizeSubject(first.subject),
					subject: last.subject,
					lastMessagePreview: last.messagePreview,
					lastMessageDirection: last.direction,
					rootRfcMessageId: first.rfcMessageId ?? first.resendEmailId,
					lastMessageAt: last.sentAt,
					messageCount: group.length,
					unreadCount: 0,
					status: "open",
					participantEmails,
				});
				threadsCreated++;
			}

			for (const m of group) {
				const patch: Partial<Doc<"emailMessages">> = {};
				if (!m.threadDocId) patch.threadDocId = threadDocId;
				// Best-effort placeholder: real Message-IDs arrive with Phase 3 inbound.
				if (!m.rfcMessageId) patch.rfcMessageId = m.resendEmailId;
				if (Object.keys(patch).length > 0) {
					await ctx.db.patch(m._id, patch);
					messagesLinked++;
				}
			}
		}

		console.log(
			`backfillEmailThreads: ${threadsCreated} threads created, ${messagesLinked} messages linked (of ${messages.length} total)`
		);
		return {
			threadsCreated,
			messagesLinked,
			totalMessages: messages.length,
		};
	},
});
