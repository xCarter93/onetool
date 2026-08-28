import { describe, it, expect, vi } from "vitest";
import {
	REPORT_RELATIONS,
	buildPathHydrator,
	getRelationEdge,
	isDrillableTarget,
	isRelatedPath,
	pathTables,
	resolveReportPath,
	type ResolvedPath,
} from "./reportRelations";

describe("REPORT_RELATIONS", () => {
	it("exposes the schema-verified edges per entity", () => {
		expect(REPORT_RELATIONS.clients).toEqual({});
		expect(REPORT_RELATIONS.activities).toEqual({});
		expect(REPORT_RELATIONS.projects).toEqual({
			clientId: { refType: "clients" },
		});
		expect(REPORT_RELATIONS.tasks).toEqual({
			assigneeUserId: { refType: "users" },
			projectId: { refType: "projects" },
			clientId: { refType: "clients" },
		});
		expect(REPORT_RELATIONS.invoices).toEqual({
			clientId: { refType: "clients" },
			projectId: { refType: "projects" },
			quoteId: { refType: "quotes" },
		});
		expect(REPORT_RELATIONS.invoiceLineItems).toEqual({
			skuId: { refType: "skus" },
			invoiceId: { refType: "invoices" },
		});
	});

	it("resolves single edges via getRelationEdge", () => {
		expect(getRelationEdge("payments", "invoiceId")).toEqual({
			refType: "invoices",
		});
		expect(getRelationEdge("payments", "clientId")).toBeUndefined();
	});

	it("treats report entities as drillable and users/skus as terminals", () => {
		expect(isDrillableTarget("invoices")).toBe(true);
		expect(isDrillableTarget("clients")).toBe(true);
		expect(isDrillableTarget("users")).toBe(false);
		expect(isDrillableTarget("skus")).toBe(false);
	});
});

describe("isRelatedPath", () => {
	it("is true only for dotted paths", () => {
		expect(isRelatedPath("clientId.status")).toBe(true);
		expect(isRelatedPath("status")).toBe(false);
		expect(isRelatedPath("creationDate_month")).toBe(false);
	});
});

describe("resolveReportPath", () => {
	it("resolves a bare direct field against the entity's own registry", () => {
		const resolved = resolveReportPath("clients", "status");
		expect(resolved.hops).toEqual([]);
		expect(resolved.terminal).toEqual({
			kind: "field",
			entityType: "clients",
			sourceField: "status",
			def: { type: "string", label: "Status", options: expect.any(Array) },
		});
	});

	it("resolves a bare direct field with a granularity suffix", () => {
		const resolved = resolveReportPath("invoices", "issuedDate_month");
		expect(resolved.hops).toEqual([]);
		expect(resolved.terminal).toMatchObject({
			kind: "field",
			entityType: "invoices",
			sourceField: "issuedDate",
			granularity: "month",
		});
	});

	it("honors the creationDate alias, with and without granularity", () => {
		expect(resolveReportPath("projects", "creationDate").terminal).toMatchObject({
			kind: "field",
			sourceField: "_creationTime",
		});
		expect(
			resolveReportPath("projects", "creationDate_week").terminal
		).toMatchObject({
			kind: "field",
			entityType: "projects",
			sourceField: "_creationTime",
			granularity: "week",
		});
	});

	it("resolves the alias across a hop", () => {
		const resolved = resolveReportPath("payments", "invoiceId.creationDate_day");
		expect(resolved.hops).toEqual([{ field: "invoiceId", refType: "invoices" }]);
		expect(resolved.terminal).toMatchObject({
			kind: "field",
			entityType: "invoices",
			sourceField: "_creationTime",
			granularity: "day",
		});
	});

	it("resolves a bare FK to an fk terminal", () => {
		const resolved = resolveReportPath("payments", "invoiceId");
		expect(resolved.hops).toEqual([]);
		expect(resolved.terminal).toEqual({
			kind: "fk",
			field: "invoiceId",
			refType: "invoices",
		});
	});

	it("prefers the FK edge over the same-named registry field", () => {
		const resolved = resolveReportPath("tasks", "assigneeUserId");
		expect(resolved.terminal).toEqual({
			kind: "fk",
			field: "assigneeUserId",
			refType: "users",
		});
	});

	it("resolves a single-hop field path", () => {
		const resolved = resolveReportPath("payments", "invoiceId.status");
		expect(resolved.hops).toEqual([{ field: "invoiceId", refType: "invoices" }]);
		expect(resolved.terminal).toMatchObject({
			kind: "field",
			entityType: "invoices",
			sourceField: "status",
		});
	});

	it("resolves a two-hop field path", () => {
		const resolved = resolveReportPath("payments", "invoiceId.projectId.title");
		expect(resolved.hops).toEqual([
			{ field: "invoiceId", refType: "invoices" },
			{ field: "projectId", refType: "projects" },
		]);
		expect(resolved.terminal).toMatchObject({
			kind: "field",
			entityType: "projects",
			sourceField: "title",
		});
	});

	it("resolves a three-segment path ending on an FK edge", () => {
		const resolved = resolveReportPath(
			"invoiceLineItems",
			"invoiceId.quoteId.projectId"
		);
		expect(resolved.hops).toEqual([
			{ field: "invoiceId", refType: "invoices" },
			{ field: "quoteId", refType: "quotes" },
		]);
		expect(resolved.terminal).toEqual({
			kind: "fk",
			field: "projectId",
			refType: "projects",
		});
	});

	it("allows ending on a non-drillable edge", () => {
		expect(
			resolveReportPath("invoiceLineItems", "invoiceId.projectId").terminal
		).toEqual({ kind: "fk", field: "projectId", refType: "projects" });
		expect(resolveReportPath("quoteLineItems", "skuId").terminal).toEqual({
			kind: "fk",
			field: "skuId",
			refType: "skus",
		});
	});

	it("throws on an unknown FK segment", () => {
		expect(() => resolveReportPath("invoices", "bogusId.status")).toThrow(
			/bogusId/
		);
	});

	it("throws when drilling through a non-drillable target", () => {
		expect(() => resolveReportPath("quoteLineItems", "skuId.name")).toThrow(
			/skus/
		);
		expect(() => resolveReportPath("tasks", "assigneeUserId.email")).toThrow(
			/users/
		);
	});

	it("throws on an unknown terminal field", () => {
		expect(() => resolveReportPath("invoices", "clientId.bogus")).toThrow(
			/bogus/
		);
		expect(() => resolveReportPath("invoices", "bogus")).toThrow(/bogus/);
	});

	it("throws when a granularity suffix lands on a non-timestamp field", () => {
		expect(() => resolveReportPath("invoices", "clientId.status_month")).toThrow(
			/status/
		);
	});

	it("throws on empty segments", () => {
		expect(() => resolveReportPath("invoices", "")).toThrow();
		expect(() => resolveReportPath("invoices", "clientId.")).toThrow();
		expect(() => resolveReportPath("invoices", "clientId..status")).toThrow();
	});
});

