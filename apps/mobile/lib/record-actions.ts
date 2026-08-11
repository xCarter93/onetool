// Status→CTA resolver: the single source of "the status chip drives the
// buttons" for quote/invoice details and list-row affordances (Mobile 3.0
// design brief). Pure TS on purpose — no react-native imports — so it runs
// under plain vitest and stays a deep module: callers pass observed facts
// (status + capability flags), the resolver owns the policy.
//
// Slot semantics: at most one primary and one secondary render as buttons;
// overflow lands in the ••• menu. Slots are fixed — the resolver never
// promotes secondary→primary when a primary is hidden, so a status always
// reads the same way across screens.
//
// Visibility policy (aligned 2026-08-10): missing modify permission HIDES an
// action; a portal problem DISABLES send/share with the reason, because the
// user should see why a record can't reach the client.

export type QuoteStatus =
	| "draft"
	| "sent"
	| "approved"
	| "declined"
	| "expired";

export type InvoiceStatus =
	| "draft"
	| "sent"
	| "paid"
	| "overdue"
	| "cancelled";

export type RecordActionKey =
	| "send_quote"
	| "resend_quote"
	| "mark_sent"
	| "mark_approved"
	| "mark_declined"
	| "get_signature"
	| "convert_to_invoice"
	| "view_invoice"
	| "send_invoice"
	| "resend_invoice"
	| "record_payment"
	| "share_pay_link"
	| "extend_valid_until"
	| "revert_to_draft";

export type ActionSlot = "primary" | "secondary" | "overflow";

/** Why the client can't be reached through the portal, if they can't. */
export type PortalIssue = "no_portal_access" | "no_primary_email";

export interface ResolvedAction {
	key: RecordActionKey;
	label: string;
	slot: ActionSlot;
	disabled: boolean;
	/** Present exactly when disabled — the sentence shown to the user. */
	disabledReason?: string;
}

export interface QuoteCapabilities {
	/** RBAC: can modify quotes. */
	canModify: boolean;
	/** RBAC: can modify invoices (gates Convert to invoice). */
	canModifyInvoices: boolean;
	portalIssue: PortalIssue | null;
	/** An invoice has already been created from this quote. */
	hasInvoice: boolean;
	/**
	 * Reserved for the signature slice: when on, a sent quote's primary slot
	 * becomes "Get signature" and the manual flips move to overflow.
	 */
	signatureCapture?: boolean;
}

export interface InvoiceCapabilities {
	/** RBAC: can modify invoices. */
	canModify: boolean;
	portalIssue: PortalIssue | null;
}

const PORTAL_REASONS: Record<PortalIssue, string> = {
	no_portal_access:
		"Enable portal access for this client before sending.",
	no_primary_email:
		"Add an email to this client's primary contact before sending.",
};

interface ActionSpec {
	key: RecordActionKey;
	label: string;
	slot: ActionSlot;
	portalIssue?: PortalIssue | null;
}

function toAction({ key, label, slot, portalIssue }: ActionSpec): ResolvedAction {
	if (portalIssue) {
		return {
			key,
			label,
			slot,
			disabled: true,
			disabledReason: PORTAL_REASONS[portalIssue],
		};
	}
	return { key, label, slot, disabled: false };
}

