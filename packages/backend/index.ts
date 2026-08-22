// Re-export all API types for consumption by apps
export * from "./convex/_generated/api";
export * from "./convex/_generated/dataModel";

// Re-export shared types
export type {
	PlanSource,
	PlanTier,
	FeatureKey,
	MeterUsage,
} from "./convex/lib/entitlements";
export type { MyEntitlements } from "./convex/entitlements";
export type { UsageStats } from "./convex/usage";
export type { HomeStats } from "./convex/homeStats";

// PLAN_MATRIX is a VALUE export — web imports it via the
// "@onetool/backend/convex/lib/planMatrix" subpath (like planLimits), never
// through this index: bundling index.ts client-side breaks on the type-only
// _generated/dataModel re-export.
export type { PlanMatrixRow } from "./convex/lib/planMatrix";

