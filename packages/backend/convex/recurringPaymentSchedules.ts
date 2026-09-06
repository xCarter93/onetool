import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./lib/triggers";
import { activateMonthlyPaymentSchedule, cancelMonthlyPaymentProposal } from "./lib/recurringPaymentChanges";
import { userMutation, userQuery, type UserQueryCtx } from "./lib/factories";
import { dateKeyFromTimestamp } from "./lib/projectRecurrence";

async function requireScheduleAccess(ctx: UserQueryCtx, modify: boolean) {
	await ctx.requireLevel("projects", modify ? "modify" : "view");
	await ctx.requireLevel("quotes", modify ? "modify" : "view");
	await ctx.requireLevel("invoices", modify ? "modify" : "view");
	if (!(await ctx.hasAllRecords("projects")) || !(await ctx.hasAllRecords("quotes")) || !(await ctx.hasAllRecords("invoices")))
		throw new ConvexError("Organization-wide project, quote and invoice access is required for shared payment schedules");
}

export const getPending = userQuery({
	args: { clientId: v.id("clients") },
	returns: v.union(v.null(), v.object({ versionId: v.id("clientMonthlyPaymentScheduleVersions"), status: v.union(v.literal("pending_approval"), v.literal("scheduled")), effectiveMonth: v.optional(v.string()), approvedCount: v.number(), requiredCount: v.number(), canCancel: v.boolean(), cancellationReason: v.optional(v.string()) })),
	handler: async (ctx, args) => {
		await requireScheduleAccess(ctx, false);
		await ctx.orgEntity("clients", args.clientId);
		const pointer = await ctx.db.query("clientMonthlyPaymentSchedules").withIndex("by_org_client", (q) => q.eq("orgId", ctx.orgId).eq("clientId", args.clientId)).unique();
		if (!pointer?.pendingVersionId) return null;
		const version = await ctx.orgEntity("clientMonthlyPaymentScheduleVersions", pointer.pendingVersionId);
		if (version.status !== "pending_approval" && version.status !== "scheduled") return null;
		let partiallyActivated = false;
		for (const revisionId of version.agreementRevisionIds) {
			const revision = await ctx.orgEntity("projectSeriesAgreementRevisions", revisionId);
			const series = await ctx.orgEntity("projectSeries", revision.seriesId);
			if (series.activeAgreementRevisionId === revisionId) partiallyActivated = true;
		}
		const org = await ctx.db.get(ctx.orgId);
		if (!org) throw new ConvexError("Organization is unavailable");
		const alreadyEffective = Boolean(version.effectiveMonth && version.effectiveMonth <= dateKeyFromTimestamp(Date.now(), org.timezone ?? "UTC").slice(0, 7));
		return { versionId: version._id, status: version.status, effectiveMonth: version.effectiveMonth, approvedCount: version.approvedSeriesIds.length, requiredCount: version.seriesIds.length, canCancel: !partiallyActivated && !alreadyEffective, cancellationReason: partiallyActivated ? "The proposal has started activating" : alreadyEffective ? "The payment schedule is already effective" : undefined };
	},
});

export const cancelPending = userMutation({
	args: { clientId: v.id("clients"), expectedVersionId: v.id("clientMonthlyPaymentScheduleVersions") }, returns: v.null(),
	handler: async (ctx, args) => {
		await requireScheduleAccess(ctx, true);
		await ctx.orgEntity("clients", args.clientId);
		await cancelMonthlyPaymentProposal(ctx, { orgId: ctx.orgId, clientId: args.clientId, expectedVersionId: args.expectedVersionId });
		return null;
	},
});

export const activateClient = internalMutation({
	args: { orgId: v.id("organizations"), clientId: v.id("clients") }, returns: v.null(),
	handler: async (ctx, args) => {
		await activateMonthlyPaymentSchedule(ctx, args.orgId, args.clientId);
		return null;
	},
});

export const sweep = internalMutation({
	args: { cursor: v.optional(v.string()) }, returns: v.null(),
	handler: async (ctx, args) => {
		const versions = await ctx.db.query("clientMonthlyPaymentScheduleVersions").withIndex("by_status_month", (q) => q.eq("status", "scheduled")).paginate({ cursor: args.cursor ?? null, numItems: 25 });
		for (const version of versions.page) await ctx.scheduler.runAfter(0, internal.recurringPaymentSchedules.activateClient, { orgId: version.orgId, clientId: version.clientId });
		if (!versions.isDone) await ctx.scheduler.runAfter(0, internal.recurringPaymentSchedules.sweep, { cursor: versions.continueCursor });
		return null;
	},
});
