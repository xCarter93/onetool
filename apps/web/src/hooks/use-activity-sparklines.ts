import { api } from "@onetool/backend/convex/_generated/api";
import { useQuery } from "convex/react";

type SparklineEntityType = "client" | "project" | "quote" | "invoice";

/**
 * Daily activity counts (30-day window) keyed by entity `_id`, for attaching a
 * sparkline to each row of a list/grid page. Returns `undefined` while loading.
 */
export function useActivitySparklines(entityType: SparklineEntityType) {
	return useQuery(api.activities.activitySparklines, { entityType });
}
