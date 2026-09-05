import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../lib/triggers";
import { periodKeyFor } from "../lib/entitlements";

const ORG_PAGE_SIZE = 20;

/**
 * Seed this month's `esignatures` planUsage row from documents.boldsign.sentAt,
 * which the legacy counter read directly. Without it every free org restarts
 * at 0/5 on deploy. Idempotent: `used` is raised to the document count when
 * lower, never decremented, and a bonus already on the row is kept. Run once from the
 * dashboard right after deploy: migrations/backfillEsignatureUsage:backfillEsignatureUsage {}.
 */
export const backfillEsignatureUsage = internalMutation({
	args: { cursor: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const now = Date.now();
		const d = new Date(now);
		const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
		const periodKey = periodKeyFor("calendarMonth", now);

		const page = await ctx.db
			.query("organizations")
			.paginate({ cursor: args.cursor ?? null, numItems: ORG_PAGE_SIZE });

		let seeded = 0;
		for (const org of page.page) {
			const documents = await ctx.db
				.query("documents")
				.withIndex("by_org", (q) => q.eq("orgId", org._id))
				.collect();
			const used = documents.filter(
				(doc) => (doc.boldsign?.sentAt ?? 0) >= monthStart
			).length;
			if (used === 0) continue;

			const existing = await ctx.db
				.query("planUsage")
				.withIndex("by_org_meter_period", (q) =>
					q.eq("orgId", org._id).eq("meter", "esignatures").eq("periodKey", periodKey)
				)
				.unique();
			if (existing) {
				// Never lower: a webhook may have consumed the meter since deploy.
				if (existing.used < used) await ctx.db.patch(existing._id, { used });
			} else {
				await ctx.db.insert("planUsage", {
					orgId: org._id,
					meter: "esignatures",
					periodKey,
					used,
				});
			}
			seeded++;
		}

		if (!page.isDone) {
			await ctx.scheduler.runAfter(
				0,
				internal.migrations.backfillEsignatureUsage.backfillEsignatureUsage,
				{ cursor: page.continueCursor }
			);
		}
		return { scanned: page.page.length, seeded, isDone: page.isDone };
	},
});
