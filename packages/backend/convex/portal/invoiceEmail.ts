// Portal-template "invoice is ready" email. Scheduled by
// invoices.sendToClient (template mode): the action renders the React-Email
// template — react-email needs an action, not a mutation — then hands the
// rendered HTML back to a mutation that runs it through the outbound seam, so
// the send is suppressed, deduped and recorded in the client's inbox thread
// like every other send.
import { internalAction, internalQuery } from "../_generated/server";
import { internalMutation } from "../lib/triggers";
import { v } from "convex/values";
import { render } from "@react-email/render";
import { InvoiceReadyEmail } from "../emails/invoiceReady";
import { internal } from "../_generated/api";
import { formatCurrency } from "../lib/money";
import { formatEmailFrom } from "../lib/emailFrom";
import { optionalPortalInvoiceUrl } from "./invoiceUrl";
import { deliverOutbound } from "../email/deliver";
import { outboundAttachmentValidator } from "../email/attachments";
import { resolveFromEmail, resolveReplyToEmail } from "../email/branding";
import { plusTagAddress } from "../email/threads";

type InvoiceEmailLookupResult =
	| {
			ok: true;
			invoiceNumber: string;
			total: number;
			dueDate: number;
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
 * Loads everything sendInvoiceReadyEmail needs in one round trip: the
 * invoice, its org, and the client's primary contact + portal access id.
 * Actions can't touch ctx.db directly, so this is the ctx.runQuery seam.
 */
export const _loadInvoiceEmailData = internalQuery({
	args: { invoiceId: v.id("invoices") },
	returns: v.union(
		v.object({
			ok: v.literal(true),
			invoiceNumber: v.string(),
			total: v.number(),
			dueDate: v.number(),
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
	handler: async (ctx, { invoiceId }): Promise<InvoiceEmailLookupResult> => {
		const invoice = await ctx.db.get(invoiceId);
		if (!invoice) return { ok: false, reason: "invoice not found" };
		if (invoice.status !== "sent" && invoice.status !== "overdue") {
			return { ok: false, reason: `invoice status is ${invoice.status}` };
		}

		const org = await ctx.db.get(invoice.orgId);
		if (!org) return { ok: false, reason: "organization not found" };

		const client = await ctx.db.get(invoice.clientId);
		if (!client) return { ok: false, reason: "client not found" };
		if (!client.portalAccessId) {
			return { ok: false, reason: "client has no portalAccessId" };
		}

		const primaryContact = await ctx.db
			.query("clientContacts")
			.withIndex("by_primary", (q) =>
				q.eq("clientId", invoice.clientId).eq("isPrimary", true)
			)
			.first();
		if (!primaryContact || !primaryContact.email) {
			return { ok: false, reason: "client has no primary contact email" };
		}

		return {
			ok: true,
			invoiceNumber: invoice.invoiceNumber,
			total: invoice.total,
			dueDate: invoice.dueDate,
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
export const _recordInvoiceSend = internalMutation({
	args: {
		invoiceId: v.id("invoices"),
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
		const invoice = await ctx.db.get(args.invoiceId);
		if (!invoice) return null;
		const organization = await ctx.db.get(invoice.orgId);
		if (!organization) return null;

		const fromEmail = resolveFromEmail(organization);
		await deliverOutbound(ctx, {
			orgId: invoice.orgId,
			clientId: invoice.clientId,
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
				invoiceId: invoice._id,
				...(invoice.projectId ? { projectId: invoice.projectId } : {}),
			},
		});
		return null;
	},
});

/**
 * Renders and sends the portal-template invoice email. Scheduled (fire-and-
 * forget) from invoices.sendToClient — never throws on missing contact/portal
 * data, since a scheduled action has no caller to surface errors to.
 */
export const sendInvoiceReadyEmail = internalAction({
	args: {
		invoiceId: v.id("invoices"),
		threadDocId: v.id("emailThreads"),
		subject: v.string(),
		senderName: v.string(),
		sentBy: v.id("users"),
		to: v.array(v.string()),
		cc: v.optional(v.array(v.string())),
		bcc: v.optional(v.array(v.string())),
		attachments: v.optional(v.array(outboundAttachmentValidator)),
		idempotencyKey: v.optional(v.string()),
		chargesEnabled: v.boolean(),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		const data = await ctx.runQuery(
			internal.portal.invoiceEmail._loadInvoiceEmailData,
			{ invoiceId: args.invoiceId }
		);

		if (!data.ok) {
			console.warn(
				`sendInvoiceReadyEmail: skipping send for invoice ${args.invoiceId} (${data.reason})`
			);
			return null;
		}

		const portalLink = optionalPortalInvoiceUrl(
			data.portalAccessId,
			args.invoiceId
		);
		if (!portalLink) {
			console.warn(
				`sendInvoiceReadyEmail: skipping send for invoice ${args.invoiceId} (portal url unavailable)`
			);
			return null;
		}
		const amountFormatted = formatCurrency(data.total);
		const dueDateFormatted = new Date(data.dueDate).toLocaleDateString(
			"en-US",
			// Due dates are UTC-midnight calendar days — format in UTC so the
			// printed date can't slip a day on a non-UTC runtime.
			{ month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }
		);

		const html = await render(
			InvoiceReadyEmail({
				businessName: data.orgName,
				businessLogoUrl: data.orgLogoUrl,
				businessEmail: data.orgEmail,
				businessPhone: data.orgPhone,
				invoiceNumber: data.invoiceNumber,
				amountFormatted,
				dueDateFormatted,
				portalUrl: portalLink,
				clientName: data.contactName,
				chargesEnabled: args.chargesEnabled,
			})
		);

		// [Review fix WR-05, mirrored from portal/email.ts] Resend's test
		// double isn't registered outside a real test runner, so a stray
		// RESEND_API_KEY=test-key in staging/prod must fail loud, not
		// silently drop invoice emails.
		const isTestEnv =
			process.env.NODE_ENV === "test" || process.env.VITEST === "true";
		if (process.env.RESEND_API_KEY === "test-key" && !isTestEnv) {
			throw new Error(
				"RESEND_API_KEY is set to 'test-key' outside a test runner — " +
					"refusing to silently drop invoice-ready emails. Set a real key " +
					"or unset RESEND_API_KEY in this environment."
			);
		}

		await ctx.runMutation(internal.portal.invoiceEmail._recordInvoiceSend, {
			invoiceId: args.invoiceId,
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
			text: `Invoice ${data.invoiceNumber} from ${data.orgName} — ${amountFormatted}, due ${dueDateFormatted}. View it here: ${portalLink}`,
			toName: data.contactName,
		});

		return null;
	},
});
