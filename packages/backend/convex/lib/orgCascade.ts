import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { assistantAgent } from "../assistantAgent";
import { AggregateHelpers } from "./aggregates";
import { StorageHelpers } from "./storage";

/**
 * Single source of truth for org-scoped data erasure.
 *
 * Keep ORG_SCOPED_CASCADE_TABLES in sync with the org-scoped tables in
 * schema.ts (the schema-coverage test enforces this). Runs in bounded pages
 * driven by the chunk worker (orgCascade.ts). Returns { done: false } the
 * instant the per-page delete budget is exhausted, so a full page can never
 * falsely report the org is fully drained.
 *
 * Does NOT delete the organizations row or organizationMemberships — the
 * deletion entry points handle those synchronously.
 */

// Bounded page size, mirroring push.ts EXPO_CHUNK_SIZE precedent.
export const CASCADE_PAGE_SIZE = 100;

// The exact ordered set of org-scoped tables this routine drains. Compared
// against schema.ts org-scoped tables (minus organizations + organizationMemberships)
// by the schema-coverage guard test so a future org-scoped table cannot be
// silently missed.
export const ORG_SCOPED_CASCADE_TABLES = [
	// Leaf / child tables first (children before parents).
	"quoteApprovals",
	"quoteLineItems",
	"invoiceLineItems",
	"payments",
	"messageAttachments",
	"emailAttachments",
	"projectDocuments",
	"clientDocuments",
	"documents",
	"organizationDocuments",
	"activities",
	"notifications",
	"workflowExecutions",
	"workflowAutomations",
	"domainEvents",
	"reports",
	"communityPages",
	"skus",
	"emailMessages",
	"clientContacts",
	"clientProperties",
	"tasks",
	// Aggregate-tracked parents.
	"quotes",
	"invoices",
	"projects",
	"clients",
	// Former no-index tables (by_org added in Task 0).
	"userFavorites",
	"portalSessions",
	"portalOtpCodes",
	// AI assistant metadata (component-side thread data deleted async per row).
	"agentThreadMeta",
	"agentUsage",
] as const;

/**
 * Drains up to `limit` org-scoped rows for `orgId` in leaf-first order.
 * Storage- and aggregate-aware. Budget-honest: returns { done: false } the
 * moment the budget reaches zero, without probing the remaining tables.
 */
export async function cascadeDeleteOrgDataPage(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	limit: number
): Promise<{ done: boolean }> {
	let remaining = limit;

	// quoteApprovals — by_org is [orgId, createdAt]; may hold signatureStorageId.
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("quoteApprovals")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			if (row.signatureStorageId) {
				await StorageHelpers.deleteFromStorage(ctx, row.signatureStorageId);
			}
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// quoteLineItems
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("quoteLineItems")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// invoiceLineItems
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("invoiceLineItems")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// payments
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("payments")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// messageAttachments — storageId (required).
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("messageAttachments")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await StorageHelpers.deleteFromStorage(ctx, row.storageId);
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// emailAttachments — storageId (optional).
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("emailAttachments")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			if (row.storageId) {
				await StorageHelpers.deleteFromStorage(ctx, row.storageId);
			}
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// projectDocuments — storageId (required).
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("projectDocuments")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await StorageHelpers.deleteFromStorage(ctx, row.storageId);
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// clientDocuments — storageId (required).
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("clientDocuments")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await StorageHelpers.deleteFromStorage(ctx, row.storageId);
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// documents — storageId (required) + signedStorageId (optional).
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("documents")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await StorageHelpers.deleteFromStorage(ctx, row.storageId);
			if (row.signedStorageId) {
				await StorageHelpers.deleteFromStorage(ctx, row.signedStorageId);
			}
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// organizationDocuments — storageId (required).
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("organizationDocuments")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await StorageHelpers.deleteFromStorage(ctx, row.storageId);
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// activities — by_org_timestamp is [orgId, timestamp].
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("activities")
			.withIndex("by_org_timestamp", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// notifications
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("notifications")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// workflowExecutions
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("workflowExecutions")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// workflowAutomations
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("workflowAutomations")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// domainEvents
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("domainEvents")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// reports
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("reports")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// communityPages — banner/avatar/galleryItems[].storageId (all optional).
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("communityPages")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			if (row.bannerStorageId) {
				await StorageHelpers.deleteFromStorage(ctx, row.bannerStorageId);
			}
			if (row.avatarStorageId) {
				await StorageHelpers.deleteFromStorage(ctx, row.avatarStorageId);
			}
			for (const item of row.galleryItemsDraft ?? []) {
				await StorageHelpers.deleteFromStorage(ctx, item.storageId);
			}
			for (const item of row.galleryItemsPublished ?? []) {
				await StorageHelpers.deleteFromStorage(ctx, item.storageId);
			}
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// skus
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("skus")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// emailMessages
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("emailMessages")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// clientContacts
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("clientContacts")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// clientProperties
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("clientProperties")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// tasks
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("tasks")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// Aggregate-tracked parents — remove from aggregate BEFORE deleting the row.

	// quotes (after quoteLineItems + quoteApprovals)
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("quotes")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await AggregateHelpers.removeQuote(ctx, row);
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// invoices (after invoiceLineItems + payments)
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("invoices")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await AggregateHelpers.removeInvoice(ctx, row);
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// projects (after tasks + projectDocuments)
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("projects")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await AggregateHelpers.removeProject(ctx, row);
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// clients (after clientContacts + clientProperties + clientDocuments + all the above)
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("clients")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await AggregateHelpers.removeClient(ctx, row);
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// Former no-index tables — index-bounded via by_org (Task 0).

	// userFavorites
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("userFavorites")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// portalSessions
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("portalSessions")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// portalOtpCodes
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("portalOtpCodes")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// agentThreadMeta — also schedules component-side thread/message deletion.
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("agentThreadMeta")
			.withIndex("by_org_user", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await assistantAgent.deleteThreadAsync(ctx, { threadId: row.threadId });
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// agentUsage
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("agentUsage")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// Probed EVERY table within budget; all returned zero rows.
	return { done: true };
}
