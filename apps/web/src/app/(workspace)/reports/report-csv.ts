import type { FunctionReturnType } from "convex/server";
import type { api } from "@onetool/backend/convex/_generated/api";
import type { CsvCell } from "@/lib/csv-export";
import { formatCurrency } from "@/lib/money";
import { formatDate, formatReportValue, percentChange } from "./report-config";

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
	// A single-metric report's lone "Total" point carries its comparison in
	// metadata rather than on the point, so the columns would otherwise skip it.
	// Ungrouped only: a one-bucket grouped result's compareTotal spans every
	// bucket, so attributing it to that row would be a lie.
	const points =
		result.metadata?.groupBy === undefined &&
		result.data.length === 1 &&
		result.data[0].compareValue === undefined &&
		typeof result.metadata?.compareTotal === "number"
			? [{ ...result.data[0], compareValue: result.metadata.compareTotal }]
			: result.data;
	const hasCompare = points.some(
		(item) => typeof item.compareValue === "number"
	);

	const headers = [
		opts.groupByLabel ?? "Category",
		itemValueIsCurrency ? "Value" : "Count",
		...(hasCompare ? ["Previous", "Change %"] : []),
		...(hasTotalValue ? ["Value"] : []),
	];
	const rows = points.map((item) => {
		const totalValue = item.metadata?.totalValue;
		const compareValue = item.compareValue;
		return [
			item.label,
			itemValueIsCurrency ? formatReportValue(item.value, true) : item.value,
			...(hasCompare
				? [
						typeof compareValue === "number"
							? itemValueIsCurrency
								? formatReportValue(compareValue, true)
								: compareValue
							: "",
						// "—" matches the on-screen table, which this export mirrors.
						typeof compareValue === "number"
							? (percentChange(item.value, compareValue) ?? "—")
							: "",
					]
				: []),
			...(hasTotalValue
				? [typeof totalValue === "number" ? formatReportValue(totalValue, true) : ""]
				: []),
		];
	});
	return { headers, rows };
}
