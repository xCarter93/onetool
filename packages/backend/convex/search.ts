import { v } from "convex/values";
import { optionalUserQuery } from "./lib/factories";
import type { Doc, Id } from "./_generated/dataModel";

// Cost is O(matched rows), not O(org rows): every bucket reads its table
// through the `search_text` search index (digest maintained in lib/triggers.ts,
// built by lib/searchText.ts) and takes at most OVERSCAN rows.
// Behavior change vs. the old scan: hits come back relevance-ordered by the
// search index (not newest-first) and match on word prefixes, not substrings.
const BUCKET_LIMIT = 5;
const MIN_QUERY_LENGTH = 2;
/** Rows pulled per bucket before RBAC/status filters trim to BUCKET_LIMIT. */
const OVERSCAN = 25;
/** Convex rejects a search expression with more than 16 terms. */
const MAX_QUERY_TERMS = 16;

export type ClientSearchHit = {
	clientId: Id<"clients">;
	/** Contact/property hits merge into the Clients group under the parent client. */
	kind: "client" | "contact" | "property";
	/** Parent client company name. */
	label: string;
	/** Contact full name or property address for merged hits. */
	detail?: string;
};

export type ProjectSearchHit = {
	projectId: Id<"projects">;
	label: string;
	detail?: string;
};

export type QuoteSearchHit = {
	quoteId: Id<"quotes">;
	label: string;
	detail?: string;
};

export type InvoiceSearchHit = {
	invoiceId: Id<"invoices">;
	label: string;
	detail?: string;
};

export type GlobalSearchResult = {
	clients: ClientSearchHit[];
	projects: ProjectSearchHit[];
	quotes: QuoteSearchHit[];
	invoices: InvoiceSearchHit[];
	/** Full docs: tasks have no detail route, the UI opens them in TaskSheet. */
	tasks: Doc<"tasks">[];
};

function emptyResult(): GlobalSearchResult {
	return { clients: [], projects: [], quotes: [], invoices: [], tasks: [] };
}

/**
 * Org-scoped search across clients (incl. contacts and properties), projects,
 * quotes, invoices, and tasks for the ⌘K palette. Buckets are gated with
 * `gateRead` (cross-cutting read) so a member without access to one object
 * still gets results for the others, and rows go through the same read-scope
 * filters as the per-entity list queries.
 */
