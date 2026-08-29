// Attachment transport. The durable @convex-dev/resend component's sendEmail
// has no attachments option, so attachment-bearing sends go through
// `sendEmailManually`: the component still registers the email (keeping status
// tracking and the onEmailEvent -> resendWebhook pipeline intact) while the
// callback calls the raw SDK with the blobs. Default runtime — the SDK and
// btoa both work there (see resendReceiving.ts).
import { internalAction, internalQuery } from "../_generated/server";
import { internalMutation } from "../lib/triggers";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { resend } from "./durableResend";
import { getResendClient } from "../lib/resendClient";
import { MAX_ATTACHMENT_BYTES } from "./attachments";
import { isSuppressed } from "./suppressions";

/** Chunked so a multi-MB blob can't blow the argument limit of `apply`. */
function toBase64(bytes: Uint8Array): string {
	const CHUNK = 0x8000;
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += CHUNK) {
		binary += String.fromCharCode(
			...bytes.subarray(offset, offset + CHUNK)
		);
	}
	return btoa(binary);
}

export const _loadAttachments = internalQuery({
	args: { emailMessageId: v.id("emailMessages") },
	returns: v.array(
		v.object({
			storageId: v.id("_storage"),
			filename: v.string(),
			contentType: v.string(),
			size: v.number(),
		})
	),
	handler: async (ctx, args) => {
		const rows = await ctx.db
			.query("emailAttachments")
			.withIndex("by_email", (q) =>
				q.eq("emailMessageId", args.emailMessageId)
			)
			.collect();
		return rows
			.filter((row) => row.direction === "outbound" && row.storageId)
			.map((row) => ({
				storageId: row.storageId!,
				filename: row.filename,
				contentType: row.contentType,
				size: row.size,
			}));
	},
});

export const _hasSuppressedRecipient = internalQuery({
	args: {
		orgId: v.id("organizations"),
		to: v.array(v.string()),
		cc: v.optional(v.array(v.string())),
		bcc: v.optional(v.array(v.string())),
	},
	returns: v.boolean(),
	handler: async (ctx, args) => {
		for (const address of [...args.to, ...(args.cc ?? []), ...(args.bcc ?? [])]) {
			if (await isSuppressed(ctx, args.orgId, address)) return true;
		}
		return false;
	},
});

export const _markSent = internalMutation({
	args: {
		emailMessageId: v.id("emailMessages"),
		resendEmailId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.patch(args.emailMessageId, {
			resendEmailId: args.resendEmailId,
		});
		return null;
	},
});

export const _markFailed = internalMutation({
	args: { emailMessageId: v.id("emailMessages") },
	returns: v.null(),
	handler: async (ctx, args) => {
		// A scheduled action gets no retry, so a failed send must not sit in the
		// inbox as "sent" with an empty provider id forever.
		await ctx.db.patch(args.emailMessageId, {
			status: "failed",
			failedAt: Date.now(),
		});
		return null;
	},
});

/**
 * Deliver a message whose emailMessages row (and attachment rows) are already
 * written, then stamp the component email id the delivery webhook correlates
 * on. Scheduled from recordOutboundAttachments.
 */
