/**
 * OneTool → QuickBooks Online payload builders (PRD §6.4).
 *
 * Pure functions: no ctx, no fetch, no Date.now() except where a caller-supplied
 * fallback is explicitly allowed. Money stays in DOLLARS on both sides (QBO's
 * Accounting API takes decimal dollars), so the only arithmetic here is
 * cent-rounding and the per-line vs. stored-total reconciliation.
 */

import type { Doc } from "../_generated/dataModel";
import { applyDiscount, calculateTax, roundCents, sumMoney } from "./money";
import { resolveInvoicePricingMode } from "./invoiceTotals";

/** ms timestamp → QBO's yyyy-MM-dd. UTC, matching the repo's date bucketing. */
export function toQboDate(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Escape a value for a QBO query string literal. Intuit's query language uses
 * single quotes and doubles them to escape.
 */
export function escapeQboQueryValue(value: string): string {
	// QBO's query language escapes with backslashes, not SQL-style doubling.
	return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// ============================================================================
// Customer
// ============================================================================

export interface QboCustomerPayload {
	DisplayName: string;
	CompanyName?: string;
	GivenName?: string;
	FamilyName?: string;
	PrimaryEmailAddr?: { Address: string };
	PrimaryPhone?: { FreeFormNumber: string };
	BillAddr?: {
		Line1?: string;
		City?: string;
		CountrySubDivisionCode?: string;
		PostalCode?: string;
		Country?: string;
	};
}

/**
 * Client → QBO Customer. DisplayName is the company name (QBO's uniqueness
 * key); contact + billing address are filled in only where OneTool has them.
 */
export function buildQboCustomer(args: {
	client: Doc<"clients">;
	primaryContact?: Doc<"clientContacts"> | null;
	billingAddress?: Doc<"clientProperties"> | null;
	/** Override for the disambiguation retry (`"<name> - 2"`). */
	displayName?: string;
}): QboCustomerPayload {
	const { client, primaryContact, billingAddress } = args;
	const displayName = (args.displayName ?? client.companyName).trim();

	const payload: QboCustomerPayload = {
		DisplayName: displayName,
		CompanyName: client.companyName,
	};

	if (primaryContact) {
		if (primaryContact.firstName) payload.GivenName = primaryContact.firstName;
		if (primaryContact.lastName) payload.FamilyName = primaryContact.lastName;
		if (primaryContact.email) {
			payload.PrimaryEmailAddr = { Address: primaryContact.email };
		}
		if (primaryContact.phone) {
			payload.PrimaryPhone = { FreeFormNumber: primaryContact.phone };
		}
	}

	if (billingAddress) {
		payload.BillAddr = {
			Line1: billingAddress.streetAddress,
			City: billingAddress.city,
			CountrySubDivisionCode: billingAddress.state,
			PostalCode: billingAddress.zipCode,
			...(billingAddress.country ? { Country: billingAddress.country } : {}),
		};
	}

	return payload;
}

// ============================================================================
// Invoice
// ============================================================================

export interface QboSalesItemLine {
	DetailType: "SalesItemLineDetail";
	Amount: number;
	Description?: string;
	LineNum: number;
	SalesItemLineDetail: {
		ItemRef: { value: string };
		Qty?: number;
		UnitPrice?: number;
	};
}

export interface QboDiscountLine {
	DetailType: "DiscountLineDetail";
	Amount: number;
	DiscountLineDetail: { PercentBased: false };
}

export type QboInvoiceLine = QboSalesItemLine | QboDiscountLine;

export interface QboInvoicePayload {
	CustomerRef: { value: string };
	DocNumber: string;
	TxnDate: string;
	DueDate: string;
	Line: QboInvoiceLine[];
	TxnTaxDetail?: { TotalTax: number };
}

/**
 * Derive the DOLLAR discount and tax for an invoice exactly the way
 * `calculateInvoiceTotals` does, so the QBO document can never disagree with
 * what OneTool bills.
 *
 * The trap: in "quote" pricing mode `invoice.discountAmount` is a RAW PERCENT
 * (0-100) when `discountType === "percentage"`, not dollars.
 */
export function deriveInvoiceAmounts(
	invoice: Doc<"invoices">,
	lineItems: Doc<"invoiceLineItems">[]
): { subtotal: number; discount: number; tax: number; total: number } {
	const subtotal = sumMoney(lineItems.map((item) => item.total));

	if (resolveInvoicePricingMode(invoice) === "quote") {
		let discounted = subtotal;
		if (invoice.discountEnabled && invoice.discountAmount) {
			discounted = applyDiscount(
				subtotal,
				invoice.discountAmount,
				invoice.discountType === "percentage"
			);
		}
		const tax =
			invoice.taxEnabled && invoice.taxRate
				? calculateTax(discounted, invoice.taxRate)
				: 0;
		return {
			subtotal,
			discount: roundCents(subtotal - discounted),
			tax,
			total: roundCents(discounted + tax),
		};
	}

	// Legacy: discountAmount/taxAmount are pre-computed dollars, floored at 0.
	const discounted = Math.max(0, subtotal - (invoice.discountAmount ?? 0));
	const tax = invoice.taxAmount ?? 0;
	return {
		subtotal,
		discount: roundCents(subtotal - discounted),
		tax,
		total: roundCents(discounted + tax),
	};
}

/** A line item plus the QBO Item it resolved to (absent → generic item). */
export type QboInvoiceLineInput = Doc<"invoiceLineItems"> & {
	itemQboId?: string;
};

/**
 * Invoice → QBO Invoice.
 *
 * A line references its SKU's QBO Item when one was resolved, otherwise the
 * generic "OneTool Service" item; the real detail lives in Description
 * (Jobber's pattern). Per-line rounding is reconciled
 * against the stored `invoice.total`: any residual cents are absorbed by the
 * last sales line, which then drops Qty/UnitPrice so QBO does not recompute
 * the adjusted Amount back to quantity x unit price.
 */
export function buildQboInvoice(args: {
	invoice: Doc<"invoices">;
	lineItems: QboInvoiceLineInput[];
	customerQboId: string;
	defaultServiceItemQboId: string;
}): QboInvoicePayload {
	const { invoice, lineItems, customerQboId, defaultServiceItemQboId } = args;

	const salesLines: QboSalesItemLine[] = lineItems.map((item, index) => ({
		DetailType: "SalesItemLineDetail",
		Amount: roundCents(item.total),
		Description: item.description,
		LineNum: index + 1,
		SalesItemLineDetail: {
			ItemRef: { value: item.itemQboId ?? defaultServiceItemQboId },
			Qty: item.quantity,
			UnitPrice: roundCents(item.unitPrice),
		},
	}));

	const derived = deriveInvoiceAmounts(invoice, lineItems);

	// Reconcile against the stored total (the number the client is billed and
	// payments must sum to). Stored totals only diverge from `derived` for
	// legacy rows whose line items were edited without a totals sync.
	const storedTotal = roundCents(invoice.total);
	const linesTotal = sumMoney(salesLines.map((line) => line.Amount));
	const remainder = roundCents(
		storedTotal - roundCents(linesTotal - derived.discount + derived.tax)
	);
	if (remainder !== 0 && salesLines.length > 0) {
		const last = salesLines[salesLines.length - 1];
		last.Amount = roundCents(last.Amount + remainder);
		// The adjusted amount no longer equals Qty x UnitPrice; sending both
		// would let QBO recompute it away.
		delete last.SalesItemLineDetail.Qty;
		delete last.SalesItemLineDetail.UnitPrice;
	}

	const lines: QboInvoiceLine[] = [...salesLines];
	if (derived.discount > 0) {
		lines.push({
			DetailType: "DiscountLineDetail",
			Amount: derived.discount,
			DiscountLineDetail: { PercentBased: false },
		});
	}

	return {
		CustomerRef: { value: customerQboId },
		DocNumber: invoice.invoiceNumber,
		TxnDate: toQboDate(invoice.issuedDate),
		DueDate: toQboDate(invoice.dueDate),
		Line: lines,
		...(derived.tax > 0 ? { TxnTaxDetail: { TotalTax: derived.tax } } : {}),
	};
}

// ============================================================================
// Payment
// ============================================================================

export interface QboPaymentPayload {
	CustomerRef: { value: string };
	TotalAmt: number;
	TxnDate: string;
	DepositToAccountRef: { value: string };
	Line: Array<{
		Amount: number;
		LinkedTxn: Array<{ TxnId: string; TxnType: "Invoice" }>;
	}>;
}

/** Paid installment → QBO Payment linked to the invoice it settles. */
export function buildQboPayment(args: {
	payment: Doc<"payments">;
	customerQboId: string;
	invoiceQboId: string;
	depositAccountQboId: string;
	/** Fallback TxnDate when the row has no paidAt. */
	now?: number;
}): QboPaymentPayload {
	const amount = roundCents(args.payment.paymentAmount);
	return {
		CustomerRef: { value: args.customerQboId },
		TotalAmt: amount,
		TxnDate: toQboDate(args.payment.paidAt ?? args.now ?? Date.now()),
		DepositToAccountRef: { value: args.depositAccountQboId },
		Line: [
			{
				Amount: amount,
				LinkedTxn: [{ TxnId: args.invoiceQboId, TxnType: "Invoice" }],
			},
		],
	};
}
