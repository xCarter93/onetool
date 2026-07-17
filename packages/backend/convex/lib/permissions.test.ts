import { describe, it, expect } from "vitest";
import {
	PREMIUM_PLAN_SLUG,
	isAdminRole,
	orgHasPremiumPlan,
	readPremiumOverride,
	userHasPremiumOverride,
} from "./permissions";
import { isPermissionObject } from "./permissionKeys";

describe("isAdminRole", () => {
	it("matches admins regardless of stored format", () => {
		// Prod stores Clerk's verbatim "org:admin"; tests/legacy rows store bare "admin".
		expect(isAdminRole("org:admin")).toBe(true);
		expect(isAdminRole("admin")).toBe(true);
		expect(isAdminRole("Org:Admin")).toBe(true);
		expect(isAdminRole("  org:admin  ")).toBe(true);
	});

	it("rejects members and other non-admin roles", () => {
		expect(isAdminRole("org:member")).toBe(false);
		expect(isAdminRole("member")).toBe(false);
		expect(isAdminRole("guest")).toBe(false);
	});

	it("does not match substring collisions (exact role match)", () => {
		// The role gates the RBAC resolver's "all-access" short-circuit, so a
		// substring match here would be a privilege-escalation vector.
		expect(isAdminRole("not-an-admin")).toBe(false);
		expect(isAdminRole("org:administrator")).toBe(false);
		expect(isAdminRole("superadmin")).toBe(false);
		expect(isAdminRole("badmin")).toBe(false);
	});

	it("is secure-by-default on nullish/empty input", () => {
		expect(isAdminRole(undefined)).toBe(false);
		expect(isAdminRole(null)).toBe(false);
		expect(isAdminRole("")).toBe(false);
	});
});

describe("readPremiumOverride", () => {
	it("reads the granted flag out of Clerk public_metadata", () => {
		expect(readPremiumOverride({ has_premium_feature_access: true })).toBe(true);
	});

	it("treats a revoke (key set to null) as not premium", () => {
		// The admin console revokes by writing the key back as null rather than
		// deleting it, so anything but `true` MUST read false or the revoke would
		// never propagate to the doc mirror.
		expect(readPremiumOverride({ has_premium_feature_access: null })).toBe(
			false
		);
		expect(readPremiumOverride({ has_premium_feature_access: false })).toBe(
			false
		);
		expect(readPremiumOverride({ has_premium_feature_access: "true" })).toBe(
			false
		);
		expect(readPremiumOverride({ has_premium_feature_access: 1 })).toBe(false);
	});

	it("is secure-by-default on missing or non-object metadata", () => {
		expect(readPremiumOverride({})).toBe(false);
		expect(readPremiumOverride(undefined)).toBe(false);
		expect(readPremiumOverride(null)).toBe(false);
		expect(readPremiumOverride("nonsense")).toBe(false);
	});
});

describe("orgHasPremiumPlan", () => {
	it("honors the webhook-synced org-level override without a paid plan", () => {
		// The whole point of the doc mirror: cron has no JWT to read the override
		// from, so an override-premium org must pass on the doc alone.
		expect(orgHasPremiumPlan({ hasPremiumFeatureAccess: true })).toBe(true);
	});

	it("still passes a genuinely subscribed org with no override", () => {
		expect(
			orgHasPremiumPlan({
				clerkPlanSlug: PREMIUM_PLAN_SLUG,
				subscriptionStatus: "active",
			})
		).toBe(true);
	});

	it("rejects an org with neither an override nor an active paid plan", () => {
		expect(orgHasPremiumPlan({ hasPremiumFeatureAccess: false })).toBe(false);
		expect(
			orgHasPremiumPlan({
				clerkPlanSlug: PREMIUM_PLAN_SLUG,
				subscriptionStatus: "canceled",
			})
		).toBe(false);
		expect(orgHasPremiumPlan({})).toBe(false);
		expect(orgHasPremiumPlan(null)).toBe(false);
	});
});

describe("userHasPremiumOverride", () => {
	it("reads the user-level mirror", () => {
		expect(userHasPremiumOverride({ hasPremiumFeatureAccess: true })).toBe(true);
	});

	it("is secure-by-default when unset or absent", () => {
		expect(userHasPremiumOverride({ hasPremiumFeatureAccess: false })).toBe(
			false
		);
		expect(userHasPremiumOverride({})).toBe(false);
		expect(userHasPremiumOverride(null)).toBe(false);
	});
});

describe("isPermissionObject", () => {
	it("matches registered permission objects", () => {
		expect(isPermissionObject("clients")).toBe(true);
		expect(isPermissionObject("projects")).toBe(true);
	});

	it("rejects unregistered keys, including prototype-chain properties", () => {
		expect(isPermissionObject("toString")).toBe(false);
		expect(isPermissionObject("constructor")).toBe(false);
		expect(isPermissionObject("hasOwnProperty")).toBe(false);
		expect(isPermissionObject("not-a-real-object")).toBe(false);
	});
});
