// Plan 13-02 Wave 1: portal helpers — dedicated coverage for jti-validation
// (Review fix #2) and createSession-internalMutation gating (Review fix #5)
// + touchSession public-with-capability shape (Blocker 3 Option A).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("portal helpers jti-validation", () => {
	it("createSession is internalMutation (Review fix #5 — not publicly exposed)", () => {
		const path = resolve(__dirname, "./sessions.ts");
		const src = readFileSync(path, "utf-8");
		expect(src).toContain(
			"export const createSession = internalMutation"
		);
		// Must not also be wrapped in `mutation(` — that would expose it publicly.
		expect(src).not.toMatch(
			/export const createSession = mutation\(/
		);
	});

	it("touchSession is a PUBLIC mutation with capability guard (Blocker 3 Option A)", () => {
		const path = resolve(__dirname, "./sessions.ts");
		const src = readFileSync(path, "utf-8");
		// touchSession MUST be `mutation(` (not `internalMutation`) so that
		// fetchMutation from the Next.js refresh route handler can invoke it.
		expect(src).toMatch(/export const touchSession = mutation\(/);
		expect(src).not.toContain(
			"export const touchSession = internalMutation"
		);
		// Capability guard MUST be in the handler — caller's jti must match
		// target jti before any patch.
		expect(src).toContain("getPortalSessionOrThrow(ctx)");
		expect(src).toContain("Cannot touch another session");
	});

	it("revokeSessionByJti is public + capability-gated (Review fix #5)", () => {
		const path = resolve(__dirname, "./sessions.ts");
		const src = readFileSync(path, "utf-8");
		expect(src).toMatch(
			/export const revokeSessionByJti = mutation\(/
		);
		expect(src).toContain("Cannot revoke another session");
	});

	it("getPortalSessionOrThrow performs DB-side jti revocation check (Review fix #2)", () => {
		const path = resolve(__dirname, "./helpers.ts");
		const src = readFileSync(path, "utf-8");
		expect(src).toContain('withIndex("by_jti"');
		// Generic error messages — no enumeration leak.
		const sessionExpiredMatches = (
			src.match(/Session revoked or expired/g) ?? []
		).length;
		expect(sessionExpiredMatches).toBeGreaterThanOrEqual(2);
		expect(src).toContain("Session integrity check failed");
	});

	it("getPortalSessionOrThrow accepts both convex-portal and convex-portal-access audiences (Review fix #4)", () => {
		const path = resolve(__dirname, "./helpers.ts");
		const src = readFileSync(path, "utf-8");
		expect(src).toContain('"convex-portal"');
		expect(src).toContain('"convex-portal-access"');
		expect(src).toContain("ACCEPTED_AUDIENCES");
		expect(src).toContain("sessionJti");
	});
});