describe("pathTables", () => {
	it("lists the drillable report tables a path crosses, in order", () => {
		expect(
			pathTables(resolveReportPath("invoiceLineItems", "invoiceId.quoteId.projectId"))
		).toEqual(["invoices", "quotes", "projects"]);
		expect(pathTables(resolveReportPath("invoices", "clientId.status"))).toEqual([
			"clients",
		]);
	});

	it("excludes users and skus and the scanned entity itself", () => {
		expect(pathTables(resolveReportPath("tasks", "assigneeUserId"))).toEqual([]);
		expect(pathTables(resolveReportPath("quoteLineItems", "skuId"))).toEqual([]);
		expect(pathTables(resolveReportPath("clients", "status"))).toEqual([]);
	});
});

type Doc = Record<string, unknown>;

function fakeDb(docs: Record<string, Doc | null>) {
	return vi.fn(async (id: string) => docs[id] ?? null);
}

describe("buildPathHydrator", () => {
	it("fetches each referenced doc once across rows and paths", async () => {
		const rows = [
			{ _id: "t1", clientId: "c1" },
			{ _id: "t2", clientId: "c1" },
			{ _id: "t3", clientId: "c2" },
		];
		const getDoc = fakeDb({
			c1: { _id: "c1", companyName: "Acme", status: "active" },
			c2: { _id: "c2", companyName: "Globex", status: "lead" },
		});
		const paths = [
			resolveReportPath("tasks", "clientId.companyName"),
			resolveReportPath("tasks", "clientId.status"),
		];
		const hydrator = await buildPathHydrator(getDoc, rows, paths, 50);

		expect(getDoc).toHaveBeenCalledTimes(2);
		expect(hydrator.truncated).toBe(false);
		expect(hydrator.truncatedTables).toEqual([]);
		expect(hydrator.resolve(rows[0], paths[0])).toEqual({ value: "Acme" });
		expect(hydrator.resolve(rows[1], paths[1])).toEqual({ value: "active" });
		expect(hydrator.resolve(rows[2], paths[0])).toEqual({ value: "Globex" });
	});

	it("resolves a bare field terminal off the scanned row without fetching", async () => {
		const rows = [{ _id: "c1", status: "active" }];
		const getDoc = fakeDb({});
		const path = resolveReportPath("clients", "status");
		const hydrator = await buildPathHydrator(getDoc, rows, [path], 10);

		expect(getDoc).not.toHaveBeenCalled();
		expect(hydrator.resolve(rows[0], path)).toEqual({ value: "active" });
	});

	it("resolves an fk terminal to the id on the last reached doc", async () => {
		const rows = [{ _id: "p1", invoiceId: "i1" }];
		const getDoc = fakeDb({ i1: { _id: "i1", projectId: "pr1" } });
		const path = resolveReportPath("payments", "invoiceId.projectId");
		const hydrator = await buildPathHydrator(getDoc, rows, [path], 10);

		expect(hydrator.resolve(rows[0], path)).toEqual({ value: "pr1" });
	});

	it("resolves a two-hop field path", async () => {
		const rows = [{ _id: "p1", invoiceId: "i1" }];
		const getDoc = fakeDb({
			i1: { _id: "i1", projectId: "pr1" },
			pr1: { _id: "pr1", title: "Roof replacement" },
		});
		const path = resolveReportPath("payments", "invoiceId.projectId.title");
		const hydrator = await buildPathHydrator(getDoc, rows, [path], 10);

		expect(getDoc).toHaveBeenCalledTimes(2);
		expect(hydrator.resolve(rows[0], path)).toEqual({
			value: "Roof replacement",
		});
	});

	it("reports the first missing hop as brokenAt for a null FK", async () => {
		const rows = [{ _id: "p1" }, { _id: "p2", invoiceId: "i1" }];
		const getDoc = fakeDb({ i1: { _id: "i1" } });
		const path = resolveReportPath("payments", "invoiceId.projectId.title");
		const hydrator = await buildPathHydrator(getDoc, rows, [path], 10);

		expect(hydrator.resolve(rows[0], path)).toEqual({
			brokenAt: { field: "invoiceId", refType: "invoices" },
		});
		expect(hydrator.resolve(rows[1], path)).toEqual({
			brokenAt: { field: "projectId", refType: "projects" },
		});
	});

	it("reports brokenAt for a dangling id", async () => {
		const rows = [{ _id: "p1", invoiceId: "gone" }];
		const getDoc = fakeDb({});
		const path = resolveReportPath("payments", "invoiceId.status");
		const hydrator = await buildPathHydrator(getDoc, rows, [path], 10);

		expect(hydrator.resolve(rows[0], path)).toEqual({
			brokenAt: { field: "invoiceId", refType: "invoices" },
		});
	});

	it("reports brokenAt for a null fk terminal on a reached doc", async () => {
		const rows = [{ _id: "p1", invoiceId: "i1" }];
		const getDoc = fakeDb({ i1: { _id: "i1" } });
		const path = resolveReportPath("payments", "invoiceId.projectId");
		const hydrator = await buildPathHydrator(getDoc, rows, [path], 10);

		expect(hydrator.resolve(rows[0], path)).toEqual({
			brokenAt: { field: "projectId", refType: "projects" },
		});
	});

	it("distinguishes an empty field on a reached doc from a broken hop", async () => {
		const rows = [{ _id: "p1", invoiceId: "i1" }];
		const getDoc = fakeDb({ i1: { _id: "i1" } });
		const path = resolveReportPath("payments", "invoiceId.status");
		const hydrator = await buildPathHydrator(getDoc, rows, [path], 10);

		expect(hydrator.resolve(rows[0], path)).toEqual({ value: undefined });
	});

	it("stops at the budget and names the incomplete table", async () => {
		const rows = [
			{ _id: "t1", clientId: "c1" },
			{ _id: "t2", clientId: "c2" },
			{ _id: "t3", clientId: "c3" },
		];
		const getDoc = fakeDb({
			c1: { _id: "c1", companyName: "Acme" },
			c2: { _id: "c2", companyName: "Globex" },
			c3: { _id: "c3", companyName: "Initech" },
		});
		const path = resolveReportPath("tasks", "clientId.companyName");
		const hydrator = await buildPathHydrator(getDoc, rows, [path], 2);

		expect(getDoc).toHaveBeenCalledTimes(2);
		expect(hydrator.truncated).toBe(true);
		expect(hydrator.truncatedTables).toEqual(["clients"]);
		expect(hydrator.resolve(rows[0], path)).toEqual({ value: "Acme" });
		expect(hydrator.resolve(rows[2], path)).toEqual({
			brokenAt: { field: "clientId", refType: "clients" },
		});
	});

	it("fetches nothing at budget 0 and reports every row broken", async () => {
		const rows = [{ _id: "t1", clientId: "c1" }];
		const getDoc = fakeDb({ c1: { _id: "c1", companyName: "Acme" } });
		const path = resolveReportPath("tasks", "clientId.companyName");
		const hydrator = await buildPathHydrator(getDoc, rows, [path], 0);

		expect(getDoc).not.toHaveBeenCalled();
		expect(hydrator.truncated).toBe(true);
		expect(hydrator.truncatedTables).toEqual(["clients"]);
		expect(hydrator.resolve(rows[0], path)).toEqual({
			brokenAt: { field: "clientId", refType: "clients" },
		});
	});

	it("accepts a ResolvedPath array typed at the module boundary", async () => {
		const paths: ResolvedPath[] = [resolveReportPath("clients", "status")];
		const hydrator = await buildPathHydrator(fakeDb({}), [], paths, 10);
		expect(hydrator.truncated).toBe(false);
	});
});
