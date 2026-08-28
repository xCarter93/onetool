import { describe, expect, it } from "vitest";
import { configForGroupByKey } from "./reportConfig";

/**
 * The four composite Group-by keys the assistant can still name stand for whole
 * configs, not fields; whether those configs reproduce the pre-unification
 * output is reportDualRun.test.ts's job, not this file's.
 */
describe("configForGroupByKey — composite keys", () => {
	it("invoices 'month' becomes paid-revenue bucketed on paidAt", () => {
		const { config } = configForGroupByKey("invoices", "month", {
			visualization: { type: "column" },
		});
		expect(config).toStrictEqual({
			version: 2,
			entityType: "invoices",
			filters: {
				logic: "and",
				groups: [
					{
						logic: "and",
						rules: [{ field: "status", operator: "equals", value: "paid" }],
					},
				],
			},
			date: { field: "paidAt", range: { kind: "preset", preset: "all_time" } },
			metric: { op: "sum", field: "total" },
			groupBy: "paidAt_month",
		});
	});

	it("invoices 'client' groups the same revenue by client with a top-10 limit", () => {
		const { config, visualization } = configForGroupByKey("invoices", "client", {
			visualization: { type: "bar" },
		});
		expect(config.groupBy).toBe("clientId");
		expect(config.metric).toStrictEqual({ op: "sum", field: "total" });
		expect(config.date?.field).toBe("paidAt");
		expect(visualization.options).toStrictEqual({
			sort: "value_desc",
			seriesLimit: 10,
		});
	});

	it("keeps explicit visualization options over the client defaults", () => {
		const { visualization } = configForGroupByKey("invoices", "client", {
			visualization: { type: "bar", options: { seriesLimit: 5 } },
		});
		expect(visualization.options).toStrictEqual({
			sort: "value_desc",
			seriesLimit: 5,
		});
	});

	it("keeps a caller range and ANDs the paid rule onto caller filters", () => {
		const { config } = configForGroupByKey("invoices", "month", {
			range: { kind: "absolute", start: 100, end: 200 },
			filters: {
				logic: "and",
				groups: [
					{
						logic: "and",
						rules: [{ field: "total", operator: "greater_than", value: 0 }],
					},
				],
			},
			visualization: { type: "line" },
		});
		expect(config.date).toStrictEqual({
			field: "paidAt",
			range: { kind: "absolute", start: 100, end: 200 },
		});
		expect(config.filters?.groups).toHaveLength(2);
		expect(config.filters?.groups[1].rules).toStrictEqual([
			{ field: "status", operator: "equals", value: "paid" },
		]);
	});

	it("refuses revenue keys when OR-of-OR filters have no representation", () => {
		expect(() =>
			configForGroupByKey("invoices", "month", {
				filters: {
					logic: "or",
					groups: [
						{
							logic: "or",
							rules: [
								{ field: "status", operator: "equals", value: "sent" },
								{ field: "status", operator: "equals", value: "overdue" },
							],
						},
						{
							logic: "and",
							rules: [{ field: "total", operator: "greater_than", value: 0 }],
						},
					],
				},
				visualization: { type: "column" },
			})
		).toThrowError(/no filter representation/);
	});

	it("ratio keys become ratio metrics with no grouping", () => {
		expect(
			configForGroupByKey("quotes", "conversionRate", {
				visualization: { type: "pie" },
			}).config
		).toStrictEqual({
			version: 2,
			entityType: "quotes",
			metric: { op: "ratio", ratioKey: "conversionRate" },
		});
		expect(
			configForGroupByKey("tasks", "completionRate", {
				visualization: { type: "pie" },
			}).config.metric
		).toStrictEqual({ op: "ratio", ratioKey: "completionRate" });
	});

	it("overrides a caller metric on a composite key", () => {
		const { config } = configForGroupByKey("invoices", "month", {
			metric: { op: "avg", field: "total" },
			visualization: { type: "line" },
		});
		expect(config.metric).toStrictEqual({ op: "sum", field: "total" });
	});
});

describe("configForGroupByKey — plain registry keys", () => {
	it("passes the groupBy through and defaults to the count metric", () => {
		const { config } = configForGroupByKey("clients", "leadSource", {
			visualization: { type: "bar" },
		});
		expect(config).toStrictEqual({
			version: 2,
			entityType: "clients",
			metric: { op: "count" },
			groupBy: "leadSource",
		});
	});

	it("carries a caller metric and columns", () => {
		const { config } = configForGroupByKey("invoices", "issuedDate_month", {
			metric: { op: "avg", field: "total" },
			columns: ["invoiceNumber"],
			visualization: { type: "line" },
		});
		expect(config.metric).toStrictEqual({ op: "avg", field: "total" });
		expect(config.columns).toStrictEqual(["invoiceNumber"]);
	});

	it("zero-fills tasks counted by status, but not other measures", () => {
		expect(
			configForGroupByKey("tasks", "status", { visualization: { type: "bar" } })
				.config.includeEmptyValues
		).toBe(true);
		expect(
			configForGroupByKey("tasks", "status", {
				metric: { op: "sum", field: "estimatedHours" },
				visualization: { type: "bar" },
			}).config.includeEmptyValues
		).toBeUndefined();
	});

	it("omits groupBy entirely when none is given", () => {
		const { config } = configForGroupByKey("clients", undefined, {
			visualization: { type: "table" },
		});
		expect(config.groupBy).toBeUndefined();
	});
});
