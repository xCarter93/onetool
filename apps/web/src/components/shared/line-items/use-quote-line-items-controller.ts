"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { useToast } from "@/hooks/use-toast";
import type {
	GridLineItem,
	GridLineItemPatch,
	GridNewRow,
	GridSku,
	LineItemGridController,
	LineItemSaveState,
} from "./types";

/** Quote statuses that freeze the line items. */
const LOCKED_STATUSES: ReadonlyArray<Doc<"quotes">["status"]> = [
	"approved",
	"declined",
];

const LOCKED_REASON: Record<string, string> = {
	approved:
		"Approved quotes are locked. Line items can't change after the client approves.",
	declined:
		"Declined quotes are locked. Duplicate the quote to price a new version.",
};

const SETTLE_MS = 700;

/**
 * Mirrors validateQuoteLineItemFields in the backend — these values are
 * rejected server-side, so never fire the mutation with them.
 */
function patchError(patch: GridLineItemPatch): string | null {
	if (patch.description !== undefined && !patch.description.trim()) {
		return "Description cannot be empty.";
	}
	if (patch.unit !== undefined && !patch.unit.trim()) {
		return "Unit cannot be empty.";
	}
	if (
		patch.quantity !== undefined &&
		(!Number.isFinite(patch.quantity) || patch.quantity <= 0)
	) {
		return "Quantity must be a positive number.";
	}
	if (
		patch.rate !== undefined &&
		(!Number.isFinite(patch.rate) || patch.rate < 0)
	) {
		return "Rate must be a non-negative number.";
	}
	if (
		patch.cost !== undefined &&
		(!Number.isFinite(patch.cost) || patch.cost < 0)
	) {
		return "Cost must be a non-negative number.";
	}
	return null;
}

export interface UseQuoteLineItemsControllerArgs {
	quote: Doc<"quotes">;
	quoteId: Id<"quotes">;
	lineItems: Doc<"quoteLineItems">[] | undefined;
	/** Internal cost/margin columns. Defaults to on. */
	showCostMargin?: boolean;
}

