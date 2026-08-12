// Celebration notifications: quote approved / invoice fully paid.
//
// Single canonical creator called from every write site that can put a quote
// into "approved" or an invoice into "paid" (workspace mutations, portal
// approval, BoldSign completion, Stripe webhooks, automation update_field).
// Idempotent per record — the by_org_type_entity lookup makes it safe to call
// from overlapping paths. A future automation "celebrate" action should call
// createCelebration directly (optionally overriding the flair line).
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { listMembershipsByOrg } from "./memberships";
import { isAdminRole } from "./permissions";
import { formatCurrency } from "./money";
import { enqueuePush } from "../push";

type CelebrationKind = "quote_approved" | "payment_received";

const QUOTE_APPROVED_FLAIR = [
	"Another one in the win column.",
	"Your work sold itself.",
	"That yes was earned.",
	"The pipeline is moving.",
	"Signed, sealed, approved.",
	"Good news: your price was right.",
	"Momentum looks good on you.",
	"That's the sound of progress.",
	"Great quotes get great answers.",
	"Keep them coming.",
];

const INVOICE_PAID_FLAIR = [
	"Money in the bank.",
	"Paid in full. Well earned.",
	"Work done, invoice paid — full circle.",
	"Cash flow is looking healthy.",
	"The books just got a little better.",
	"Another job closed out properly.",
	"Getting paid never gets old.",
	"Every paid invoice fuels the next job.",
	"The best kind of notification.",
	"That one's settled.",
];

interface CelebrationCopy {
	title: string;
	message: string;
	actionUrl: string;
}

async function createCelebration(
	ctx: MutationCtx,
	opts: {
		orgId: Id<"organizations">;
		kind: CelebrationKind;
		entityType: "quote" | "invoice";
		entityId: string;
		detail: CelebrationCopy;
		generic: { title: string; message: string };
		flairPool: string[];
		/**
		 * The signed-in user who caused this celebration, when there is one
		 * (portal / webhook / automation paths have no actor). They still get the
		 * bell row, but never a push — nobody wants their own phone to buzz for
		 * the payment they just recorded.
		 */
		actorUserId?: Id<"users">;
	}
): Promise<void> {
	const org = await ctx.db.get(opts.orgId);
	if (!org || org.celebrationsEnabled === false) return;

	// Once per record, ever — re-approvals/corrections don't re-fire.
	const existing = await ctx.db
		.query("notifications")
		.withIndex("by_org_type_entity", (q) =>
			q
				.eq("orgId", opts.orgId)
				.eq("notificationType", opts.kind)
				.eq("entityId", opts.entityId)
		)
		.first();
	if (existing) return;

	const audience = org.celebrationsAudience ?? "admins";
	const memberships = await listMembershipsByOrg(ctx, opts.orgId);
	// userId → gets the detailed (record-linked) copy. Members without admin
	// access get detail-free copy so RBAC read scoping isn't bypassed.
	const recipients = new Map<Id<"users">, boolean>();
	for (const membership of memberships) {
		const detailed =
			isAdminRole(membership.role) || membership.userId === org.ownerUserId;
		if (audience === "admins" && !detailed) continue;
		recipients.set(membership.userId, detailed);
	}
	// Owner may predate membership seeding; always included.
	recipients.set(org.ownerUserId, true);

	const flair =
		opts.flairPool[Math.floor(Math.random() * opts.flairPool.length)];

	for (const [userId, detailed] of recipients) {
		const title = detailed ? opts.detail.title : opts.generic.title;
		const message = detailed ? opts.detail.message : opts.generic.message;
		const notificationId = await ctx.db.insert("notifications", {
			orgId: opts.orgId,
			userId,
			notificationType: opts.kind,
			title,
			message,
			entityType: detailed ? opts.entityType : undefined,
			entityId: detailed ? opts.entityId : undefined,
			actionUrl: detailed ? opts.detail.actionUrl : undefined,
			isRead: false,
			celebrationFlair: flair,
		});

		// Bell row for everyone (above); push for everyone EXCEPT the actor.
		if (userId === opts.actorUserId) continue;
		// Celebrations fan out to every member of the org, most of whom have no
		// mobile device. Skip the scheduled action entirely for them rather than
		// burning a scheduler slot per member on a send that fetches zero tokens.
		const hasDevice = await ctx.db
			.query("pushTokens")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.first();
		if (!hasDevice) continue;
		await enqueuePush(ctx, {
			notificationType: opts.kind,
			taggedUserId: userId,
			title,
			body: message,
			// Generic recipients get no record link (RBAC read scoping), so send
			// them to the bell list instead of a page they may not be able to open.
			url: detailed ? opts.detail.actionUrl : "/notifications",
			notificationId,
			// CLERK org id, not opts.orgId — the push payload's orgId is what the
			// mobile client uses to switch active org on tap (see push.ts).
			orgId: org.clerkOrganizationId,
		});
	}
}

/** Celebrate a quote reaching "approved". Never throws — a celebration must not break the approving write. */
export async function celebrateQuoteApproved(
	ctx: MutationCtx,
	quote: Doc<"quotes">,
	actorUserId?: Id<"users">
): Promise<void> {
	try {
		const client = await ctx.db.get(quote.clientId);
		const clientName = client?.companyName ?? "A client";
		const label = quote.quoteNumber ? `Quote #${quote.quoteNumber}` : "a quote";
		const amount = quote.total ? ` — ${formatCurrency(quote.total)}` : "";
		await createCelebration(ctx, {
			orgId: quote.orgId,
			kind: "quote_approved",
			entityType: "quote",
			entityId: quote._id,
			detail: {
				title: "Quote approved",
				message: `${clientName} approved ${label}${amount}.`,
				actionUrl: `/quotes/${quote._id}`,
			},
			generic: {
				title: "Team win",
				message: "A quote was just approved. Nice work, everyone.",
			},
			flairPool: QUOTE_APPROVED_FLAIR,
			actorUserId,
		});
	} catch (err) {
		console.warn("celebrateQuoteApproved skipped:", err);
	}
}

/** Celebrate an invoice reaching fully "paid". Never throws. */
export async function celebrateInvoicePaid(
	ctx: MutationCtx,
	invoice: Doc<"invoices">,
	actorUserId?: Id<"users">
): Promise<void> {
	try {
		const client = await ctx.db.get(invoice.clientId);
		const clientName = client?.companyName ?? "A client";
		const label = invoice.invoiceNumber
			? `Invoice #${invoice.invoiceNumber}`
			: "an invoice";
		const amount = invoice.total ? ` — ${formatCurrency(invoice.total)}` : "";
		await createCelebration(ctx, {
			orgId: invoice.orgId,
			kind: "payment_received",
			entityType: "invoice",
			entityId: invoice._id,
			detail: {
				title: "Invoice paid",
				message: `${clientName} paid ${label}${amount}.`,
				actionUrl: `/invoices/${invoice._id}`,
			},
			generic: {
				title: "Team win",
				message: "An invoice was just paid. Great work out there.",
			},
			flairPool: INVOICE_PAID_FLAIR,
			actorUserId,
		});
	} catch (err) {
		console.warn("celebrateInvoicePaid skipped:", err);
	}
}
