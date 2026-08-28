import { describe, expect, it } from "vitest";
import { reportResultToCsv } from "./report-csv";

describe("reportResultToCsv — detail mode", () => {
	const result = {
		data: [],
		total: 2,
		detail: {
			columns: [
				{ field: "invoiceNumber", label: "Invoice Number", type: "string" as const },
				{ field: "total", label: "Total", type: "currency" as const },
				{ field: "issuedDate", label: "Issued Date", type: "timestamp" as const },
				{ field: "isActive", label: "Active", type: "boolean" as const },
			],
			rows: [
				{
					id: "inv_1",
					invoiceNumber: "INV-1",
					total: 1234.5,
					issuedDate: Date.UTC(2026, 0, 15, 12),
					isActive: true,
				},
				{
					id: "inv_2",
					invoiceNumber: null,
					total: null,
					issuedDate: null,
					isActive: null,
				},
			],
			totalMatched: 2,
			rowsTruncated: false,
		},
	};

	it("uses column labels as headers and mirrors on-screen formatting", () => {
		const { headers, rows } = reportResultToCsv(result, { entityType: "invoices" });
		expect(headers).toEqual(["Invoice Number", "Total", "Issued Date", "Active"]);
		// Record-level currency exports exact cents (grouped aggregates stay whole-dollar).
		expect(rows[0]).toEqual(["INV-1", "$1,234.50", "Jan 15, 2026", "Yes"]);
	});

	it("renders null cells as empty strings", () => {
		const { rows } = reportResultToCsv(result, { entityType: "invoices" });
		expect(rows[1]).toEqual(["", "", "", ""]);
	});
});

describe("reportResultToCsv — grouped mode", () => {
	it("absent currency flags export counts, not dollars (invoices issuedDate_month)", () => {
		const result = {
			data: [{ label: "Jan 2026", value: 12, metadata: { dateKey: "2026-01" } }],
			total: 12,
			metadata: { entityType: "invoices", groupBy: "issuedDate_month", truncated: false },
		};
		const { headers, rows } = reportResultToCsv(result, {
			entityType: "invoices",
			groupBy: "issuedDate_month",
			groupByLabel: "Issued by Month",
		});
		expect(headers).toEqual(["Issued by Month", "Count"]);
		expect(rows).toEqual([["Jan 2026", 12]]);
	});

	it("exports label + count with the groupBy label as header", () => {
		const result = {
			data: [
				{ label: "Active", value: 3 },
				{ label: "Lead", value: 1 },
			],
			total: 4,
			metadata: { entityType: "clients", groupBy: "status", truncated: false },
		};
		const { headers, rows } = reportResultToCsv(result, {
			entityType: "clients",
			groupBy: "status",
			groupByLabel: "Status",
		});
		expect(headers).toEqual(["Status", "Count"]);
		expect(rows).toEqual([
			["Active", 3],
			["Lead", 1],
		]);
	});

	it("formats item values as currency when metadata says so", () => {
		const result = {
			data: [{ label: "2026-02", value: 1200 }],
			total: 1200,
			metadata: {
				entityType: "invoices",
				groupBy: "month",
				truncated: false,
				totalIsCurrency: true,
				itemValueIsCurrency: true,
			},
		};
		const { headers, rows } = reportResultToCsv(result, {
			entityType: "invoices",
			groupBy: "month",
			groupByLabel: "Revenue by Month",
		});
		expect(headers).toEqual(["Revenue by Month", "Value"]);
		expect(rows).toEqual([["2026-02", "$1,200"]]);
	});

	it("row-label header precedence: groupByLabel wins, then Category", () => {
		const result = {
			data: [{ label: "Q-1001", value: 3 }],
			total: 3,
			metadata: { entityType: "quotes", truncated: false },
		};

		expect(
			reportResultToCsv(result, { entityType: "quotes", groupByLabel: "Status" })
				.headers[0]
		).toBe("Status");
		expect(reportResultToCsv(result, { entityType: "quotes" }).headers[0]).toBe(
			"Category"
		);
	});

	it("adds the dollar Value column when items carry totalValue metadata", () => {
		const result = {
			data: [
				{ label: "Paid", value: 2, metadata: { totalValue: 2000 } },
				{ label: "Sent", value: 1, metadata: { totalValue: 200 } },
			],
			total: 2200,
			metadata: {
				entityType: "invoices",
				groupBy: "status",
				truncated: false,
				totalIsCurrency: true,
			},
		};
		const { headers, rows } = reportResultToCsv(result, {
			entityType: "invoices",
			groupBy: "status",
			groupByLabel: "Status",
		});
		expect(headers).toEqual(["Status", "Count", "Value"]);
		expect(rows).toEqual([
			["Paid", 2, "$2,000"],
			["Sent", 1, "$200"],
		]);
	});
});

describe("reportResultToCsv — comparison ranges (R11)", () => {
	const base = {
		data: [
			{ label: "Active", value: 12 },
			{ label: "Lead", value: 5 },
		],
		total: 17,
		metadata: { entityType: "clients", groupBy: "status" },
	};

	it("appends Previous and Change % when points carry compareValue", () => {
		const { headers, rows } = reportResultToCsv(
			{
				...base,
				data: [
					{ label: "Active", value: 12, compareValue: 10 },
					{ label: "Lead", value: 5, compareValue: 0 },
				],
			},
			{ entityType: "clients", groupBy: "status", groupByLabel: "Status" }
		);

		expect(headers).toEqual(["Status", "Count", "Previous", "Change %"]);
		expect(rows[0]).toEqual(["Active", 12, 10, "+20.0%"]);
		// Mirrors the on-screen table: no percent exists against a zero previous.
		expect(rows[1]).toEqual(["Lead", 5, 0, "—"]);
	});

	it("output is byte-identical to the uncompared export when no point carries one", () => {
		const withoutCompare = reportResultToCsv(base, {
			entityType: "clients",
			groupBy: "status",
			groupByLabel: "Status",
		});

		expect(withoutCompare).toEqual({
			headers: ["Status", "Count"],
			rows: [
				["Active", 12],
				["Lead", 5],
			],
		});
	});

	it("a single-metric report reads its comparison from metadata.compareTotal", () => {
		const { headers, rows } = reportResultToCsv(
			{
				data: [{ label: "Total", value: 40000 }],
				total: 40000,
				metadata: {
					entityType: "invoices",
					itemValueIsCurrency: true,
					compareTotal: 32000,
				},
			},
			{ entityType: "invoices" }
		);

		expect(headers).toEqual(["Category", "Value", "Previous", "Change %"]);
		expect(rows[0]).toEqual(["Total", "$40,000", "$32,000", "+25.0%"]);
	});
});

describe("reportResultToCsv — the metadata.compareTotal backfill is ungrouped-only", () => {
	it("a one-bucket grouped result keeps its honest empty comparison", () => {
		const { headers } = reportResultToCsv(
			{
				data: [{ label: "Active", value: 12 }],
				total: 12,
				// compareTotal spans every bucket, so it is not this row's previous value.
				metadata: {
					entityType: "clients",
					groupBy: "status",
					compareTotal: 30,
				},
			},
			{ entityType: "clients", groupBy: "status", groupByLabel: "Status" }
		);

		expect(headers).toEqual(["Status", "Count"]);
	});
});
