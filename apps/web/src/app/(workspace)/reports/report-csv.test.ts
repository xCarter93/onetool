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
					invoiceNumber: "INV-1",
					total: 1234.5,
					issuedDate: Date.UTC(2026, 0, 15, 12),
					isActive: true,
				},
				{ invoiceNumber: null, total: null, issuedDate: null, isActive: null },
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
