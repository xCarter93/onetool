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

// Advertised plan-comparison rows (import-safe for web; see lib/planMatrix.ts)
export { PLAN_MATRIX } from "./convex/lib/planMatrix";
export type { PlanMatrixRow } from "./convex/lib/planMatrix";

