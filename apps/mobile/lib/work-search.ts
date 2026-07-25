import { formatDocumentDate } from "@/lib/format";

// ============================================================================
// Work tab search/browse logic. Pure — no React, no Convex, no RN. Everything
// the Work screen decides about matching, grouping and ordering lives here so it
// can be unit-tested in the node vitest environment.
// ============================================================================

export type WorkKind = "client" | "project" | "quote" | "invoice";

type WorkRecordBase = {
	/** Convex document id, stringly-typed (the screen only routes with it). */
	id: string;
	title: string;
	/** Single metadata line rendered under the title. */
	meta: string;
	/** STATUS key for `<Badge status=… />`. */
	status: string;
	/**
	 * Best available recency signal (ms epoch). No table carries an `updatedAt`
	 * column, so adapters use the closest activity timestamp and fall back to
	 * `_creationTime`. Undefined is tolerated by `sortByRecency`.
	 */
	updatedAt?: number;
	/** Pre-lowered haystack — the ONLY thing `filterRecords` matches against. */
	searchText: string;
};

export type WorkRecord =
	| (WorkRecordBase & { kind: "client" })
	| (WorkRecordBase & { kind: "project" })
	| (WorkRecordBase & { kind: "quote"; amount: number })
	| (WorkRecordBase & { kind: "invoice"; amount: number });

/** Chip order, grouped-result order, and section-header order — one list. */
export const KIND_ORDER: readonly WorkKind[] = [
	"client",
	"project",
	"quote",
	"invoice",
];

export const KIND_LABEL: Record<WorkKind, string> = {
	client: "Clients",
	project: "Projects",
	quote: "Quotes",
	invoice: "Invoices",
};

// ----------------------------------------------------------------------------
// Convex doc shapes, narrowed to the fields the adapters read. Structural, so
// a real `Doc<"clients">` satisfies it and a test fixture can be hand-built.
// ----------------------------------------------------------------------------

export type ClientInput = {
	_id: string;
	_creationTime: number;
	companyName: string;
	companyDescription?: string;
	status: string;
	tags?: string[];
	notes?: string;
};

export type ProjectInput = {
	_id: string;
	_creationTime: number;
	clientId: string;
	title: string;
	description?: string;
	projectNumber?: string;
	status: string;
	completedAt?: number;
};

export type QuoteInput = {
	_id: string;
	_creationTime: number;
	clientId: string;
	title?: string;
	quoteNumber?: string;
	status: string;
	total: number;
	sentAt?: number;
	approvedAt?: number;
};

export type InvoiceInput = {
	_id: string;
	_creationTime: number;
	clientId: string;
	invoiceNumber: string;
	status: string;
	total: number;
	dueDate: number;
	paidAt?: number;
};

export type AdapterOptions = {
	/** Resolved client display name — see `buildClientNameMap`. */
	clientName?: string;
	/** Reference time for the synthetic overdue status. Defaults to now. */
	now?: number;
};

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function joinMeta(parts: (string | undefined | null)[]): string {
	return parts
		.map((p) => p?.trim())
		.filter((p): p is string => !!p)
		.join(" · ");
}

function haystack(parts: (string | undefined | null)[]): string {
	return parts
		.map((p) => p?.trim())
		.filter((p): p is string => !!p)
		.join(" ")
		.toLowerCase();
}

/** Map client id → display name, for the meta line of the other three kinds. */
export function buildClientNameMap(
	clients: readonly Pick<ClientInput, "_id" | "companyName">[] | undefined
): Map<string, string> {
	const map = new Map<string, string>();
	clients?.forEach((c) => map.set(c._id, c.companyName));
	return map;
}

// ----------------------------------------------------------------------------
// Adapters
// ----------------------------------------------------------------------------

export function toClientRecord(doc: ClientInput): WorkRecord {
	const tags = doc.tags?.join(" · ");
	return {
		kind: "client",
		id: doc._id,
		title: doc.companyName,
		meta:
			doc.companyDescription?.trim() ||
			tags?.trim() ||
			`Added ${formatDocumentDate(doc._creationTime)}`,
		status: doc.status,
		updatedAt: doc._creationTime,
		searchText: haystack([
			doc.companyName,
			doc.companyDescription,
			tags,
			doc.notes,
			doc.status,
		]),
	};
}

