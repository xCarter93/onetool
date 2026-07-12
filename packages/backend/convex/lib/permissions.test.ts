import { describe, it, expect } from "vitest";
import { isAdminRole } from "./permissions";
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
