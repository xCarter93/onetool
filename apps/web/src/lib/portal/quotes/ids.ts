import type { Id } from "@onetool/backend/convex/_generated/dataModel";

/**
 * REVIEWS-mandated: typed coercion for route params instead of inline
 * `as Id<"quotes">` casts. Keeps the type assertion in one place so the
 * UI shell, rail, sheet, and detail island all share the same helper.
 */
export function quoteIdFromParam(param: string): Id<"quotes"> {
	return param as Id<"quotes">;
}
