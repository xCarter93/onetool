// Portal-template "quote is ready" email. Scheduled by quotes.sendToClient
// (template mode): the action renders the React-Email template — react-email
// needs an action, not a mutation — then hands the rendered HTML back to a
// mutation that runs it through the outbound seam, so the send is suppressed,
// deduped and recorded in the client's inbox thread like every other send.
import { internalAction, internalQuery } from "../_generated/server";
import { internalMutation } from "../lib/triggers";
import { v } from "convex/values";
import { render } from "@react-email/render";
import { QuoteReadyEmail } from "../emails/quoteReady";
import { internal } from "../_generated/api";
import { formatCurrency } from "../lib/money";
import { formatEmailFrom } from "../lib/emailFrom";
import { optionalPortalQuoteUrl } from "./quoteUrl";
import { deliverOutbound } from "../email/deliver";
import { outboundAttachmentValidator } from "../email/attachments";
import { resolveFromEmail, resolveReplyToEmail } from "../email/branding";
import { plusTagAddress } from "../email/threads";

type QuoteEmailLookupResult =
	| {
			ok: true;
			quoteNumber?: string;
			title?: string;
			total: number;
			validUntil?: number;
			orgName: string;
			orgLogoUrl?: string;
			orgEmail?: string;
			orgPhone?: string;
			portalAccessId: string;
			contactEmail: string;
			contactName: string;
	  }
	| { ok: false; reason: string };

/**
 * Loads everything sendQuoteReadyEmail needs in one round trip: the quote,
 * its org, and the client's primary contact + portal access id. Actions
 * can't touch ctx.db directly, so this is the ctx.runQuery seam.
 */
export const _loadQuoteEmailData = internalQuery({
	args: { quoteId: v.id("quotes") },
	returns: v.union(
		v.object({
			ok: v.literal(true),
			quoteNumber: v.optional(v.string()),
			title: v.optional(v.string()),
			total: v.number(),
			validUntil: v.optional(v.number()),
			orgName: v.string(),
			orgLogoUrl: v.optional(v.string()),
			orgEmail: v.optional(v.string()),
			orgPhone: v.optional(v.string()),
			portalAccessId: v.string(),
			contactEmail: v.string(),
			contactName: v.string(),
		}),
		v.object({ ok: v.literal(false), reason: v.string() })
	),
	handler: async (ctx, { quoteId }): Promise<QuoteEmailLookupResult> => {
		const quote = await ctx.db.get(quoteId);
		if (!quote) return { ok: false, reason: "quote not found" };
		if (quote.status !== "sent") {
			return { ok: false, reason: `quote status is ${quote.status}` };
		}

		const org = await ctx.db.get(quote.orgId);
		if (!org) return { ok: false, reason: "organization not found" };

		const client = await ctx.db.get(quote.clientId);
		if (!client) return { ok: false, reason: "client not found" };
		if (!client.portalAccessId) {
			return { ok: false, reason: "client has no portalAccessId" };
		}

		const primaryContact = await ctx.db
			.query("clientContacts")
			.withIndex("by_primary", (q) =>
				q.eq("clientId", quote.clientId).eq("isPrimary", true)
			)
			.first();
		if (!primaryContact || !primaryContact.email) {
			return { ok: false, reason: "client has no primary contact email" };
		}

		return {
			ok: true,
			quoteNumber: quote.quoteNumber,
			title: quote.title,
			total: quote.total,
			validUntil: quote.validUntil,
			orgName: org.name,
			orgLogoUrl: org.logoUrl,
			orgEmail: org.email,
			orgPhone: org.phone,
			portalAccessId: client.portalAccessId,
			contactEmail: primaryContact.email,
			contactName: `${primaryContact.firstName} ${primaryContact.lastName}`.trim(),
		};
	},
});

/**
 * Send the rendered template through the outbound seam and record it. Split
 * from the action because sendOutbound is transactional with the row write.
 */
