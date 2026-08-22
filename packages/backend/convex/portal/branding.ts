import { query } from "../_generated/server";
import { v } from "convex/values";
import { entitlementsFromDocs, isFeatureAllowed } from "../lib/entitlements";

/**
 * Public unauthenticated query that resolves a portal access ID to the owning
 * organization's minimal branding payload (logoUrl + name). Used by the
 * branded portal layout shell to render header chrome before the visitor
 * has authenticated.
 *
 * Returns `null` for unknown IDs — never throws — to avoid enumeration leaks
 * (RESEARCH §Pattern 6, locked CONTEXT decision: "no enumeration-friendly
 * details"). Client PII (email, phone, address) is intentionally omitted.
 */
export const getPortalBranding = query({
	args: { clientPortalId: v.string() },
	handler: async (ctx, { clientPortalId }) => {
		const client = await ctx.db
			.query("clients")
			.withIndex("by_portal_access_id", (q) =>
				q.eq("portalAccessId", clientPortalId)
			)
			.unique();
		if (!client) return null;

		const org = await ctx.db.get(client.orgId);
		if (!org) return null;

		// The portal tree's single entitlement read, display-only by design:
		// free orgs' portals carry the "Powered by OneTool" badge; Business
		// removes it. Resolved via the docs path on the org already loaded —
		// portal visitors have no identity to resolve.
		const showPoweredByBadge = !isFeatureAllowed(
			entitlementsFromDocs(org).plan,
			"portalBadgeRemoval"
		);

		return {
			clientPortalId,
			logoUrl: org.logoUrl ?? null,
			logoInvertInDarkMode: org.logoInvertInDarkMode ?? false,
			name: org.name,
			showPoweredByBadge,
		};
	},
});
