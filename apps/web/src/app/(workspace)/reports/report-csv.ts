import type { FunctionReturnType } from "convex/server";
import type { api } from "@onetool/backend/convex/_generated/api";
import type { CsvCell } from "@/lib/csv-export";
import { formatCurrency } from "@/lib/money";
import { formatDate, formatReportValue } from "./report-config";

type ReportResult = FunctionReturnType<typeof api.reportData.executeReport>;

/**
 * Maps an executeReport result to CSV headers/rows, mirroring what the
 * on-screen table shows (same currency/date formatting, no rank or share
 * columns). Detail mode exports the detail columns; grouped mode exports
 * label + count, plus the dollar Value column when the result carries
 * per-item totalValue metadata (status-grouped quotes/invoices).
 */
export function reportResultToCsv(
	result: ReportResult,
	opts: {
		entityType: string;
		groupBy?: string;
		groupByLabel?: string;
		/** Overrides the row header when rows aren't groupBy buckets (related rollups). */
		rowLabel?: string;
	}
): { headers: string[]; rows: CsvCell[][] } {
	if (result.detail) {
		const { columns, rows } = result.detail;
		return {
			headers: columns.map((col) => col.label),
			rows: rows.map((row) =>
				columns.map((col) => {
					const value = row[col.field];
					if (value === null || value === undefined) return "";
					// Exact cents, not the on-screen table's whole-dollar display —
					// people sum exported columns (money rule: records show cents).
					if (col.type === "currency" && typeof value === "number") {
						return formatCurrency(value);
					}
					if (col.type === "timestamp" && typeof value === "number") {
						return formatDate(value);
					}
					if (col.type === "boolean") return value ? "Yes" : "No";
					return value;
				})
			),
		};
	}

	const itemValueIsCurrency = result.metadata?.itemValueIsCurrency === true;
	const hasTotalValue = result.data.some(
		(item) => typeof item.metadata?.totalValue === "number"
	);

	const headers = [
		opts.rowLabel ?? opts.groupByLabel ?? "Category",
		itemValueIsCurrency ? "Value" : "Count",
		...(hasTotalValue ? ["Value"] : []),
	];
	const rows = result.data.map((item) => {
		const totalValue = item.metadata?.totalValue;
		return [
			item.label,
			itemValueIsCurrency ? formatReportValue(item.value, true) : item.value,
			...(hasTotalValue
				? [typeof totalValue === "number" ? formatReportValue(totalValue, true) : ""]
				: []),
		];
	});
	return { headers, rows };
}
