// Enriched post-auth routing: the single source of truth for where a user
// lands after sign-in. useOrganization() reports the ACTIVE org only, so the
// model also carries membershipCount + needsMetadata to avoid duplicate-org
// creation and premature tabs/wizard flashes. No React imports — Vitest-testable.

export type AuthRoutingState = {
	// Clerk auth resolved (useAuth().isLoaded). Gates EVERY decision.
	authLoaded: boolean;
	// Org context resolved (useOrganization + useOrganizationList). Only
	// meaningful for a signed-in user — the org hooks never reach isLoaded:true
	// without an active session, so the signed-out path must NOT wait on it.
	orgLoaded: boolean;
	isSignedIn: boolean;
	hasActiveOrg: boolean;
	membershipCount: number;
	needsMetadata: boolean | undefined;
};

// The (auth) group index host (Clerk AuthView). The signed-out destination.
const SIGN_IN = "/(auth)";
// Post-auth "finish setup" screen. The mobile app is SIGN-IN ONLY (Apple 3.1.1):
// it no longer creates organizations. This screen activates an existing
// membership when the session has none active, and otherwise tells a user with
// no complete org to finish setup in the web app. Exported so the tabs layout
// can match it without duplicating the route string.
export const SETUP_ROUTE = "/(onboarding)/complete-setup";
const TABS = "/(tabs)";
const LOADING = "loading";

// Resolve the enriched model to a deterministic destination. "loading" is a
// sentinel: the caller renders splash/null and does NOT redirect.
export function resolveAuthDestination(state: AuthRoutingState): string {
	// Auth must resolve before any decision.
	if (!state.authLoaded) return LOADING;
	// Signed out: go straight to sign-in. Do NOT gate on orgLoaded — Clerk's org
	// hooks stay unloaded without an active user, which otherwise hangs the auth
	// layout on a permanent "loading" (blank screen) after sign-out.
	if (!state.isSignedIn) return SIGN_IN;
	// Signed in: wait for org context before choosing tabs vs setup, else a
	// transiently-null active org flashes the setup screen.
	if (!state.orgLoaded) return LOADING;

	// Any active org goes straight to tabs. Incomplete org metadata no longer
	// gates entry — the Home "finish setup" prompt (owner-only) drives the in-app
	// Business details editor instead. `needsMetadata` stays on the state for
	// callers but is intentionally NOT a routing gate anymore.
	if (state.hasActiveOrg) return TABS;

	// Signed in, no active org: existing members and brand-new accounts both go
	// to the setup screen. It activates the first existing membership when there
	// is one, and otherwise directs the user to finish setup in the web app —
	// org creation is web-only now (sign-in-only app, Apple 3.1.1).
	return SETUP_ROUTE;
}
