// Plan 13-02 Wave 1: PORTAL-05 dual auth provider — flipped from red stub to green.
// Verifies that auth.config.ts declares BOTH the Clerk provider and the portal
// provider. Static file inspection is the lightest possible coverage given that
// auth.config.ts is consumed by Convex's auth runtime, not by user code.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("portal auth provider", () => {
	it("auth.config.ts contains both Clerk and portal providers with distinct applicationIDs", () => {
		const path = resolve(__dirname, "../auth.config.ts");
		const src = readFileSync(path, "utf-8");

		// Both provider applicationIDs must be present.
		expect(src).toContain('applicationID: "convex"');
		expect(src).toContain('applicationID: "convex-portal"');

		// The portal provider domain must read from the server-only env var.
		expect(src).toContain("process.env.PORTAL_JWT_ISSUER");

		// [Review fix #9] Explicit JWKS URL — Convex cannot infer non-default
		// discovery paths from `domain` alone.
		expect(src).toContain("/.well-known/portal-jwks.json");
		expect(src).toMatch(/jwks:\s*`/);
	});
});