export const globalSearch = optionalUserQuery({
	args: { query: v.string() },
	handler: async (ctx, args): Promise<GlobalSearchResult> => {
		const orgId = ctx.orgId;
		const q = args.query.trim().toLowerCase();
		if (!orgId || q.length < MIN_QUERY_LENGTH) return emptyResult();
		const searchQuery = q.split(/\s+/).slice(0, MAX_QUERY_TERMS).join(" ");

		const result = emptyResult();

		if (await ctx.gateRead("clients")) {
			// Plain table searches (no Convex component reads), so parallel is safe.
			const [clientRows, contactRows, propertyRows] = await Promise.all([
				ctx.db
					.query("clients")
					.withSearchIndex("search_text", (s) =>
						s.search("searchText", searchQuery).eq("orgId", orgId)
					)
					.take(OVERSCAN),
				ctx.db
					.query("clientContacts")
					.withSearchIndex("search_text", (s) =>
						s.search("searchText", searchQuery).eq("orgId", orgId)
					)
					.take(OVERSCAN),
				ctx.db
					.query("clientProperties")
					.withSearchIndex("search_text", (s) =>
						s.search("searchText", searchQuery).eq("orgId", orgId)
					)
					.take(OVERSCAN),
			]);

			// Parent-client cache: contacts/properties no longer piggyback on a
			// full clients scan, so each hit resolves its parent by id.
			const clientCache = new Map<Id<"clients">, Doc<"clients"> | null>();
			for (const row of clientRows) clientCache.set(row._id, row);
			const loadClient = async (id: Id<"clients">) => {
				if (!clientCache.has(id)) clientCache.set(id, await ctx.db.get(id));
				return clientCache.get(id) ?? null;
			};

			const visibleClients = (
				await ctx.applyReadScope("clients", clientRows, (c, s) =>
					s.clientIds.has(c._id)
				)
			).filter((c) => c.status !== "archived");

			const clientHits = visibleClients.slice(0, BUCKET_LIMIT).map(
				(c): ClientSearchHit => ({
					clientId: c._id,
					kind: "client",
					label: c.companyName,
				})
			);

			const parents: Doc<"clients">[] = [];
			const seenParents = new Set<Id<"clients">>();
			for (const row of [...contactRows, ...propertyRows]) {
				if (seenParents.has(row.clientId)) continue;
				seenParents.add(row.clientId);
				const parent = await loadClient(row.clientId);
				if (parent && parent.orgId === orgId) parents.push(parent);
			}
			// Same gate the old full-scan applied: a contact/property hit only
			// surfaces when its parent client is visible and not archived.
			const clientNameById = new Map(
				(
					await ctx.applyReadScope("clients", parents, (c, s) =>
						s.clientIds.has(c._id)
					)
				)
					.filter((c) => c.status !== "archived")
					.map((c) => [c._id, c.companyName] as const)
			);

			const contactHits = contactRows
				.filter((row) => clientNameById.has(row.clientId))
				.slice(0, BUCKET_LIMIT)
				.map(
					(row): ClientSearchHit => ({
						clientId: row.clientId,
						kind: "contact",
						label: clientNameById.get(row.clientId)!,
						detail: `${row.firstName} ${row.lastName}`,
					})
				);

			const propertyHits = propertyRows
				.filter((row) => clientNameById.has(row.clientId))
				.slice(0, BUCKET_LIMIT)
				.map(
					(row): ClientSearchHit => ({
						clientId: row.clientId,
						kind: "property",
						label: clientNameById.get(row.clientId)!,
						detail: `${row.streetAddress}, ${row.city}`,
					})
				);

			result.clients = [...clientHits, ...contactHits, ...propertyHits];
		}

		if (await ctx.gateRead("projects")) {
			const rows = await ctx.db
				.query("projects")
				.withSearchIndex("search_text", (s) =>
					s.search("searchText", searchQuery).eq("orgId", orgId)
				)
				.take(OVERSCAN);
			const visible = await ctx.scopedToActor(
				"projects",
				rows,
				(p) => p.assignedUserIds
			);
			result.projects = visible.slice(0, BUCKET_LIMIT).map(
				(p): ProjectSearchHit => ({
					projectId: p._id,
					label: p.title,
					detail: p.projectNumber,
				})
			);
		}

		if (await ctx.gateRead("quotes")) {
			const rows = await ctx.db
				.query("quotes")
				.withSearchIndex("search_text", (s) =>
					s.search("searchText", searchQuery).eq("orgId", orgId)
				)
				.take(OVERSCAN);
			const visible = await ctx.applyReadScope("quotes", rows, (row, s) =>
				row.projectId
					? s.projectIds.has(row.projectId)
					: s.clientIds.has(row.clientId)
			);
			result.quotes = await Promise.all(
				visible.slice(0, BUCKET_LIMIT).map(
					async (row): Promise<QuoteSearchHit> => {
						const client = await ctx.db.get(row.clientId);
						return {
							quoteId: row._id,
							label: row.title ?? row.quoteNumber ?? "Untitled quote",
							detail: client?.companyName,
						};
					}
				)
			);
		}

		if (await ctx.gateRead("invoices")) {
			// Invoices carry no title/notes — invoiceNumber is the only text field.
			const rows = await ctx.db
				.query("invoices")
				.withSearchIndex("search_text", (s) =>
					s.search("searchText", searchQuery).eq("orgId", orgId)
				)
				.take(OVERSCAN);
			const visible = await ctx.applyReadScope("invoices", rows, (row, s) =>
				row.projectId
					? s.projectIds.has(row.projectId)
					: s.clientIds.has(row.clientId)
			);
			result.invoices = await Promise.all(
				visible.slice(0, BUCKET_LIMIT).map(
					async (row): Promise<InvoiceSearchHit> => {
						const client = await ctx.db.get(row.clientId);
						return {
							invoiceId: row._id,
							label: row.invoiceNumber,
							detail: client?.companyName,
						};
					}
				)
			);
		}

		if (await ctx.gateRead("tasks")) {
			const rows = await ctx.db
				.query("tasks")
				.withSearchIndex("search_text", (s) =>
					s.search("searchText", searchQuery).eq("orgId", orgId)
				)
				.take(OVERSCAN);
			const visible = await ctx.scopedToActor(
				"tasks",
				rows,
				(t) => t.assigneeUserId
			);
			result.tasks = visible.slice(0, BUCKET_LIMIT);
		}

		return result;
	},
});
