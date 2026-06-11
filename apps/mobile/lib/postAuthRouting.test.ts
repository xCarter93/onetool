import { describe, expect, it } from "vitest";
import {
	navigateAfterAuth,
	resolveAuthDestination,
	type AuthRoutingState,
} from "./postAuthRouting";

const base: AuthRoutingState = {
	isLoaded: true,
	isSignedIn: true,
	hasActiveOrg: true,
	membershipCount: 1,
	needsMetadata: false,
};

describe("resolveAuthDestination", () => {
	it("returns 'loading' while not loaded", () => {
		expect(resolveAuthDestination({ ...base, isLoaded: false })).toBe(
			"loading"
		);
	});

	it("routes signed-out users to sign-in", () => {
		expect(
			resolveAuthDestination({ ...base, isSignedIn: false })
		).toBe("/(auth)/sign-in");
	});

	it("resumes the wizard when active org has incomplete metadata", () => {
		expect(
			resolveAuthDestination({
				isLoaded: true,
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
				isLoaded: true,
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
				isLoaded: true,
				isSignedIn: true,
				hasActiveOrg: false,
				membershipCount: 0,
				needsMetadata: undefined,
			})
		).toBe("/(onboarding)/create-organization");
	});
});

describe("navigateAfterAuth", () => {
	it("does NOT call replace when destination is 'loading'", () => {
		let called = false;
		navigateAfterAuth(() => {
			called = true;
		}, "loading");
		expect(called).toBe(false);
	});

	it("calls replace with the destination otherwise", () => {
		let arg: string | null = null;
		navigateAfterAuth((href) => {
			arg = href;
		}, "/(tabs)");
		expect(arg).toBe("/(tabs)");
	});
});
