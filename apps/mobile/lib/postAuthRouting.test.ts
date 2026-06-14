import { describe, expect, it } from "vitest";
import {
	resolveAuthDestination,
	type AuthRoutingState,
} from "./postAuthRouting";

const base: AuthRoutingState = {
	authLoaded: true,
	orgLoaded: true,
	isSignedIn: true,
	hasActiveOrg: true,
	membershipCount: 1,
	needsMetadata: false,
};

describe("resolveAuthDestination", () => {
	it("returns 'loading' while auth is not loaded", () => {
		expect(resolveAuthDestination({ ...base, authLoaded: false })).toBe(
			"loading"
		);
	});

	it("routes signed-out users to sign-in", () => {
		expect(
			resolveAuthDestination({ ...base, isSignedIn: false })
		).toBe("/(auth)");
	});

	// Regression: Clerk's org hooks never reach isLoaded:true without an active
	// user, so a signed-out user must reach sign-in WITHOUT waiting on org
	// context — otherwise the auth layout hangs on a blank screen after sign-out.
	it("routes signed-out users to sign-in even when org context is unloaded", () => {
		expect(
			resolveAuthDestination({
				...base,
				isSignedIn: false,
				orgLoaded: false,
			})
		).toBe("/(auth)");
	});

	it("returns 'loading' for a signed-in user while org context resolves", () => {
		expect(
			resolveAuthDestination({ ...base, orgLoaded: false })
		).toBe("loading");
	});

	it("resumes the wizard when active org has incomplete metadata", () => {
		expect(
			resolveAuthDestination({
				authLoaded: true,
				orgLoaded: true,
				isSignedIn: true,
				hasActiveOrg: true,
				membershipCount: 1,
				needsMetadata: true,
			})
		).toBe("/(onboarding)/create-organization");
	});

	it("routes a complete active-org user to tabs", () => {
		expect(
			resolveAuthDestination({ ...base, needsMetadata: false })
		).toBe("/(tabs)");
	});

	it("returns 'loading' while metadata query is still resolving", () => {
		expect(
			resolveAuthDestination({ ...base, needsMetadata: undefined })
		).toBe("loading");
	});

	it("routes a member with no active org to the wizard (has-memberships)", () => {
		expect(
			resolveAuthDestination({
				authLoaded: true,
				orgLoaded: true,
				isSignedIn: true,
				hasActiveOrg: false,
				membershipCount: 2,
				needsMetadata: undefined,
			})
		).toBe("/(onboarding)/create-organization");
	});

	it("routes a brand-new no-org user to the wizard", () => {
		expect(
			resolveAuthDestination({
				authLoaded: true,
				orgLoaded: true,
				isSignedIn: true,
				hasActiveOrg: false,
				membershipCount: 0,
				needsMetadata: undefined,
			})
		).toBe("/(onboarding)/create-organization");
	});
});
