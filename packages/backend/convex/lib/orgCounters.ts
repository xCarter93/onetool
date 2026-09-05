import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

// Counters live off the org doc so every create doesn't invalidate every org subscription.

const QUOTE_RE = /^Q-(\d+)$/;
const INVOICE_RE = /^INV-(\d+)$/;

function seqOf(value: string | undefined, re: RegExp): number {
	const match = value?.match(re);
	return match ? parseInt(match[1], 10) : 0;
}

async function seedQuoteNumber(
	ctx: MutationCtx,
	orgId: Id<"organizations">
): Promise<number> {
	const org = await ctx.db.get(orgId);
	if (org?.lastQuoteNumber !== undefined) return org.lastQuoteNumber;

	const quotes = await ctx.db
		.query("quotes")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.collect();
	return Math.max(0, ...quotes.map((q) => seqOf(q.quoteNumber, QUOTE_RE)));
}

async function seedInvoiceNumber(
	ctx: MutationCtx,
	orgId: Id<"organizations">
): Promise<number> {
	const invoices = await ctx.db
		.query("invoices")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.collect();
	return Math.max(0, ...invoices.map((i) => seqOf(i.invoiceNumber, INVOICE_RE)));
}

async function counterRow(
	ctx: MutationCtx,
	orgId: Id<"organizations">
): Promise<Doc<"orgCounters">> {
	const existing = await ctx.db
		.query("orgCounters")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.unique();
	if (existing) return existing;

	// Lazy seed from what the org already issued, so no migration is needed.
	const rowId = await ctx.db.insert("orgCounters", {
		orgId,
		lastQuoteNumber: await seedQuoteNumber(ctx, orgId),
		lastInvoiceNumber: await seedInvoiceNumber(ctx, orgId),
	});
	return (await ctx.db.get(rowId))!;
}

export async function nextQuoteNumber(
	ctx: MutationCtx,
	orgId: Id<"organizations">
): Promise<string> {
	const row = await counterRow(ctx, orgId);
	const next = row.lastQuoteNumber + 1;
	await ctx.db.patch(row._id, { lastQuoteNumber: next });
	return `Q-${next.toString().padStart(6, "0")}`;
}

export async function nextInvoiceNumber(
	ctx: MutationCtx,
	orgId: Id<"organizations">
): Promise<string> {
	const row = await counterRow(ctx, orgId);
	const next = row.lastInvoiceNumber + 1;
	await ctx.db.patch(row._id, { lastInvoiceNumber: next });
	return `INV-${next.toString().padStart(6, "0")}`;
}

async function reserve(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	field: "lastQuoteNumber" | "lastInvoiceNumber",
	value: number
): Promise<void> {
	if (value === 0) return;
	const row = await counterRow(ctx, orgId);
	if (value > row[field]) await ctx.db.patch(row._id, { [field]: value });
}

/** A manually supplied number must move the counter past it or a later create collides. */
export async function reserveQuoteNumber(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	quoteNumber: string
): Promise<void> {
	await reserve(ctx, orgId, "lastQuoteNumber", seqOf(quoteNumber, QUOTE_RE));
}

export async function reserveInvoiceNumber(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	invoiceNumber: string
): Promise<void> {
	await reserve(ctx, orgId, "lastInvoiceNumber", seqOf(invoiceNumber, INVOICE_RE));
}