export function resolveQuoteActions(
	status: QuoteStatus,
	caps: QuoteCapabilities
): ResolvedAction[] {
	const actions: ResolvedAction[] = [];
	const push = (spec: ActionSpec) => actions.push(toAction(spec));

	switch (status) {
		case "draft":
			if (caps.canModify) {
				push({
					key: "send_quote",
					label: "Send quote",
					slot: "primary",
					portalIssue: caps.portalIssue,
				});
				// Manual escape hatch: the quote was delivered outside the portal
				// (printed, texted, read over the phone) — no email goes out.
				// Draft-only: quotes.update stamps sentAt on draft→sent.
				push({
					key: "mark_sent",
					label: "Mark as sent",
					slot: "overflow",
				});
				push({
					key: "mark_approved",
					label: "Mark approved",
					slot: "overflow",
				});
			}
			break;
		case "sent":
			if (caps.canModify) {
				if (caps.signatureCapture) {
					push({
						key: "get_signature",
						label: "Get signature",
						slot: "primary",
					});
					push({
						key: "resend_quote",
						label: "Resend quote",
						slot: "secondary",
						portalIssue: caps.portalIssue,
					});
					push({
						key: "mark_approved",
						label: "Mark approved",
						slot: "overflow",
					});
				} else {
					push({
						key: "mark_approved",
						label: "Mark approved",
						slot: "primary",
					});
					push({
						key: "resend_quote",
						label: "Resend quote",
						slot: "secondary",
						portalIssue: caps.portalIssue,
					});
				}
				push({
					key: "mark_declined",
					label: "Mark declined",
					slot: "overflow",
				});
				push({
					key: "extend_valid_until",
					label: "Extend valid until",
					slot: "overflow",
				});
				// Content is draft-only editable (Slice 4 rule) — this is the
				// unlock: reverting pulls the quote from the portal until resend.
				push({
					key: "revert_to_draft",
					label: "Revert to draft",
					slot: "overflow",
				});
			}
			break;
		case "approved":
			// No resend here — quotes.sendToClient rejects approved quotes (the
			// CTA is Convert, and the portal email only renders for sent status).
			if (caps.hasInvoice) {
				// Navigation, not a write — visible to viewers too.
				push({
					key: "view_invoice",
					label: "View invoice",
					slot: "primary",
				});
			} else if (caps.canModifyInvoices) {
				push({
					key: "convert_to_invoice",
					label: "Convert to invoice",
					slot: "primary",
				});
			}
			break;
		case "declined":
			if (caps.canModify) {
				push({
					key: "send_quote",
					label: "Send again",
					slot: "primary",
					portalIssue: caps.portalIssue,
				});
			}
			break;
		case "expired":
			if (caps.canModify) {
				push({
					key: "send_quote",
					label: "Send again",
					slot: "primary",
					portalIssue: caps.portalIssue,
				});
				// Extending an expired quote's window revives it to sent — the
				// portal link starts working again (backend flips the status).
				push({
					key: "extend_valid_until",
					label: "Extend valid until",
					slot: "overflow",
				});
				push({
					key: "mark_approved",
					label: "Mark approved",
					slot: "overflow",
				});
			}
			break;
	}

	return actions;
}

export function resolveInvoiceActions(
	status: InvoiceStatus,
	caps: InvoiceCapabilities
): ResolvedAction[] {
	const actions: ResolvedAction[] = [];
	const push = (spec: ActionSpec) => actions.push(toAction(spec));

	switch (status) {
		case "draft":
			if (caps.canModify) {
				push({
					key: "send_invoice",
					label: "Send invoice",
					slot: "primary",
					portalIssue: caps.portalIssue,
				});
				// Cash-first field jobs get paid before the invoice is ever
				// emailed — recording settles it the same as on a sent invoice.
				push({
					key: "record_payment",
					label: "Record payment",
					slot: "overflow",
				});
			}
			break;
		case "sent":
		case "overdue":
			if (caps.canModify) {
				push({
					key: "record_payment",
					label: "Record payment",
					slot: "primary",
				});
			}
			// Sharing the portal link is a read, not a write — but it needs
			// portal access to exist (a primary email does not matter here;
			// the user delivers the link themselves).
			push({
				key: "share_pay_link",
				label: "Share pay link",
				slot: "secondary",
				portalIssue:
					caps.portalIssue === "no_portal_access"
						? caps.portalIssue
						: null,
			});
			if (caps.canModify) {
				push({
					key: "resend_invoice",
					label: "Resend invoice",
					slot: "overflow",
					portalIssue: caps.portalIssue,
				});
			}
			break;
		case "paid":
		case "cancelled":
			// The status chip is the whole story.
			break;
	}

	return actions;
}
