import { describe, expect, it } from "vitest";
import {
	buildClientNameMap,
	filterRecords,
	groupByKind,
	KIND_ORDER,
	pathForRecord,
	sortByRecency,
	toClientRecord,
	toInvoiceRecord,
	toProjectRecord,
	toQuoteRecord,
	type ClientInput,
	type InvoiceInput,
	type ProjectInput,
	type QuoteInput,
	type WorkKind,
	type WorkRecord,
} from "./work-search";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 6, 1); // 2026-07-01

const client = (over: Partial<ClientInput> = {}): ClientInput => ({
	_id: "c1",
	_creationTime: T0,
	companyName: "Northside Landscaping",
	status: "active",
	...over,
});

const project = (over: Partial<ProjectInput> = {}): ProjectInput => ({
	_id: "p1",
	_creationTime: T0,
	clientId: "c1",
	title: "Spring cleanup",
	status: "in-progress",
	...over,
});

const quote = (over: Partial<QuoteInput> = {}): QuoteInput => ({
	_id: "q1",
	_creationTime: T0,
	clientId: "c1",
	status: "draft",
	total: 1200,
	...over,
});

const invoice = (over: Partial<InvoiceInput> = {}): InvoiceInput => ({
	_id: "i1",
	_creationTime: T0,
	clientId: "c1",
	invoiceNumber: "INV-0042",
	status: "sent",
	total: 980.5,
	dueDate: T0 + 30 * DAY,
	...over,
});

// Minimal hand-built record — used where the adapters can't produce the shape
// (notably an undefined `updatedAt`, which real Convex docs never yield).
const record = (
	kind: WorkKind,
	over: Partial<WorkRecord> & { id: string }
): WorkRecord =>
	({
		kind,
		title: over.id,
		meta: "",
		status: "active",
		searchText: over.id.toLowerCase(),
		amount: 0,
		...over,
	}) as WorkRecord;

describe("buildClientNameMap", () => {
	it("maps id → companyName and tolerates undefined", () => {
		const map = buildClientNameMap([
			client({ _id: "c1", companyName: "Acme" }),
			client({ _id: "c2", companyName: "Bolt" }),
		]);
		expect(map.get("c1")).toBe("Acme");
		expect(map.get("c2")).toBe("Bolt");
		expect(buildClientNameMap(undefined).size).toBe(0);
	});
});

describe("adapters", () => {
	it("maps a client, preferring description over tags for the meta line", () => {
		const r = toClientRecord(
			client({ companyDescription: "Commercial grounds", tags: ["vip"] })
		);
		expect(r.kind).toBe("client");
		expect(r.id).toBe("c1");
		expect(r.title).toBe("Northside Landscaping");
		expect(r.meta).toBe("Commercial grounds");
		expect(r.status).toBe("active");
		expect(r.updatedAt).toBe(T0);
	});

	it("falls back client meta to tags, then to the creation date", () => {
		expect(toClientRecord(client({ tags: ["vip", "retainer"] })).meta).toBe(
			"vip · retainer"
		);
		expect(toClientRecord(client()).meta).toMatch(/^Added /);
	});

	it("folds notes and tags into the client haystack but not the meta line", () => {
		const r = toClientRecord(client({ notes: "Gate code 4821", tags: ["vip"] }));
		expect(r.searchText).toContain("gate code 4821");
		expect(r.meta).not.toContain("Gate code");
	});

	it("maps a project with client name + number in the meta line", () => {
		const r = toProjectRecord(project({ projectNumber: "PRJ-7" }), {
			clientName: "Acme",
		});
		expect(r.meta).toBe("Acme · PRJ-7");
		expect(r.updatedAt).toBe(T0);
	});

	it("prefers completedAt over creation time for project recency", () => {
		const r = toProjectRecord(project({ completedAt: T0 + 5 * DAY }));
		expect(r.updatedAt).toBe(T0 + 5 * DAY);
		expect(r.meta).toMatch(/^Added /);
	});

	it("titles a quote by title, then number, then a literal", () => {
		expect(toQuoteRecord(quote({ title: "Patio rebuild" })).title).toBe(
			"Patio rebuild"
		);
		expect(toQuoteRecord(quote({ quoteNumber: "Q-14" })).title).toBe("Q-14");
		expect(toQuoteRecord(quote()).title).toBe("Quote");
	});

	it("ranks quote recency approvedAt > sentAt > creation", () => {
		expect(
			toQuoteRecord(quote({ sentAt: T0 + DAY, approvedAt: T0 + 2 * DAY }))
				.updatedAt
		).toBe(T0 + 2 * DAY);
		expect(toQuoteRecord(quote({ sentAt: T0 + DAY })).updatedAt).toBe(T0 + DAY);
		expect(toQuoteRecord(quote()).updatedAt).toBe(T0);
	});

	it("carries the raw total as `amount` on money records", () => {
		const q = toQuoteRecord(quote({ total: 1200 }));
		const i = toInvoiceRecord(invoice({ total: 980.5 }), { now: T0 });
		expect(q.kind === "quote" && q.amount).toBe(1200);
		expect(i.kind === "invoice" && i.amount).toBe(980.5);
	});

	it("displays a past-due sent invoice as overdue", () => {
		const past = toInvoiceRecord(invoice(), { now: T0 + 60 * DAY });
		expect(past.status).toBe("overdue");
		expect(past.searchText).toContain("overdue");
	});

	it("leaves a not-yet-due sent invoice alone, and never re-flags paid", () => {
		expect(toInvoiceRecord(invoice(), { now: T0 }).status).toBe("sent");
		expect(
			toInvoiceRecord(invoice({ status: "paid" }), { now: T0 + 60 * DAY }).status
		).toBe("paid");
	});
});

