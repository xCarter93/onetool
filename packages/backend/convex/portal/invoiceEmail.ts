// Fire-and-forget "invoice is ready" email, scheduled after an invoice is
// sent. Modeled on portal/email.ts's sendPortalOtpEmail: an internalAction
// renders the React-Email template and calls resend.sendEmail, with the same
// RESEND_API_KEY==="test-key" guard.
import { internalAction, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { render } from "@react-email/render";
import { resend } from "../resend";
import { InvoiceReadyEmail } from "../emails/invoiceReady";
import { internal } from "../_generated/api";
import { formatCurrency } from "../lib/money";
import { buildPortalInvoiceUrl } from "./invoiceUrl";

// Matches portal/email.ts's FROM_ADDRESS domain — display name is the
// business (not "OneTool"), the address stays the shared noreply mailbox.
const NOREPLY_ADDRESS = "noreply@onetool.biz";

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
 * Sends the "invoice is ready" email via Resend. Scheduled (fire-and-forget)
 * after an invoice is sent to a client — never throws on missing contact/
 * portal data, since a scheduled action has no caller to surface errors to.
 */
export const sendInvoiceReadyEmail = internalAction({
	args: { invoiceId: v.id("invoices") },
	returns: v.null(),
	handler: async (ctx, { invoiceId }): Promise<null> => {
		const data = await ctx.runQuery(
			internal.portal.invoiceEmail._loadInvoiceEmailData,
			{ invoiceId }
		);

		if (!data.ok) {
			console.warn(
				`sendInvoiceReadyEmail: skipping send for invoice ${invoiceId} (${data.reason})`
			);
			return null;
		}

		const portalLink = buildPortalInvoiceUrl({
			portalAccessId: data.portalAccessId,
			invoiceId,
		});
		const amountFormatted = formatCurrency(data.total);
		const dueDateFormatted = new Date(data.dueDate).toLocaleDateString(
			"en-US",
			{ month: "short", day: "numeric", year: "numeric" }
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
			})
		);

		// [Review fix WR-05, mirrored from portal/email.ts] Resend's test
		// double isn't registered outside a real test runner, so a stray
		// RESEND_API_KEY=test-key in staging/prod must fail loud, not
		// silently drop invoice emails.
		const isTestEnv =
			process.env.NODE_ENV === "test" || process.env.VITEST === "true";
		if (process.env.RESEND_API_KEY === "test-key") {
			if (!isTestEnv) {
				throw new Error(
					"RESEND_API_KEY is set to 'test-key' outside a test runner — " +
						"refusing to silently drop invoice-ready emails. Set a real key " +
						"or unset RESEND_API_KEY in this environment."
				);
			}
			return null;
		}

		await resend.sendEmail(ctx, {
			from: `${data.orgName} <${NOREPLY_ADDRESS}>`,
			to: data.contactEmail,
			subject: `Invoice ${data.invoiceNumber} from ${data.orgName}`,
			html,
		});

		return null;
	},
});
