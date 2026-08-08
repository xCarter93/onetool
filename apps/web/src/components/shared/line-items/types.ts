/**
 * Entity-agnostic contract for the inline line-item spreadsheet grid.
 *
 * Quotes wire it through `use-quote-line-items-controller`; invoices get their
 * own controller hook against the same interface. The grid never talks to
 * Convex directly and never sends computed totals — the server recomputes
 * subtotal/total from the line items on every write.
 */

import { roundCents } from "@/lib/money";

/** A single editable row. Money values are DOLLARS (see lib/money.ts). */
export interface GridLineItem {
	id: string;
	description: string;
	quantity: number;
	unit?: string;
	rate: number;
	/** Internal unit cost. Never printed on the client PDF. */
	cost?: number;
	amount: number;
	sortOrder: number;
}

/** Fields a cell edit can change. */
export type GridLineItemPatch = Partial<
	Pick<GridLineItem, "description" | "quantity" | "unit" | "rate" | "cost">
>;

/** Catalog entry shape the SKU picker hands back. */
export interface GridSku {
	/** Id<"skus"> — recorded on the line for per-SKU QuickBooks item sync. */
	id: string;
	name: string;
	unit: string;
	rate: number;
	cost?: number;
}

/** A row parsed from pasted spreadsheet text. */
export interface GridNewRow {
	description: string;
	quantity: number;
	unit?: string;
	rate: number;
	cost?: number;
}

export type LineItemSaveState = "saved" | "saving" | "error";

export interface LineItemGridController {
	items: GridLineItem[];
	/** Read-only mode — the record no longer accepts line-item edits. */
	locked: boolean;
	lockedReason?: string;
	/** Show the internal Cost input and computed Margin column. */
	showCostMargin: boolean;
	saveState: LineItemSaveState;
	/**
	 * Commits one cell edit. Resolves false when the value was rejected
	 * locally or the write failed — the caller must then reset that cell to
	 * the current item value so the grid never shows an unsaved number.
	 */
	patchItem(id: string, patch: GridLineItemPatch): Promise<boolean>;
	/** Returns the new row id, or null if the write failed. */
	addItem(): Promise<string | null>;
	removeItems(ids: string[]): Promise<void>;
	duplicateItems(ids: string[]): Promise<void>;
	/** Optimistic: implementations reorder locally before the write lands. */
	reorderItems(orderedIds: string[]): Promise<void>;
	/** Resolves false when the write failed. */
	applySku(id: string, sku: GridSku): Promise<boolean>;
	bulkAddRows(rows: GridNewRow[]): Promise<void>;
}

/** Money-shaped inputs for the display-only totals stack. */
export interface LineItemsDisplayTotals {
	subtotal: number;
	discountAmount: number;
	taxAmount: number;
	total: number;
}

export interface LineItemsPricingSettings {
	discountAmount: number;
	discountType: "percentage" | "fixed";
	taxRate: number;
	pdfSettings: {
		showQuantities: boolean;
		showUnitPrices: boolean;
		showLineItemTotals: boolean;
		showTotals: boolean;
	};
}

/**
 * Display-only totals math, mirroring the server's computeQuoteTotals so the
 * panel and totals stack stay live while a debounced save is in flight.
 */
export function computeDisplayTotals(
	subtotal: number,
	settings: LineItemsPricingSettings
): LineItemsDisplayTotals {
	// Operation order must byte-match applyDiscount/computeQuoteTotals in
	// lib/money.ts, or displayed figures drift from stored ones.
	const discount = settings.discountAmount || 0;
	const afterDiscount =
		settings.discountType === "percentage"
			? Math.max(0, roundCents(subtotal * (1 - discount / 100)))
			: Math.max(0, roundCents(subtotal - discount));
	const taxAmount = roundCents(afterDiscount * ((settings.taxRate || 0) / 100));
	return {
		subtotal,
		discountAmount: roundCents(subtotal - afterDiscount),
		taxAmount,
		total: roundCents(afterDiscount + taxAmount),
	};
}

/** Parse clipboard text into rows: Description / Qty / Unit / Rate / Cost. */
export function parseTsvRows(text: string): GridNewRow[] {
	const num = (value: string | undefined): number | undefined => {
		if (value === undefined) return undefined;
		const cleaned = value.replace(/[$,\s]/g, "");
		if (!cleaned) return undefined;
		const parsed = Number.parseFloat(cleaned);
		return Number.isFinite(parsed) ? parsed : undefined;
	};

	return text
		.split(/\r\n|\r|\n/)
		// Strip only the trailing \r: a leading tab is an empty description cell.
		.map((line) => line.replace(/\r$/, ""))
		.filter((line) => line.trim().length > 0)
		.map((line) => {
			const cols = line.split("\t").map((col) => col.trim());
			const description = cols[0] ?? "";
			const quantity = num(cols[1]);
			const rate = num(cols[3]);
			const cost = num(cols[4]);
			return {
				description,
				quantity: quantity && quantity > 0 ? quantity : 1,
				unit: cols[2] || undefined,
				rate: rate !== undefined && rate >= 0 ? rate : 0,
				cost: cost !== undefined && cost >= 0 ? cost : undefined,
			};
		})
		.filter((row) => row.description.length > 0);
}
