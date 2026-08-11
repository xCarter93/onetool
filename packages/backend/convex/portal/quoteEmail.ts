// Fire-and-forget "quote is ready" email, scheduled after a quote is sent.
// Modeled on portal/invoiceEmail.ts: an internalAction renders the
// React-Email template and calls resend.sendEmail, with the same
// RESEND_API_KEY==="test-key" guard.
import { internalAction, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { render } from "@react-email/render";
import { resend } from "../resend";
import { QuoteReadyEmail } from "../emails/quoteReady";
import { internal } from "../_generated/api";
import { formatCurrency } from "../lib/money";
import { buildPortalQuoteUrl } from "./quoteUrl";

// Matches portal/email.ts's FROM_ADDRESS domain — display name is the
// business (not "OneTool"), the address stays the shared noreply mailbox.
const NOREPLY_ADDRESS = "noreply@onetool.biz";

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
 * Sends the "quote is ready" email via Resend. Scheduled (fire-and-forget)
 * after a quote is sent to a client — never throws on missing contact/
 * portal data, since a scheduled action has no caller to surface errors to.
 */
export const sendQuoteReadyEmail = internalAction({
	args: { quoteId: v.id("quotes") },
	returns: v.null(),
	handler: async (ctx, { quoteId }): Promise<null> => {
		const data = await ctx.runQuery(
			internal.portal.quoteEmail._loadQuoteEmailData,
			{ quoteId }
		);

		if (!data.ok) {
			console.warn(
				`sendQuoteReadyEmail: skipping send for quote ${quoteId} (${data.reason})`
			);
			return null;
		}

		const portalLink = buildPortalQuoteUrl({
			portalAccessId: data.portalAccessId,
			quoteId,
		});
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
		if (process.env.RESEND_API_KEY === "test-key") {
			if (!isTestEnv) {
				throw new Error(
					"RESEND_API_KEY is set to 'test-key' outside a test runner — " +
						"refusing to silently drop quote-ready emails. Set a real key " +
						"or unset RESEND_API_KEY in this environment."
				);
			}
			return null;
		}

		await resend.sendEmail(ctx, {
			from: `${data.orgName} <${NOREPLY_ADDRESS}>`,
			to: data.contactEmail,
			subject: data.quoteNumber
				? `Quote ${data.quoteNumber} from ${data.orgName}`
				: `New quote from ${data.orgName}`,
			html,
		});

		return null;
	},
});