export function useQuoteLineItemsController({
	quote,
	quoteId,
	lineItems,
	showCostMargin = true,
}: UseQuoteLineItemsControllerArgs): LineItemGridController {
	const toast = useToast();
	const createLineItem = useMutation(api.quoteLineItems.create);
	const updateLineItem = useMutation(api.quoteLineItems.update);
	const removeLineItem = useMutation(api.quoteLineItems.remove);
	const duplicateLineItem = useMutation(api.quoteLineItems.duplicate);
	const reorderLineItems = useMutation(api.quoteLineItems.reorder);
	const bulkCreateLineItems = useMutation(api.quoteLineItems.bulkCreate);

	const [saveState, setSaveState] = useState<LineItemSaveState>("saved");
	const pendingRef = useRef(0);
	const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(
		() => () => {
			if (settleRef.current) clearTimeout(settleRef.current);
		},
		[]
	);

	/**
	 * Runs a write with save-state tracking and a single error toast. The
	 * success wrapper is explicit: a mutation resolving `null` (or undefined,
	 * like reorder) must still read as success to callers.
	 */
	const run = useCallback(
		async <T,>(
			label: string,
			fn: () => Promise<T>
		): Promise<{ ok: true; value: T } | null> => {
			pendingRef.current += 1;
			if (settleRef.current) {
				clearTimeout(settleRef.current);
				settleRef.current = null;
			}
			setSaveState("saving");
			try {
				const result = await fn();
				pendingRef.current -= 1;
				if (pendingRef.current === 0) {
					settleRef.current = setTimeout(() => {
						settleRef.current = null;
						setSaveState("saved");
					}, SETTLE_MS);
				}
				return { ok: true, value: result };
			} catch (error) {
				pendingRef.current = Math.max(0, pendingRef.current - 1);
				setSaveState("error");
				const message =
					error instanceof Error ? error.message : "Please try again.";
				toast.error(label, message);
				return null;
			}
		},
		[toast]
	);

	const serverItems: GridLineItem[] = useMemo(() => {
		if (!lineItems) return [];
		return [...lineItems]
			.sort((a, b) => a.sortOrder - b.sortOrder)
			.map((item) => ({
				id: item._id,
				description: item.description,
				quantity: item.quantity,
				unit: item.unit,
				rate: item.rate,
				cost: item.cost,
				amount: item.amount,
				sortOrder: item.sortOrder,
			}));
	}, [lineItems]);

	// Drag-end order, applied locally until the reorder mutation resolves so
	// rows don't snap back for the round-trip.
	const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);

	const items = useMemo(() => {
		if (!pendingOrder) return serverItems;
		const byId = new Map(serverItems.map((item) => [item.id, item]));
		// A row added or removed underneath us invalidates the override.
		if (
			pendingOrder.length !== serverItems.length ||
			pendingOrder.some((id) => !byId.has(id))
		) {
			return serverItems;
		}
		return pendingOrder.map((id, index) => ({
			...(byId.get(id) as GridLineItem),
			sortOrder: index,
		}));
	}, [pendingOrder, serverItems]);

	const itemCount = items.length;

	const locked = LOCKED_STATUSES.includes(quote.status);
	const lockedReason = locked ? LOCKED_REASON[quote.status] : undefined;

	const patchItem = useCallback(
		async (id: string, patch: GridLineItemPatch): Promise<boolean> => {
			const invalid = patchError(patch);
			if (invalid) {
				toast.error("Line not saved", invalid);
				return false;
			}
			const result = await run("Couldn't save the line", () =>
				updateLineItem({ id: id as Id<"quoteLineItems">, ...patch })
			);
			return result !== null;
		},
		[run, toast, updateLineItem]
	);

	const addItem = useCallback(async (): Promise<string | null> => {
		const result = await run("Couldn't add the line", () =>
			createLineItem({
				quoteId,
				description: "New item",
				quantity: 1,
				unit: "hour",
				rate: 0,
				cost: 0,
				sortOrder: itemCount,
			})
		);
		return result ? String(result.value) : null;
	}, [createLineItem, itemCount, quoteId, run]);

	const removeItems = useCallback(
		async (ids: string[]) => {
			await run("Couldn't remove the lines", async () => {
				for (const id of ids) {
					await removeLineItem({ id: id as Id<"quoteLineItems"> });
				}
			});
		},
		[removeLineItem, run]
	);

	const duplicateItems = useCallback(
		async (ids: string[]) => {
			await run("Couldn't duplicate the lines", async () => {
				for (const id of ids) {
					await duplicateLineItem({ id: id as Id<"quoteLineItems"> });
				}
			});
		},
		[duplicateLineItem, run]
	);

	const reorderItems = useCallback(
		async (orderedIds: string[]) => {
			setPendingOrder(orderedIds);
			await run("Couldn't reorder the lines", () =>
				reorderLineItems({
					quoteId,
					lineItemIds: orderedIds as Id<"quoteLineItems">[],
				})
			);
			// Convex has already applied the write to the local query state by
			// the time the mutation resolves, so dropping the override here
			// either reconciles (success) or reverts (failure, already toasted).
			setPendingOrder(null);
		},
		[quoteId, reorderLineItems, run]
	);

	const applySku = useCallback(
		async (id: string, sku: GridSku): Promise<boolean> => {
			const result = await run("Couldn't apply the SKU", () =>
				updateLineItem({
					id: id as Id<"quoteLineItems">,
					description: sku.name,
					unit: sku.unit,
					rate: sku.rate,
					cost: sku.cost ?? 0,
				})
			);
			return result !== null;
		},
		[run, updateLineItem]
	);

	const bulkAddRows = useCallback(
		async (rows: GridNewRow[]) => {
			const offset = itemCount;
			const payload = rows.map((row, index) => ({
				description: row.description.trim() || "New item",
				quantity: row.quantity > 0 ? row.quantity : 1,
				unit: row.unit?.trim() || "hour",
				rate: row.rate >= 0 ? row.rate : 0,
				cost: row.cost !== undefined && row.cost >= 0 ? row.cost : 0,
				sortOrder: offset + index,
			}));
			if (payload.length === 0) return;
			const created = await run("Couldn't paste the rows", () =>
				bulkCreateLineItems({ quoteId, lineItems: payload })
			);
			if (created) {
				toast.success(
					"Rows added",
					`${payload.length} ${payload.length === 1 ? "line" : "lines"} pasted from your clipboard.`
				);
			}
		},
		[bulkCreateLineItems, itemCount, quoteId, run, toast]
	);

	return useMemo(
		() => ({
			items,
			locked,
			lockedReason,
			showCostMargin,
			saveState,
			patchItem,
			addItem,
			removeItems,
			duplicateItems,
			reorderItems,
			applySku,
			bulkAddRows,
		}),
		[
			items,
			locked,
			lockedReason,
			showCostMargin,
			saveState,
			patchItem,
			addItem,
			removeItems,
			duplicateItems,
			reorderItems,
			applySku,
			bulkAddRows,
		]
	);
}
