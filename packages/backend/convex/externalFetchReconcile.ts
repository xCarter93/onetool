/**
 * Daily backstop for the two external fetches that can leave a record
 * half-written: BoldSign signed PDFs and inbound email attachments.
 *
 * The pool already retries each job and recovers ones whose container died,
 * so this is not the retry path. It exists for the gap the pool can't close —
 * an `onComplete` that itself failed to land, and rows that predate the
 * durability work. Both leave a record whose state contradicts itself, and
 * both are found without a table scan.
 */
import { internal } from "./_generated/api";
import { internalMutation } from "./lib/triggers";
import { externalIoPool, EXTERNAL_FETCH_RETRY } from "./externalIoPool";
import { notifySignedPdfDownloadFailed } from "./boldsign";

/** A pending attachment older than this has lost its job, not just its turn. */
const STUCK_PENDING_MS = 60 * 60 * 1000; // 1 hour

/** Rows visited per sweep, so one bad day can't blow the mutation's budget. */
const SWEEP_LIMIT = 100;

/**
 * Attachment rows still pending long after their download should have settled.
 * The signed URL Resend hands out lives an hour, so anything older than that
 * has certainly lost its job rather than being slow, and re-enqueueing mints a
 * fresh URL.
 */
export const reconcileStuckAttachments = internalMutation({
	args: {},
	handler: async (ctx) => {
		const cutoff = Date.now() - STUCK_PENDING_MS;
		const stuck = await ctx.db
			.query("emailAttachments")
			.withIndex("by_download_state", (q) => q.eq("downloadState", "pending"))
			.take(SWEEP_LIMIT);

		let requeued = 0;
		for (const row of stuck) {
			if (row.receivedAt > cutoff) continue;

			// Both branches below settle the row rather than skipping it. A row
			// that can never leave "pending" otherwise sits at the head of this
			// bounded window forever, starving out the ones still rescuable.
			if (row.storageId) {
				await ctx.db.patch(row._id, { downloadState: "stored" });
				continue;
			}

			const message = await ctx.db.get(row.emailMessageId);
			if (!message?.resendEmailId || !row.attachmentId) {
				await ctx.db.patch(row._id, {
					downloadState: "failed",
					downloadFailedAt: Date.now(),
					downloadError:
						"The reference needed to fetch this file from Resend is missing.",
				});
				continue;
			}

			await externalIoPool.enqueueAction(
				ctx,
				internal.resendReceiving.downloadAttachmentAction,
				{
					emailId: message.resendEmailId,
					attachmentRowId: row._id,
					attachmentId: row.attachmentId,
					contentType: row.contentType,
				},
				{
					retry: EXTERNAL_FETCH_RETRY,
					onComplete: internal.resendReceiving.onAttachmentDownloadComplete,
					context: { attachmentRowId: row._id },
				}
			);
			requeued++;
		}

		if (requeued > 0) {
			console.warn(
				`[reconcile] re-enqueued ${requeued} stuck attachment download(s)`
			);
		}
	},
});

/**
 * Signed PDFs that gave up without anyone being told. `onComplete` normally
 * notifies on the spot; this catches the case where that mutation failed, and
 * it is the only thing that will ever surface such a document.
 *
 * Dedupe is `notifiedAt` on the document — carried by the index, so notified
 * rows leave the window entirely — never the notification's read state: this
 * predicate stays true until the download succeeds, so keying off unread would
 * re-alert every admin the day after they read the last one.
 */
export const reconcileFailedSignedPdfs = internalMutation({
	args: {},
	handler: async (ctx) => {
		const failed = await ctx.db
			.query("documents")
			.withIndex("by_signed_pdf_unnotified", (q) =>
				q
					.eq("signedPdfDownload.notifiedAt", undefined)
					.gt("signedPdfDownload.failedAt", 0)
			)
			.take(SWEEP_LIMIT);

		let notified = 0;
		for (const document of failed) {
			if (document.signedStorageId) continue; // recovered since

			await notifySignedPdfDownloadFailed(ctx, document._id);
			notified++;
		}

		if (notified > 0) {
			console.warn(
				`[reconcile] surfaced ${notified} signed PDF download failure(s) the completion hook missed`
			);
		}
	},
});
