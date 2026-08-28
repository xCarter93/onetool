// Pins the [F1+F5] path enumeration: which dotted paths are authorable in
// filters vs group by, how they read as breadcrumbs, and that the FK DAG walk
// terminates at the real longest chain.
import { describe, expect, it } from "vitest";
import {
	filterFieldOptions,
	groupByPathOptions,
	pathLabel,
	type PathOption,
} from "./report-path-options";

const values = (options: PathOption[]) => options.map((o) => o.value);
const find = (options: PathOption[], value: string) =>
	options.find((o) => o.value === value);

describe("filterFieldOptions", () => {
	it("lists direct registry fields under a Fields group", () => {
		const options = filterFieldOptions("quoteLineItems");
		const direct = find(options, "description");
		expect(direct).toMatchObject({
			label: "Description",
			group: "Fields",
			searchText: "description",
		});
	});

	it("lists parent fields one and three hops out as breadcrumbs", () => {
		const options = filterFieldOptions("quoteLineItems");
		expect(find(options, "quoteId.status")).toMatchObject({
			label: "Quote › Status",
			group: "Quote",
			searchText: "quote status",
		});
		expect(find(options, "quoteId.projectId.startDate")).toMatchObject({
			label: "Quote › Project › Start Date",
			group: "Quote › Project",
			searchText: "quote project start date",
		});
	});

	it("flags timestamp terminals and never suffixes granularity", () => {
		const options = filterFieldOptions("quoteLineItems");
		expect(find(options, "quoteId._creationTime")?.isTimestamp).toBe(true);
		expect(find(options, "quoteId.status")?.isTimestamp).toBeUndefined();
		expect(values(options).some((v) => /_(day|week|month)$/.test(v))).toBe(false);
	});

	it("excludes fk terminals — filters need a field to compare", () => {
		const options = values(filterFieldOptions("quoteLineItems"));
		expect(options).not.toContain("quoteId");
		expect(options).not.toContain("quoteId.projectId");
		expect(options).not.toContain("quoteId.projectId.clientId");
	});

	it("never traverses through or ends on users/skus", () => {
		const lineItems = values(filterFieldOptions("quoteLineItems"));
		expect(lineItems.some((v) => v.startsWith("skuId"))).toBe(false);
		const tasks = values(filterFieldOptions("tasks"));
		expect(tasks.some((v) => v.startsWith("assigneeUserId."))).toBe(false);
		// The direct field of the same name stays filterable.
		expect(tasks).toContain("assigneeUserId");
	});

	it("terminates on the longest real chain (invoiceLineItems, 4 hops)", () => {
		const options = filterFieldOptions("invoiceLineItems");
		const depths = options.map((o) => o.value.split(".").length);
		expect(Math.max(...depths)).toBe(5);
		expect(options).toContainEqual(
			expect.objectContaining({
				value: "invoiceId.quoteId.projectId.clientId.status",
				label: "Invoice › Quote › Project › Client › Status",
			})
		);
		const groups = [...new Set(options.map((o) => o.group))];
		expect(groups).toEqual([
			"Fields",
			"Invoice",
			"Invoice › Client",
			"Invoice › Project",
			"Invoice › Quote",
			"Invoice › Project › Client",
			"Invoice › Quote › Client",
			"Invoice › Quote › Project",
			"Invoice › Quote › Project › Client",
		]);
	});

	it("keeps diamond paths to the same table distinct", () => {
		const options = values(filterFieldOptions("payments"));
		expect(options).toContain("invoiceId.clientId.status");
		expect(options).toContain("invoiceId.quoteId.clientId.status");
	});

	it("orders by hop depth, then registry order", () => {
		const depths = filterFieldOptions("invoiceLineItems").map(
			(o) => o.value.split(".").length
		);
		expect(depths).toEqual([...depths].sort((a, b) => a - b));
	});

	it("emits Fields only for entities with no outbound relations", () => {
		expect(
			filterFieldOptions("clients").every((o) => o.group === "Fields")
		).toBe(true);
		expect(
			filterFieldOptions("activities").every((o) => o.group === "Fields")
		).toBe(true);
	});
});

describe("groupByPathOptions", () => {
	it("emits dotted paths only — direct options belong to the caller", () => {
		const options = groupByPathOptions("quoteLineItems");
		expect(options.length).toBeGreaterThan(0);
		expect(options.every((o) => o.value.includes("."))).toBe(true);
	});

	it("includes fk terminals so a bucket can be a parent record", () => {
		const options = groupByPathOptions("quoteLineItems");
		expect(find(options, "quoteId.projectId")).toMatchObject({
			label: "Quote › Project",
			group: "Quote",
		});
		expect(find(options, "quoteId.clientId")).toMatchObject({
			label: "Quote › Client",
			group: "Quote",
		});
	});

	it("includes parent timestamp fields unsuffixed and flagged", () => {
		const created = find(groupByPathOptions("quoteLineItems"), "quoteId._creationTime");
		expect(created).toMatchObject({ label: "Quote › Created", isTimestamp: true });
	});

	it("never traverses through users/skus", () => {
		expect(
			values(groupByPathOptions("quoteLineItems")).every(
				(v) => !v.startsWith("skuId.")
			)
		).toBe(true);
		expect(
			values(groupByPathOptions("tasks")).every(
				(v) => !v.startsWith("assigneeUserId.")
			)
		).toBe(true);
	});

	it("is empty for entities with no outbound relations", () => {
		expect(groupByPathOptions("clients")).toEqual([]);
		expect(groupByPathOptions("activities")).toEqual([]);
	});
});

describe("pathLabel", () => {
	it("labels direct fields, dotted paths, and fk terminals", () => {
		expect(pathLabel("quotes", "status")).toBe("Status");
		expect(pathLabel("quoteLineItems", "quoteId.status")).toBe("Quote › Status");
		expect(pathLabel("quoteLineItems", "quoteId.projectId")).toBe("Quote › Project");
	});

	it("ignores the granularity suffix a saved group-by carries", () => {
		expect(pathLabel("quoteLineItems", "quoteId._creationTime_month")).toBe(
			"Quote › Created"
		);
	});

	it("falls back to the raw path rather than throwing on a stale config", () => {
		expect(pathLabel("quoteLineItems", "quoteId.gone")).toBe("quoteId.gone");
		expect(pathLabel("quoteLineItems", "skuId.name")).toBe("skuId.name");
	});
});
