import { ConvexError, type Infer, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { recurringAgreementTermsValidator } from "./recurringAgreementTerms";
import { calculateLineItemAmount, computeQuoteTotals } from "./money";

export const MAX_QUOTE_SNAPSHOT_LINES = 1_000;
export const MAX_QUOTE_SNAPSHOT_BYTES = 500_000;

const pdfSettingsValidator = v.object({
	showQuantities: v.boolean(),
	showUnitPrices: v.boolean(),
	showLineItemTotals: v.boolean(),
	showTotals: v.boolean(),
});

const snapshotLineValidator = v.object({
	description: v.string(),
	quantity: v.number(),
	unit: v.string(),
	rate: v.number(),
	amount: v.number(),
	sortOrder: v.number(),
});

export const quoteContentSnapshotValidator = v.object({
	clientId: v.id("clients"),
	projectId: v.optional(v.id("projects")),
	title: v.optional(v.string()),
	quoteNumber: v.optional(v.string()),
	terms: v.optional(v.string()),
	clientMessage: v.optional(v.string()),
	validUntil: v.optional(v.number()),
	discountEnabled: v.optional(v.boolean()),
	discountAmount: v.optional(v.number()),
	discountType: v.optional(v.union(v.literal("percentage"), v.literal("fixed"))),
	taxEnabled: v.optional(v.boolean()),
	taxRate: v.optional(v.number()),
	pdfSettings: v.optional(pdfSettingsValidator),
	requiresCountersignature: v.optional(v.boolean()),
	countersignerId: v.optional(v.id("users")),
	signingOrder: v.optional(v.union(v.literal("client_first"), v.literal("org_first"))),
	recurringAgreementTerms: v.optional(recurringAgreementTermsValidator),
	approvalCycle: v.number(),
	subtotal: v.number(),
	taxAmount: v.number(),
	total: v.number(),
	lineItems: v.array(snapshotLineValidator),
});

export type QuoteContentSnapshot = Infer<typeof quoteContentSnapshotValidator>;

function assertSnapshotBounds(snapshot: QuoteContentSnapshot) {
	if (snapshot.lineItems.length > MAX_QUOTE_SNAPSHOT_LINES)
		throw new ConvexError(`A quote PDF can contain at most ${MAX_QUOTE_SNAPSHOT_LINES} line items`);
	if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > MAX_QUOTE_SNAPSHOT_BYTES)
		throw new ConvexError("Quote content is too large to bind to a PDF document");
	return snapshot;
}

export function buildQuoteContentSnapshot(
	quote: Doc<"quotes">,
	lineItems: Doc<"quoteLineItems">[]
): QuoteContentSnapshot {
	if (lineItems.length > MAX_QUOTE_SNAPSHOT_LINES)
		throw new ConvexError(`A quote PDF can contain at most ${MAX_QUOTE_SNAPSHOT_LINES} line items`);
	const sorted = [...lineItems].sort((a, b) => a.sortOrder - b.sortOrder);
	const lines = sorted.map((line) => ({
		description: line.description,
		quantity: line.quantity,
		unit: line.unit,
		rate: line.rate,
		amount: calculateLineItemAmount(line.quantity, line.rate),
		sortOrder: line.sortOrder,
	}));
	const totals = computeQuoteTotals({
		lineAmounts: lines.map((line) => line.amount),
		discountEnabled: quote.discountEnabled,
		discountAmount: quote.discountAmount,
		discountType: quote.discountType,
		taxEnabled: quote.taxEnabled,
		taxRate: quote.taxRate,
	});
	return assertSnapshotBounds({
		clientId: quote.clientId,
		projectId: quote.projectId,
		title: quote.title,
		quoteNumber: quote.quoteNumber,
		terms: quote.terms,
		clientMessage: quote.clientMessage,
		validUntil: quote.validUntil,
		discountEnabled: quote.discountEnabled,
		discountAmount: quote.discountAmount,
		discountType: quote.discountType,
		taxEnabled: quote.taxEnabled,
		taxRate: quote.taxRate,
		pdfSettings: quote.pdfSettings,
		requiresCountersignature: quote.requiresCountersignature,
		countersignerId: quote.countersignerId,
		signingOrder: quote.signingOrder,
		recurringAgreementTerms: quote.recurringAgreementTerms,
		approvalCycle: quote.approvalCycle ?? 0,
		...totals,
		lineItems: lines,
	});
}

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value && typeof value === "object") {
		return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonicalize(entry)]));
	}
	return value;
}

export function quoteContentSnapshotsEqual(a: QuoteContentSnapshot, b: QuoteContentSnapshot) {
	return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}

export async function loadCurrentQuoteContentSnapshot(
	ctx: Pick<QueryCtx, "db">,
	quoteId: Doc<"quotes">["_id"]
): Promise<QuoteContentSnapshot | null> {
	const quote = await ctx.db.get(quoteId);
	if (!quote) return null;
	const lineItems = await ctx.db.query("quoteLineItems")
		.withIndex("by_quote", (q) => q.eq("quoteId", quoteId))
		.take(MAX_QUOTE_SNAPSHOT_LINES + 1);
	return buildQuoteContentSnapshot(quote, lineItems);
}

export async function loadQuoteDocumentSnapshot(
	ctx: Pick<QueryCtx, "db">,
	document: Doc<"documents">
): Promise<QuoteContentSnapshot | null> {
	if (!document.quoteContentSnapshotId) return document.quoteContentSnapshot ?? null;
	const content = await ctx.db.get(document.quoteContentSnapshotId);
	if (!content || content.orgId !== document.orgId || content.documentId !== document._id)
		throw new ConvexError("Quote document content reference is missing or invalid");
	return content.snapshot;
}

export async function attachQuoteDocumentSnapshot(
	ctx: Pick<MutationCtx, "db">,
	document: Doc<"documents">,
	snapshot: QuoteContentSnapshot,
	source: "server" | "workspace"
): Promise<void> {
	if (document.documentType !== "quote")
		throw new ConvexError("Quote content snapshots can only be attached to quote documents");
	if (document.quoteContentSnapshotId || document.quoteContentSnapshot)
		throw new ConvexError("Quote document content is already attached");
	const contentId = await ctx.db.insert("quoteDocumentContents", {
		orgId: document.orgId,
		documentId: document._id,
		snapshot: assertSnapshotBounds(snapshot),
	});
	await ctx.db.patch(document._id, { quoteContentSnapshotId: contentId, quoteSnapshotSource: source });
}
