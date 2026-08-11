import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { usePermissions } from "./use-permissions";
import type {
	InvoiceCapabilities,
	PortalIssue,
	QuoteCapabilities,
} from "./record-actions";

// Composes the observed facts the status→CTA resolver needs: RBAC permission
// levels (permissions.myPermissions), portal reachability (client portal
// access + primary-contact email), and quote→invoice conversion state.
// Returns undefined while any input is still loading so screens never flash
// an action that a late-arriving fact would disable or hide.

function derivePortalIssue(
	client: { portalAccessId?: string } | null,
	primaryContact: { email?: string } | null
): PortalIssue | null {
	if (!client?.portalAccessId) return "no_portal_access";
	if (!primaryContact?.email?.trim()) return "no_primary_email";
	return null;
}

export function useQuoteCapabilities(
	quote: { _id: Id<"quotes">; clientId: Id<"clients"> } | null | undefined
):
	| {
			caps: QuoteCapabilities;
			invoiceId: Id<"invoices"> | null;
			recipientEmail: string | null;
	  }
	| undefined {
	const { can, isLoading } = usePermissions();
	const client = useQuery(
		api.clients.get,
		quote ? { id: quote.clientId } : "skip"
	);
	const primaryContact = useQuery(
		api.clientContacts.getPrimaryContact,
		quote ? { clientId: quote.clientId } : "skip"
	);
	const existingInvoice = useQuery(
		api.invoices.getByQuote,
		quote && can("invoices", "view") ? { quoteId: quote._id } : "skip"
	);

	if (!quote || isLoading) return undefined;
	if (client === undefined || primaryContact === undefined) return undefined;
	const canViewInvoices = can("invoices", "view");
	if (canViewInvoices && existingInvoice === undefined) return undefined;

	return {
		caps: {
			canModify: can("quotes", "modify"),
			canModifyInvoices: can("invoices", "modify"),
			portalIssue: derivePortalIssue(client, primaryContact),
			hasInvoice: !!existingInvoice,
		},
		invoiceId: existingInvoice?._id ?? null,
		recipientEmail: primaryContact?.email?.trim() || null,
	};
}

export function useInvoiceCapabilities(
	invoice: { clientId: Id<"clients"> } | null | undefined
):
	| { caps: InvoiceCapabilities; recipientEmail: string | null }
	| undefined {
	const { can, isLoading } = usePermissions();
	const client = useQuery(
		api.clients.get,
		invoice ? { id: invoice.clientId } : "skip"
	);
	const primaryContact = useQuery(
		api.clientContacts.getPrimaryContact,
		invoice ? { clientId: invoice.clientId } : "skip"
	);

	if (!invoice || isLoading) return undefined;
	if (client === undefined || primaryContact === undefined) return undefined;

	return {
		caps: {
			canModify: can("invoices", "modify"),
			portalIssue: derivePortalIssue(client, primaryContact),
		},
		recipientEmail: primaryContact?.email?.trim() || null,
	};
}
