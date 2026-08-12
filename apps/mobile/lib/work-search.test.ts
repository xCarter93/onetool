import { describe, expect, it } from "vitest";
import {
	buildClientNameMap,
	CHIP_ORDER,
	formatTaskDate,
	fromClientHit,
	fromInvoiceHit,
	fromProjectHit,
	fromQuoteHit,
	KIND_LABEL,
	pathForRecord,
	sortByRecency,
	toClientRecord,
	toInvoiceRecord,
	toProjectRecord,
	toQuoteRecord,
	toTaskRecord,
	type ClientInput,
	type InvoiceInput,
	type ProjectInput,
	type QuoteInput,
	type TaskInput,
	type WorkChipKind,
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

const task = (over: Partial<TaskInput> = {}): TaskInput => ({
	_id: "t1",
	_creationTime: T0,
	title: "Mow the east lawn",
	date: T0,
	status: "pending",
	...over,
});

// Minimal hand-built record — used where the adapters can't produce the shape
// (notably an undefined `updatedAt`, which real Convex docs never yield).
const record = (
	kind: WorkChipKind,
	over: Partial<WorkRecord> & { id: string }
): WorkRecord =>
	({
		kind,
		title: over.id,
		meta: "",
		status: "active",
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

describe("chip vocabulary", () => {
	it("orders chips record-kinds-then-tasks and labels every one", () => {
		expect([...CHIP_ORDER]).toEqual([
			"client",
			"project",
			"quote",
			"invoice",
			"task",
		]);
		for (const kind of CHIP_ORDER) expect(KIND_LABEL[kind]).toBeTruthy();
	});
});

describe("list adapters", () => {
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
		expect(toInvoiceRecord(invoice(), { now: T0 + 60 * DAY }).status).toBe(
			"overdue"
		);
	});

	it("leaves a not-yet-due sent invoice alone, and never re-flags paid", () => {
		expect(toInvoiceRecord(invoice(), { now: T0 }).status).toBe("sent");
		expect(
			toInvoiceRecord(invoice({ status: "paid" }), { now: T0 + 60 * DAY }).status
		).toBe("paid");
	});

	it("maps a task with its UTC day and optional start time", () => {
		expect(toTaskRecord(task()).meta).toBe("Jul 1, 2026");
		expect(toTaskRecord(task({ startTime: "14:00" })).meta).toBe(
			"Jul 1, 2026 · 14:00"
		);
		expect(toTaskRecord(task()).status).toBe("pending");
	});

	it("renders a task date in UTC, not the local day before it", () => {
		// UTC-midnight of the 1st is the evening of Jun 30 in any western tz.
		expect(formatTaskDate(Date.UTC(2026, 6, 1))).toBe("Jul 1, 2026");
	});
});

describe("search-hit adapters", () => {
	it("routes a plain client hit to the client and carries no status", () => {
		const r = fromClientHit({ clientId: "c9", kind: "client", label: "Acme" });
		expect(r).toMatchObject({ kind: "client", id: "c9", title: "Acme" });
		expect(r.status).toBeUndefined();
	});

	it("resolves contact and property hits to the PARENT client, labelled", () => {
		expect(
			fromClientHit({
				clientId: "c9",
				kind: "contact",
				label: "Acme",
				detail: "Jane Doe",
			})
		).toMatchObject({ id: "c9", title: "Acme", meta: "Contact · Jane Doe" });
		expect(
			fromClientHit({
				clientId: "c9",
				kind: "property",
				label: "Acme",
				detail: "12 Elm St, Boston",
			})
		).toMatchObject({ meta: "Property · 12 Elm St, Boston" });
	});

	it("maps project/quote/invoice hits with detail as the meta line", () => {
		expect(
			fromProjectHit({ projectId: "p9", label: "Deck", detail: "PRJ-9" })
		).toMatchObject({ kind: "project", id: "p9", meta: "PRJ-9" });
		expect(
			fromQuoteHit({ quoteId: "q9", label: "Patio", detail: "Acme" })
		).toMatchObject({ kind: "quote", id: "q9", meta: "Acme" });
		expect(fromInvoiceHit({ invoiceId: "i9", label: "INV-1" })).toMatchObject({
			kind: "invoice",
			id: "i9",
			meta: "",
		});
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
	it("routes each record kind to its detail route", () => {
		expect(pathForRecord(record("client", { id: "c1" }))).toBe("/clients/c1");
		expect(pathForRecord(record("project", { id: "p1" }))).toBe("/projects/p1");
		expect(pathForRecord(record("quote", { id: "q1" }))).toBe("/quote/q1");
		expect(pathForRecord(record("invoice", { id: "i1" }))).toBe("/invoice/i1");
	});

	it("routes a task to the form sheet, matching Today's agenda rows", () => {
		expect(pathForRecord(record("task", { id: "t1" }))).toBe(
			"/tasks/form?taskId=t1"
		);
	});
});
