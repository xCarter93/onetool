import type { Id } from "@onetool/backend/convex/_generated/dataModel";

/**
 * REVIEWS-mandated: typed coercion for route params instead of inline
 * `as Id<"invoices">` casts. Mirror of quoteIdFromParam — keeps the assertion
 * in one place so every invoice route, island, and rail shares the same helper.
 */
export function invoiceIdFromParam(param: string): Id<"invoices"> {
	return param as Id<"invoices">;
}
