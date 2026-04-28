// Plan 13-02 Wave 1: PORTAL-02 getPortalBranding — flipped from red stub to green.
// Public unauthenticated query that resolves a clientPortalId to its owning
// org's branding (logoUrl, name). Returns null for unknown IDs (no enumeration
// leak). MUST NOT include any client PII (emails/phones/addresses).
import { describe, it, expect, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import { setupConvexTest } from "../test.setup";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

describe("portal branding", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("returns logo and name for valid clientPortalId", async () => {
		const portalId = "abc-123-portal";
		await t.run(async (ctx) => {
			const userId = await ctx.db.insert("users", {
				name: "Owner",
				email: "owner@example.com",
				image: "https://example.com/u.png",
				externalId: "user_owner",
			});
			const orgId: Id<"organizations"> = await ctx.db.insert(
				"organizations",
				{
					clerkOrganizationId: "org_acme",
					name: "Acme",
					ownerUserId: userId,
					logoUrl: "https://example.com/logo.png",
					logoInvertInDarkMode: true,
				}
			);
			await ctx.db.insert("clients", {
				orgId,
				companyName: "Acme Client",
				status: "active",
				portalAccessId: portalId,
			});
		});

		const result = await t.query(api.portal.branding.getPortalBranding, {
			clientPortalId: portalId,
		});
		expect(result).not.toBeNull();
		expect(result?.name).toBe("Acme");
		expect(result?.logoUrl).toBe("https://example.com/logo.png");
		expect(result?.logoInvertInDarkMode).toBe(true);
		expect(result?.clientPortalId).toBe(portalId);
	});

	it("returns null for unknown clientPortalId", async () => {
		const result = await t.query(api.portal.branding.getPortalBranding, {
			clientPortalId: "never-existed",
		});
		expect(result).toBeNull();
	});
});
