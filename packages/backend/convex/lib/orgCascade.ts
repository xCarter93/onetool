import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { assistantAgent } from "../assistantAgent";
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
	"teamMessages",
	"emailAttachments",
	"projectDocuments",
	"clientDocuments",
	"documents",
	"organizationDocuments",
	"organizationDocumentFolders", // parents of organizationDocuments — drain after them
	"activities",
	"notifications",
	"workflowExecutions",
	"automationRunStats",
	"workflowAutomations",
	"domainEvents",
	"reports",
	"communityPages",
	"skus",
	"emailMessages",
	"emailThreads",
	"emailSuppressions",
	"routes", // stops reference clientProperties — drain before them
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
	// QuickBooks integration (jobs, links, and import rows before their parent
	// runs; the connection row last).
	"quickbooksSyncJobs",
	"quickbooksEntityLinks",
	"quickbooksImportRows",
	"quickbooksImportRuns",
	"quickbooksConnections",
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

	// teamMessages — parent of new messageAttachments (drained above); no storage.
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("teamMessages")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
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

	// organizationDocumentFolders — no blobs; drained after their documents.
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("organizationDocumentFolders")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
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

	// automationRunStats
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("automationRunStats")
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

	// emailThreads
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("emailThreads")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// emailSuppressions — org-scoped rows only; global rows (orgId undefined)
	// are deliberately retained (they aren't owned by any org).
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("emailSuppressions")
			.withIndex("by_org_email", (q) => q.eq("orgId", orgId))
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

	// Aggregate-tracked parents (aggregates maintained by lib/triggers.ts).

	// quotes (after quoteLineItems + quoteApprovals)
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("quotes")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
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

	// quickbooksSyncJobs
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("quickbooksSyncJobs")
			.withIndex("by_org_status", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// quickbooksEntityLinks
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("quickbooksEntityLinks")
			.withIndex("by_org_entity", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// quickbooksImportRows — children of quickbooksImportRuns; drain first.
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("quickbooksImportRows")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// quickbooksImportRuns
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("quickbooksImportRuns")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// quickbooksConnections — revoke live tokens at Intuit before dropping the row.
	{
		if (remaining <= 0) return { done: false };
		const rows = await ctx.db
			.query("quickbooksConnections")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.take(remaining);
		for (const row of rows) {
			if (row.status !== "disconnected") {
				// Explicit-token form: the doc is deleted in this transaction, so
				// the action cannot read it. The arg is consumed once and never
				// logged; every other caller passes orgId instead.
				await ctx.scheduler.runAfter(
					0,
					internal.quickbooksActions.revokeConnection,
					{ refreshToken: row.refreshToken }
				);
			}
			await ctx.db.delete(row._id);
			remaining--;
		}
	}

	// Probed EVERY table within budget; all returned zero rows.
	return { done: true };
}