export function toProjectRecord(
	doc: ProjectInput,
	options: AdapterOptions = {}
): WorkRecord {
	const meta = joinMeta([options.clientName, doc.projectNumber]);
	return {
		kind: "project",
		id: doc._id,
		title: doc.title,
		meta: meta || `Added ${formatDocumentDate(doc._creationTime)}`,
		status: doc.status,
		updatedAt: doc.completedAt ?? doc._creationTime,
		searchText: haystack([
			doc.title,
			doc.description,
			doc.projectNumber,
			options.clientName,
			doc.status,
		]),
	};
}

export function toQuoteRecord(
	doc: QuoteInput,
	options: AdapterOptions = {}
): WorkRecord {
	const meta = joinMeta([options.clientName, doc.quoteNumber]);
	return {
		kind: "quote",
		id: doc._id,
		title: doc.title?.trim() || doc.quoteNumber?.trim() || "Quote",
		meta: meta || `Created ${formatDocumentDate(doc._creationTime)}`,
		status: doc.status,
		amount: doc.total,
		updatedAt: doc.approvedAt ?? doc.sentAt ?? doc._creationTime,
		searchText: haystack([
			doc.title,
			doc.quoteNumber,
			options.clientName,
			doc.status,
		]),
	};
}

export function toInvoiceRecord(
	doc: InvoiceInput,
	options: AdapterOptions = {}
): WorkRecord {
	// A past-due `sent` invoice DISPLAYS as overdue (money tab / web parity — the
	// stored status is only flipped by the reconcile cron).
	const now = options.now ?? Date.now();
	const status =
		doc.status === "sent" && doc.dueDate < now ? "overdue" : doc.status;
	return {
		kind: "invoice",
		id: doc._id,
		title: doc.invoiceNumber,
		meta: joinMeta([
			options.clientName,
			`Due ${formatDocumentDate(doc.dueDate)}`,
		]),
		status,
		amount: doc.total,
		updatedAt: doc.paidAt ?? doc._creationTime,
		searchText: haystack([
			doc.invoiceNumber,
			options.clientName,
			status,
			doc.status,
		]),
	};
}

// ----------------------------------------------------------------------------
// Query / grouping / ordering
// ----------------------------------------------------------------------------

/** Case-insensitive substring match. An empty query matches everything. */
export function filterRecords(
	records: readonly WorkRecord[],
	query: string
): WorkRecord[] {
	const q = query.trim().toLowerCase();
	if (!q) return [...records];
	return records.filter((r) => r.searchText.includes(q));
}

export type WorkGroup = {
	kind: WorkKind;
	label: string;
	records: WorkRecord[];
};

/** Groups in `KIND_ORDER`, omitting kinds with no matches. */
export function groupByKind(records: readonly WorkRecord[]): WorkGroup[] {
	return KIND_ORDER.map((kind) => ({
		kind,
		label: KIND_LABEL[kind],
		records: records.filter((r) => r.kind === kind),
	})).filter((g) => g.records.length > 0);
}

/** Most recent first. Missing timestamps sort last, preserving input order. */
export function sortByRecency(records: readonly WorkRecord[]): WorkRecord[] {
	return [...records].sort((a, b) => {
		const av = a.updatedAt ?? Number.NEGATIVE_INFINITY;
		const bv = b.updatedAt ?? Number.NEGATIVE_INFINITY;
		if (av === bv) return 0;
		return bv - av;
	});
}

/** Detail route for a record. The screen casts this to expo-router's `Href`. */
export function pathForRecord(record: WorkRecord): string {
	switch (record.kind) {
		case "client":
			return `/clients/${record.id}`;
		case "project":
			return `/projects/${record.id}`;
		case "quote":
			return `/quote/${record.id}`;
		case "invoice":
			return `/invoice/${record.id}`;
	}
}