describe("filterRecords", () => {
	const records = [
		toClientRecord(client({ companyName: "Northside Landscaping" })),
		toProjectRecord(project({ title: "Spring Cleanup" }), {
			clientName: "Northside Landscaping",
		}),
		toInvoiceRecord(invoice({ invoiceNumber: "INV-0042" }), { now: T0 }),
	];

	it("returns everything for an empty or whitespace query", () => {
		expect(filterRecords(records, "")).toHaveLength(3);
		expect(filterRecords(records, "   ")).toHaveLength(3);
	});

	it("does not mutate or alias the input array", () => {
		const out = filterRecords(records, "");
		expect(out).not.toBe(records);
		expect(out).toEqual([...records]);
	});

	it("matches case-insensitively on any casing of the query", () => {
		expect(filterRecords(records, "NORTHSIDE")).toHaveLength(2);
		expect(filterRecords(records, "northside")).toHaveLength(2);
		expect(filterRecords(records, "nOrThSiDe")).toHaveLength(2);
	});

	it("matches mid-string substrings, including document numbers", () => {
		expect(filterRecords(records, "cleanup").map((r) => r.kind)).toEqual([
			"project",
		]);
		expect(filterRecords(records, "0042").map((r) => r.kind)).toEqual([
			"invoice",
		]);
	});

	it("returns an empty array when nothing matches", () => {
		expect(filterRecords(records, "helicopter")).toEqual([]);
	});
});

describe("groupByKind", () => {
	it("orders groups by KIND_ORDER regardless of input order", () => {
		const groups = groupByKind([
			record("invoice", { id: "i1" }),
			record("client", { id: "c1" }),
			record("quote", { id: "q1" }),
			record("project", { id: "p1" }),
		]);
		expect(groups.map((g) => g.kind)).toEqual([...KIND_ORDER]);
		expect(groups.map((g) => g.label)).toEqual([
			"Clients",
			"Projects",
			"Quotes",
			"Invoices",
		]);
	});

	it("omits kinds with no records", () => {
		const groups = groupByKind([
			record("quote", { id: "q1" }),
			record("client", { id: "c1" }),
			record("quote", { id: "q2" }),
		]);
		expect(groups.map((g) => g.kind)).toEqual(["client", "quote"]);
		expect(groups[1].records.map((r) => r.id)).toEqual(["q1", "q2"]);
	});

	it("returns no groups for no records", () => {
		expect(groupByKind([])).toEqual([]);
	});
});

describe("sortByRecency", () => {
	it("puts the most recently active record first", () => {
		const sorted = sortByRecency([
			record("client", { id: "old", updatedAt: T0 }),
			record("project", { id: "new", updatedAt: T0 + 10 * DAY }),
			record("quote", { id: "mid", updatedAt: T0 + 5 * DAY }),
		]);
		expect(sorted.map((r) => r.id)).toEqual(["new", "mid", "old"]);
	});

	it("sinks records with no timestamp below timestamped ones", () => {
		const sorted = sortByRecency([
			record("client", { id: "none", updatedAt: undefined }),
			record("project", { id: "dated", updatedAt: T0 }),
		]);
		expect(sorted.map((r) => r.id)).toEqual(["dated", "none"]);
	});

	it("keeps input order among equal or all-undefined timestamps", () => {
		expect(
			sortByRecency([
				record("client", { id: "a", updatedAt: undefined }),
				record("client", { id: "b", updatedAt: undefined }),
			]).map((r) => r.id)
		).toEqual(["a", "b"]);
		expect(
			sortByRecency([
				record("client", { id: "a", updatedAt: T0 }),
				record("client", { id: "b", updatedAt: T0 }),
			]).map((r) => r.id)
		).toEqual(["a", "b"]);
	});

	it("does not mutate the input", () => {
		const input = [
			record("client", { id: "old", updatedAt: T0 }),
			record("client", { id: "new", updatedAt: T0 + DAY }),
		];
		sortByRecency(input);
		expect(input.map((r) => r.id)).toEqual(["old", "new"]);
	});
});

describe("pathForRecord", () => {
	it("routes each kind to its existing detail route", () => {
		expect(pathForRecord(record("client", { id: "c1" }))).toBe("/clients/c1");
		expect(pathForRecord(record("project", { id: "p1" }))).toBe("/projects/p1");
		expect(pathForRecord(record("quote", { id: "q1" }))).toBe("/quote/q1");
		expect(pathForRecord(record("invoice", { id: "i1" }))).toBe("/invoice/i1");
	});
});
