import type { PermissionObject } from "./permissionKeys";

/**
 * Gate a dashboard statistic on org-wide visibility of what it counts.
 *
 * Every dashboard figure is an org-wide total — the aggregate components are
 * keyed by org, and the `.collect()` fallbacks page `by_org` — so `view` alone
 * is not enough. Without the allRecords check a member restricted to their own
 * assignments still read the organisation's client counts, revenue and
 * pipeline. Owners and admins resolve to "all" grants and are unaffected, and
 * members are routed to /projects rather than /home, so the practical reach of
 * this is the assistant's getHomeStats tool.
 */
export async function requireOrgWideView(
	ctx: {
		requireLevel: (o: PermissionObject, l: "view") => Promise<void>;
		requireRecordScope: (
			o: PermissionObject,
			isInScope: () => boolean | Promise<boolean>
		) => Promise<void>;
	},
	...objects: PermissionObject[]
): Promise<void> {
	for (const object of objects) {
		await ctx.requireLevel(object, "view");
		// Denies unless the caller holds allRecords.
		await ctx.requireRecordScope(object, () => false);
	}
}