export const deliver = internalAction({
	args: {
		emailMessageId: v.id("emailMessages"),
		orgId: v.id("organizations"),
		from: v.string(),
		to: v.array(v.string()),
		cc: v.optional(v.array(v.string())),
		bcc: v.optional(v.array(v.string())),
		replyTo: v.optional(v.array(v.string())),
		subject: v.string(),
		html: v.string(),
		text: v.optional(v.string()),
		inReplyTo: v.optional(v.string()),
		references: v.optional(v.array(v.string())),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		// [Mirrors portal/quoteEmail.ts] The Resend test double isn't registered
		// outside a test runner, so a stray test-key in staging/prod must fail
		// loud rather than silently drop attachment sends.
		const isTestEnv =
			process.env.NODE_ENV === "test" || process.env.VITEST === "true";
		if (process.env.RESEND_API_KEY === "test-key") {
			if (!isTestEnv) {
				throw new Error(
					"RESEND_API_KEY is set to 'test-key' outside a test runner — " +
						"refusing to silently drop attachment emails. Set a real key " +
						"or unset RESEND_API_KEY in this environment."
				);
			}
			return null;
		}

		try {
			const rows = await ctx.runQuery(
				internal.email.attachmentSend._loadAttachments,
				{ emailMessageId: args.emailMessageId }
			);
			if (rows.length === 0) {
				throw new Error("No stored attachments for this message");
			}

			const total = rows.reduce((sum, row) => sum + row.size, 0);
			if (total > MAX_ATTACHMENT_BYTES) {
				throw new Error(
					`Attachments total ${total} bytes, over the ${MAX_ATTACHMENT_BYTES} byte limit`
				);
			}

			const attachments: {
				filename: string;
				content: string;
				contentType: string;
			}[] = [];
			for (const row of rows) {
				const blob = await ctx.storage.get(row.storageId);
				if (!blob) {
					throw new Error(`Attachment blob missing: ${row.filename}`);
				}
				attachments.push({
					filename: row.filename,
					content: toBase64(new Uint8Array(await blob.arrayBuffer())),
					contentType: row.contentType,
				});
			}

			const rfcHeaders: Record<string, string> = {};
			if (args.inReplyTo) rfcHeaders["In-Reply-To"] = args.inReplyTo;
			if (args.references && args.references.length > 0) {
				rfcHeaders["References"] = args.references.join(" ");
			}
			const headerList = Object.entries(rfcHeaders).map(([name, value]) => ({
				name,
				value,
			}));

			const componentEmailId = await resend.sendEmailManually(
				ctx,
				{
					from: args.from,
					to: args.to,
					...(args.cc && args.cc.length > 0 ? { cc: args.cc } : {}),
					...(args.bcc && args.bcc.length > 0 ? { bcc: args.bcc } : {}),
					subject: args.subject,
					...(args.replyTo && args.replyTo.length > 0
						? { replyTo: args.replyTo }
						: {}),
					...(headerList.length > 0 ? { headers: headerList } : {}),
				},
				async (emailId) => {
					const suppressed = await ctx.runQuery(
						internal.email.attachmentSend._hasSuppressedRecipient,
						{
							orgId: args.orgId,
							to: args.to,
							cc: args.cc,
							bcc: args.bcc,
						}
					);
					if (suppressed) {
						throw new Error("A recipient was suppressed before delivery.");
					}
					const { data, error } = await getResendClient().emails.send(
						{
							from: args.from,
							to: args.to,
							...(args.cc && args.cc.length > 0 ? { cc: args.cc } : {}),
							...(args.bcc && args.bcc.length > 0 ? { bcc: args.bcc } : {}),
							subject: args.subject,
							html: args.html,
							...(args.text ? { text: args.text } : {}),
							...(args.replyTo && args.replyTo.length > 0
								? { replyTo: args.replyTo }
								: {}),
							...(headerList.length > 0 ? { headers: rfcHeaders } : {}),
							attachments,
						},
						// The component-issued id doubles as the provider idempotency
						// key, so a replay of this action can't double-send.
						{ idempotencyKey: emailId }
					);
					if (error || !data) {
						throw new Error(error?.message ?? "Resend returned no email id");
					}
					return data.id;
				}
			);

			// The delivery webhook correlates on the COMPONENT id, not Resend's.
			await ctx.runMutation(internal.email.attachmentSend._markSent, {
				emailMessageId: args.emailMessageId,
				resendEmailId: componentEmailId,
			});
		} catch (error) {
			console.error(
				`email.attachmentSend.deliver failed for ${args.emailMessageId}:`,
				error
			);
			await ctx.runMutation(internal.email.attachmentSend._markFailed, {
				emailMessageId: args.emailMessageId,
			});
		}
		return null;
	},
});