export const _recordQuoteSend = internalMutation({
	args: {
		quoteId: v.id("quotes"),
		threadDocId: v.id("emailThreads"),
		subject: v.string(),
		senderName: v.string(),
		sentBy: v.id("users"),
		to: v.array(v.string()),
		cc: v.optional(v.array(v.string())),
		bcc: v.optional(v.array(v.string())),
		attachments: v.optional(v.array(outboundAttachmentValidator)),
		idempotencyKey: v.optional(v.string()),
		html: v.string(),
		text: v.string(),
		toName: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		const quote = await ctx.db.get(args.quoteId);
		if (!quote) return null;
		const organization = await ctx.db.get(quote.orgId);
		if (!organization) return null;

		const fromEmail = resolveFromEmail(organization);
		await deliverOutbound(ctx, {
			orgId: quote.orgId,
			clientId: quote.clientId,
			threadDocId: args.threadDocId,
			message: {
				from: formatEmailFrom(args.senderName, fromEmail),
				to: args.to,
				cc: args.cc,
				bcc: args.bcc,
				replyTo: [
					plusTagAddress(
						resolveReplyToEmail(organization),
						args.threadDocId
					),
				],
				subject: args.subject,
				html: args.html,
				text: args.text,
				idempotencyKey: args.idempotencyKey,
				attachments: args.attachments,
			},
			record: {
				messageBody: args.text,
				messagePreview: args.text.substring(0, 100),
				fromEmail,
				fromName: args.senderName,
				toName: args.toName,
				sentBy: args.sentBy,
				quoteId: quote._id,
				...(quote.projectId ? { projectId: quote.projectId } : {}),
			},
		});
		return null;
	},
});

/**
 * Renders and sends the portal-template quote email. Scheduled (fire-and-
 * forget) from quotes.sendToClient — never throws on missing contact/portal
 * data, since a scheduled action has no caller to surface errors to.
 */
export const sendQuoteReadyEmail = internalAction({
	args: {
		quoteId: v.id("quotes"),
		threadDocId: v.id("emailThreads"),
		subject: v.string(),
		senderName: v.string(),
		sentBy: v.id("users"),
		to: v.array(v.string()),
		cc: v.optional(v.array(v.string())),
		bcc: v.optional(v.array(v.string())),
		attachments: v.optional(v.array(outboundAttachmentValidator)),
		idempotencyKey: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		const data = await ctx.runQuery(
			internal.portal.quoteEmail._loadQuoteEmailData,
			{ quoteId: args.quoteId }
		);

		if (!data.ok) {
			console.warn(
				`sendQuoteReadyEmail: skipping send for quote ${args.quoteId} (${data.reason})`
			);
			return null;
		}

		const portalLink = optionalPortalQuoteUrl(
			data.portalAccessId,
			args.quoteId
		);
		if (!portalLink) {
			console.warn(
				`sendQuoteReadyEmail: skipping send for quote ${args.quoteId} (portal url unavailable)`
			);
			return null;
		}
		const amountFormatted = formatCurrency(data.total);
		// Stored quoteNumber is already display-formatted ("Q-000042"), so the
		// label is the raw value — see generateNextQuoteNumber in quotes.ts.
		const quoteNumberLabel = data.quoteNumber;
		const validUntilFormatted =
			data.validUntil !== undefined
				? new Date(data.validUntil).toLocaleDateString("en-US", {
						month: "short",
						day: "numeric",
						year: "numeric",
						// validUntil is a UTC-midnight calendar day; format it in UTC so
						// the printed date can't slip a day on a non-UTC runtime.
						timeZone: "UTC",
					})
				: undefined;

		const html = await render(
			QuoteReadyEmail({
				businessName: data.orgName,
				businessLogoUrl: data.orgLogoUrl,
				businessEmail: data.orgEmail,
				businessPhone: data.orgPhone,
				quoteTitle: data.title,
				quoteNumberLabel,
				amountFormatted,
				validUntilFormatted,
				portalUrl: portalLink,
				clientName: data.contactName,
			})
		);

		// [Review fix WR-05, mirrored from portal/email.ts] Resend's test
		// double isn't registered outside a real test runner, so a stray
		// RESEND_API_KEY=test-key in staging/prod must fail loud, not
		// silently drop quote emails.
		const isTestEnv =
			process.env.NODE_ENV === "test" || process.env.VITEST === "true";
		if (process.env.RESEND_API_KEY === "test-key" && !isTestEnv) {
			throw new Error(
				"RESEND_API_KEY is set to 'test-key' outside a test runner — " +
					"refusing to silently drop quote-ready emails. Set a real key " +
					"or unset RESEND_API_KEY in this environment."
			);
		}

		await ctx.runMutation(internal.portal.quoteEmail._recordQuoteSend, {
			quoteId: args.quoteId,
			threadDocId: args.threadDocId,
			subject: args.subject,
			senderName: args.senderName,
			sentBy: args.sentBy,
			to: args.to,
			cc: args.cc,
			bcc: args.bcc,
			attachments: args.attachments,
			idempotencyKey: args.idempotencyKey,
			html,
			text: `${quoteNumberLabel ? `Quote ${quoteNumberLabel}` : "Your quote"} from ${data.orgName} — ${amountFormatted}. Review it here: ${portalLink}`,
			toName: data.contactName,
		});

		return null;
	},
});
