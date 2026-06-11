// Enriched post-auth routing: the single source of truth for where a user
// lands after sign-in. useOrganization() reports the ACTIVE org only, so the
// model also carries membershipCount + needsMetadata to avoid duplicate-org
// creation and premature tabs/wizard flashes. No React imports — Vitest-testable.

export type AuthRoutingState = {
	isLoaded: boolean;
	isSignedIn: boolean;
	hasActiveOrg: boolean;
	membershipCount: number;
	needsMetadata: boolean | undefined;
};

const SIGN_IN = "/(auth)/sign-in";
const WIZARD = "/(onboarding)/create-organization";
const TABS = "/(tabs)";
const LOADING = "loading";

// Resolve the enriched model to a deterministic destination. "loading" is a
// sentinel: the caller renders splash/null and does NOT redirect.
export function resolveAuthDestination(state: AuthRoutingState): string {
	if (!state.isLoaded) return LOADING;
	if (!state.isSignedIn) return SIGN_IN;

	if (state.hasActiveOrg) {
		// metadata still resolving — avoid a premature tabs/wizard flash
		if (state.needsMetadata === undefined) return LOADING;
		// active org but metadata incomplete -> resume the wizard, never tabs
		if (state.needsMetadata === true) return WIZARD;
		return TABS;
	}

	// Signed in, no active org: existing members (membershipCount>0) and
	// brand-new users both go to the wizard. The wizard detects existing
	// memberships and sets one active rather than creating a duplicate org.
	return WIZARD;
}

// The single post-auth navigation point consumed by sign-in, sign-up, the
// Apple button onSuccess, and wizard completion — replaces every hardcoded
// router.replace("/(tabs)"). Skips navigation on the "loading" sentinel.
export function navigateAfterAuth(
	replace: (href: string) => void,
	destination: string
): void {
	if (destination === LOADING) return;
	replace(destination);
}
