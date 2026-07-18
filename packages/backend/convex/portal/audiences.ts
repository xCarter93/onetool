// Single source of truth for portal JWT audiences. Production enforcement
// happens in auth.config.ts (one customJwt provider per audience, matched on
// applicationID); helpers.ts only re-checks when a runtime surfaces the aud
// claim (convex-test). Both derive from this list so they cannot drift.
export const PORTAL_JWT_AUDIENCES = [
	"convex-portal",
	"convex-portal-access",
] as const;
