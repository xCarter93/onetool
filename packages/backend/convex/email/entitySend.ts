// Shared argument shape and recipient handling for the quote/invoice compose
// modal. Quotes and invoices differ in their status/meter rules but resolve
// recipients, attachments and suppression identically.
import { ConvexError, v } from "convex/values";
import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { isSuppressed } from "./suppressions";
import { outboundAttachmentValidator } from "./attachments";

/** Resend's own per-message recipient ceiling. */
const MAX_RECIPIENTS = 50;

/**
 * Optional compose arguments layered onto quotes/invoices `sendToClient`.
 * Every one is optional so the pre-modal call shape — `{ id }` from mobile —
 * still means "send the portal template to the primary contact".
 */
export const entitySendArgs = {
	mode: v.optional(v.union(v.literal("template"), v.literal("custom"))),
	subject: v.optional(v.string()),
	/** Composer HTML for custom mode; sanitized server-side. */
	html: v.optional(v.string()),
	to: v.optional(v.array(v.string())),
	cc: v.optional(v.array(v.string())),
	bcc: v.optional(v.array(v.string())),
	attachments: v.optional(v.array(outboundAttachmentValidator)),
	/** Client-supplied dedup key; a retry with the same value is a no-op. */
	requestId: v.optional(v.string()),
};

function normalize(addresses: string[] | undefined): string[] {
	if (!addresses) return [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of addresses) {
		const address = raw.trim();
		const key = address.toLowerCase();
		if (!address.includes("@") || seen.has(key)) continue;
		seen.add(key);
		out.push(address);
	}
	return out;
}

/**
 * Resolve the three recipient lines, defaulting `to` to the client's primary
 * contact. cc/bcc never silently duplicate an address already on `to`.
 */
export function resolveRecipients(
	args: { to?: string[]; cc?: string[]; bcc?: string[] },
	fallbackTo: string
): { to: string[]; cc: string[]; bcc: string[] } {
	const to = normalize(args.to);
	// An explicit-but-invalid to list must not silently reroute to the primary contact.
	if (args.to && args.to.length > 0 && to.length === 0) {
		throw new ConvexError({
			code: "BAD_REQUEST",
			message: "No valid recipient address was provided.",
		});
	}
	const resolvedTo = to.length > 0 ? to : [fallbackTo];
	const taken = new Set(resolvedTo.map((a) => a.toLowerCase()));

	const dedupe = (addresses: string[] | undefined): string[] =>
		normalize(addresses).filter((a) => {
			const key = a.toLowerCase();
			if (taken.has(key)) return false;
			taken.add(key);
			return true;
		});

	const cc = dedupe(args.cc);
	const bcc = dedupe(args.bcc);

	if (resolvedTo.length + cc.length + bcc.length > MAX_RECIPIENTS) {
		throw new ConvexError({
			code: "CONFLICT",
			message: `An email can go to at most ${MAX_RECIPIENTS} recipients.`,
		});
	}

	return { to: resolvedTo, cc, bcc };
}

/**
 * Block the send before any status flip when a recipient is suppressed.
 * sendOutbound re-checks, but only the throw reaches the compose modal.
 */
export async function assertNoSuppressedRecipients(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	addresses: string[]
): Promise<void> {
	for (const address of addresses) {
		if (await isSuppressed(ctx, orgId, address)) {
			throw new ConvexError({
				code: "RECIPIENT_SUPPRESSED",
				message: `${address} can't receive email — a previous message hard-bounced or was marked as spam.`,
			});
		}
	}
}
