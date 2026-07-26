import { v } from "convex/values";
import { optionalUserQuery } from "./lib/factories";
import type { Doc, Id } from "./_generated/dataModel";

// Naive in-memory matching is fine at current per-org data sizes (free cap is
// 10 clients). Upgrade path if that changes: Convex `.searchIndex` per table.
const BUCKET_LIMIT = 5;
const MIN_QUERY_LENGTH = 2;

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

function matches(q: string, ...fields: Array<string | undefined>): boolean {
	return fields.some((f) => f !== undefined && f.toLowerCase().includes(q));
}

function topByRecency<T extends { _creationTime: number }>(rows: T[]): T[] {
	return [...rows]
		.sort((a, b) => b._creationTime - a._creationTime)
		.slice(0, BUCKET_LIMIT);
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

		const result = emptyResult();

		if (await ctx.gateRead("clients")) {
			const allClients = await ctx.db
				.query("clients")
				.withIndex("by_org", (idx) => idx.eq("orgId", orgId))
				.collect();
			const visibleClients = (
				await ctx.applyReadScope("clients", allClients, (c, s) =>
					s.clientIds.has(c._id)
				)
			).filter((c) => c.status !== "archived");
			// Doubles as the read-scope filter for contacts/properties: a hit
			// only surfaces when its parent client is visible and not archived.
			const clientNameById = new Map(
				visibleClients.map((c) => [c._id, c.companyName])
			);

			const clientHits = topByRecency(
				visibleClients.filter(
					(c) =>
						matches(q, c.companyName, c.notes) ||
						(c.tags?.some((tag) => tag.toLowerCase().includes(q)) ?? false)
				)
			).map(
				(c): ClientSearchHit => ({
					clientId: c._id,
					kind: "client",
					label: c.companyName,
				})
			);

			const contacts = await ctx.db
				.query("clientContacts")
				.withIndex("by_org", (idx) => idx.eq("orgId", orgId))
				.collect();
			const contactHits = topByRecency(
				contacts.filter(
					(row) =>
						clientNameById.has(row.clientId) &&
						matches(
							q,
							`${row.firstName} ${row.lastName}`,
							row.email,
							row.jobTitle
						)
				)
			).map(
				(row): ClientSearchHit => ({
					clientId: row.clientId,
					kind: "contact",
					label: clientNameById.get(row.clientId)!,
					detail: `${row.firstName} ${row.lastName}`,
				})
			);

			const properties = await ctx.db
				.query("clientProperties")
				.withIndex("by_org", (idx) => idx.eq("orgId", orgId))
				.collect();
			const propertyHits = topByRecency(
				properties.filter(
					(row) =>
						clientNameById.has(row.clientId) &&
						matches(
							q,
							row.propertyName,
							row.streetAddress,
							row.city,
							row.state,
							row.zipCode
						)
				)
			).map(
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
			const projects = await ctx.db
				.query("projects")
				.withIndex("by_org", (idx) => idx.eq("orgId", orgId))
				.collect();
			const visible = await ctx.scopedToActor(
				"projects",
				projects,
				(p) => p.assignedUserIds
			);
			result.projects = topByRecency(
				visible.filter((p) =>
					matches(q, p.title, p.description, p.projectNumber)
				)
			).map(
				(p): ProjectSearchHit => ({
					projectId: p._id,
					label: p.title,
					detail: p.projectNumber,
				})
			);
		}

		if (await ctx.gateRead("quotes")) {
			const quotes = await ctx.db
				.query("quotes")
				.withIndex("by_org", (idx) => idx.eq("orgId", orgId))
				.collect();
			const visible = await ctx.applyReadScope("quotes", quotes, (row, s) =>
				row.projectId
					? s.projectIds.has(row.projectId)
					: s.clientIds.has(row.clientId)
			);
			const hits = topByRecency(
				visible.filter((row) =>
					matches(q, row.title, row.quoteNumber, row.clientMessage, row.terms)
				)
			);
			result.quotes = await Promise.all(
				hits.map(async (row): Promise<QuoteSearchHit> => {
					const client = await ctx.db.get(row.clientId);
					return {
						quoteId: row._id,
						label: row.title ?? row.quoteNumber ?? "Untitled quote",
						detail: client?.companyName,
					};
				})
			);
		}

		if (await ctx.gateRead("invoices")) {
			const invoices = await ctx.db
				.query("invoices")
				.withIndex("by_org", (idx) => idx.eq("orgId", orgId))
				.collect();
			const visible = await ctx.applyReadScope("invoices", invoices, (row, s) =>
				row.projectId
					? s.projectIds.has(row.projectId)
					: s.clientIds.has(row.clientId)
			);
			// Invoices carry no title/notes — invoiceNumber is the only text field.
			const hits = topByRecency(
				visible.filter((row) => matches(q, row.invoiceNumber))
			);
			result.invoices = await Promise.all(
				hits.map(async (row): Promise<InvoiceSearchHit> => {
					const client = await ctx.db.get(row.clientId);
					return {
						invoiceId: row._id,
						label: row.invoiceNumber,
						detail: client?.companyName,
					};
				})
			);
		}

		if (await ctx.gateRead("tasks")) {
			const tasks = await ctx.db
				.query("tasks")
				.withIndex("by_org", (idx) => idx.eq("orgId", orgId))
				.collect();
			const visible = await ctx.scopedToActor(
				"tasks",
				tasks,
				(t) => t.assigneeUserId
			);
			result.tasks = topByRecency(
				visible.filter((t) => matches(q, t.title, t.description))
			);
		}

		return result;
	},
});
