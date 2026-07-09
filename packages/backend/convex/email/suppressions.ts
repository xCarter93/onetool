import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

/** True if `email` must not be sent to for this org (org-scoped or global suppression). */
export async function isSuppressed(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	email: string
): Promise<boolean> {
	const normalized = normalizeEmail(email);
	const matches = await ctx.db
		.query("emailSuppressions")
		.withIndex("by_email", (q) => q.eq("email", normalized))
		.collect();
	return matches.some((s) => s.orgId === undefined || s.orgId === orgId);
}

/** Idempotently record a suppression; returns the (existing or new) row id. */
export async function recordSuppression(
	ctx: MutationCtx,
	args: {
		orgId?: Id<"organizations">;
		email: string;
		reason: "hard_bounce" | "complaint" | "manual";
		source: string;
	}
): Promise<Id<"emailSuppressions">> {
	const email = normalizeEmail(args.email);
	const orgId = args.orgId;
	const existing = await ctx.db
		.query("emailSuppressions")
		.withIndex("by_org_email", (q) => q.eq("orgId", orgId).eq("email", email))
		.first();
	if (existing) return existing._id;
	return await ctx.db.insert("emailSuppressions", {
		orgId,
		email,
		reason: args.reason,
		source: args.source,
		createdAt: Date.now(),
	});
}
