import {
	deriveInvoiceStatus,
	type StoredInvoiceStatus,
} from "@onetool/backend/convex/lib/invoiceLateness";

import { formatDocumentDate } from "@/lib/format";

// ============================================================================
// Work tab row model. Pure — no React, no Convex, no RN.
//
// Slice 6: matching moved to the backend (`search.globalSearch`, word-prefix +
// relevance-ordered). What is left here is the shape layer — Convex docs and
// search hits in, one display row out — so the screen has a single render path
// for both modes and it stays unit-testable in the node vitest environment.
// ============================================================================

/** Record kinds that own a detail route AND can fill an iPad detail pane. */
export type WorkKind = "client" | "project" | "quote" | "invoice";

/** Chip/bucket kinds. Tasks are searchable and browsable but open a form sheet,
 * never a detail pane — which is exactly why they are not a `WorkKind`. */
export type WorkChipKind = WorkKind | "task";

type WorkRecordBase = {
	/** Convex document id, stringly-typed (the screen only routes with it). */
	id: string;
	title: string;
	/** Single metadata line rendered under the title. May be empty. */
	meta: string;
	/** STATUS key for `<Badge status=… />`. Search hits carry no status. */
	status?: string;
	/**
	 * Best available recency signal (ms epoch), used to order BROWSE lists. No
	 * table carries an `updatedAt` column, so adapters use the closest activity
	 * timestamp and fall back to `_creationTime`.
	 */
	updatedAt?: number;
};

export type WorkRecord =
	| (WorkRecordBase & { kind: "client" })
	| (WorkRecordBase & { kind: "project" })
	| (WorkRecordBase & { kind: "quote"; amount?: number })
	| (WorkRecordBase & { kind: "invoice"; amount?: number })
	| (WorkRecordBase & { kind: "task" });

/** Detail-pane kinds, in chip / section order. */
export const KIND_ORDER: readonly WorkKind[] = [
	"client",
	"project",
	"quote",
	"invoice",
];

/** Chip order and result-section order — one list, tasks last. */
export const CHIP_ORDER: readonly WorkChipKind[] = [...KIND_ORDER, "task"];

export const KIND_LABEL: Record<WorkChipKind, string> = {
	client: "Clients",
	project: "Projects",
	quote: "Quotes",
	invoice: "Invoices",
	task: "Tasks",
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
	status: StoredInvoiceStatus;
	total: number;
	dueDate: number;
	paidAt?: number;
};

export type TaskInput = {
	_id: string;
	_creationTime: number;
	title: string;
	/** UTC-midnight instant — render in UTC or a western tz shows the day before. */
	date: number;
	status: string;
	startTime?: string;
	completedAt?: number;
};

export type AdapterOptions = {
	/** Resolved client display name — see `buildClientNameMap`. */
	clientName?: string;
	/**
	 * The org's calendar day (UTC-midnight epoch) that lateness is judged
	 * against. Defaults to the device's day.
	 */
	orgToday?: number;
};

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Device calendar day as a UTC-midnight epoch, for callers with no org clock. */
function deviceToday(): number {
	const d = new Date();
	return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

function joinMeta(parts: (string | undefined | null)[]): string {
	return parts
		.map((p) => p?.trim())
		.filter((p): p is string => !!p)
		.join(" · ");
}

/** Task dates are stored at UTC-midnight; format in UTC to keep the day intact. */
export function formatTaskDate(ts: number): string {
	return new Date(ts).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});
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
// Adapters — Convex list docs → rows (BROWSE mode)
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
	};
}

export function toInvoiceRecord(
	doc: InvoiceInput,
	options: AdapterOptions = {}
): WorkRecord {
	// A past-due `sent` invoice DISPLAYS as overdue (money tab / web parity — the
	// stored status is only flipped by the overdue sweep).
	const status = deriveInvoiceStatus(doc, options.orgToday ?? deviceToday());
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
	};
}

export function toTaskRecord(doc: TaskInput): WorkRecord {
	return {
		kind: "task",
		id: doc._id,
		title: doc.title,
		meta: joinMeta([formatTaskDate(doc.date), doc.startTime]),
		status: doc.status,
		updatedAt: doc.completedAt ?? doc.date,
	};
}

// ----------------------------------------------------------------------------
// Adapters — `search.globalSearch` hits → rows (SEARCH mode)
//
// Hits carry no status, amount or timestamp: the backend returns a relevance
// ordering and a label/detail pair per bucket, and re-fetching every hit's full
// doc to decorate five rows is not worth the round trips.
// ----------------------------------------------------------------------------

export type ClientHitInput = {
	clientId: string;
	kind: "client" | "contact" | "property";
	label: string;
	detail?: string;
};

export type LabelledHitInput = { label: string; detail?: string };

/** Contact/property hits resolve to their PARENT client — the matched contact
 * name / property address becomes the meta line so the hit explains itself. */
export function fromClientHit(hit: ClientHitInput): WorkRecord {
	const meta =
		hit.kind === "contact"
			? joinMeta(["Contact", hit.detail])
			: hit.kind === "property"
				? joinMeta(["Property", hit.detail])
				: (hit.detail ?? "");
	return { kind: "client", id: hit.clientId, title: hit.label, meta };
}

export function fromProjectHit(
	hit: LabelledHitInput & { projectId: string }
): WorkRecord {
	return {
		kind: "project",
		id: hit.projectId,
		title: hit.label,
		meta: hit.detail ?? "",
	};
}

export function fromQuoteHit(
	hit: LabelledHitInput & { quoteId: string }
): WorkRecord {
	return {
		kind: "quote",
		id: hit.quoteId,
		title: hit.label,
		meta: hit.detail ?? "",
	};
}

export function fromInvoiceHit(
	hit: LabelledHitInput & { invoiceId: string }
): WorkRecord {
	return {
		kind: "invoice",
		id: hit.invoiceId,
		title: hit.label,
		meta: hit.detail ?? "",
	};
}

// ----------------------------------------------------------------------------
// Ordering / routing
// ----------------------------------------------------------------------------

/** Most recent first. Missing timestamps sort last, preserving input order.
 * BROWSE only — search results keep the backend's relevance order. */
export function sortByRecency(records: readonly WorkRecord[]): WorkRecord[] {
	return [...records].sort((a, b) => {
		const av = a.updatedAt ?? Number.NEGATIVE_INFINITY;
		const bv = b.updatedAt ?? Number.NEGATIVE_INFINITY;
		if (av === bv) return 0;
		return bv - av;
	});
}

/** Destination for a row. Tasks have no detail route — they open the form
 * sheet, the same way Today's agenda rows do. */
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
		case "task":
			return `/tasks/form?taskId=${record.id}`;
	}
}
