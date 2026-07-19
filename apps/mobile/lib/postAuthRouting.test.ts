import { describe, expect, it } from "vitest";
import {
	resolveAuthDestination,
	SETUP_ROUTE,
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

	// Metadata no longer gates entry — an active org always resolves to tabs
	// regardless of needsMetadata (the Home prompt handles completion in-app).
	it("routes an active-org user with incomplete metadata to tabs", () => {
		expect(
			resolveAuthDestination({
				authLoaded: true,
				orgLoaded: true,
				isSignedIn: true,
				hasActiveOrg: true,
				membershipCount: 1,
				needsMetadata: true,
			})
		).toBe("/(tabs)");
	});

	it("routes a complete active-org user to tabs", () => {
		expect(
			resolveAuthDestination({ ...base, needsMetadata: false })
		).toBe("/(tabs)");
	});

	it("routes an active-org user to tabs while metadata is still resolving", () => {
		expect(
			resolveAuthDestination({ ...base, needsMetadata: undefined })
		).toBe("/(tabs)");
	});

	it("routes a member with no active org to setup (has-memberships)", () => {
		expect(
			resolveAuthDestination({
				authLoaded: true,
				orgLoaded: true,
				isSignedIn: true,
				hasActiveOrg: false,
				membershipCount: 2,
				needsMetadata: undefined,
			})
		).toBe(SETUP_ROUTE);
	});

	it("routes a brand-new no-org user to setup", () => {
		expect(
			resolveAuthDestination({
				authLoaded: true,
				orgLoaded: true,
				isSignedIn: true,
				hasActiveOrg: false,
				membershipCount: 0,
				needsMetadata: undefined,
			})
		).toBe(SETUP_ROUTE);
	});
});
