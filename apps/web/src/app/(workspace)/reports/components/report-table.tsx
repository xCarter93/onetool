"use client";

import React from "react";
import type { ReportFieldType } from "@onetool/backend/convex/lib/reportFields";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/money";
import { formatDate, formatReportValue, percentChange } from "../report-config";

interface DataPoint {
	name: string;
	value: number;
	totalValue?: number;
	/** Same bucket over the comparison range (R11); absent when not comparing. */
	compareValue?: number;
	/** Drill-down key for this bucket; absent on ungrouped results. */
	bucketKey?: string;
	[key: string]: unknown;
}

interface DetailResult {
	columns: { field: string; label: string; type: ReportFieldType }[];
	rows: Record<string, string | number | boolean | null>[];
	totalMatched: number;
	rowsTruncated: boolean;
}

interface ReportTableProps {
	data: DataPoint[];
	total: number;
	groupBy?: string;
	/** Part of the shared chart-props bag; the aggregated table doesn't read it. */
	entityType: string;
	/** Is `total` a dollar amount? Explicit, from the caller — see getReportValueTypes. */
	totalIsCurrency?: boolean;
	/** Is each row's `value` a dollar amount (vs. a count)? */
	itemValueIsCurrency?: boolean;
	/** Names the aggregated value column; callers that always count can omit it. */
	valueHeader?: string;
	/** Names the comparison range ("Previous period"); adds Previous + Change columns. */
	compareLabel?: string;
	/** When set, renders the flat detail-mode table instead of the aggregated one. */
	detail?: DetailResult;
	/** Drill-down (R10): makes each group label a button opening that bucket's records. */
	onBucketClick?: (bucketKey: string, bucketLabel: string) => void;
}

function formatDetailCell(value: string | number | boolean | null, type: ReportFieldType): string {
	if (value === null) return "—";
	// Raw rows are record-level amounts — exact cents, matching the CSV export.
	if (type === "currency" && typeof value === "number") return formatCurrency(value);
	if (type === "timestamp" && typeof value === "number") return formatDate(value);
	if (type === "boolean") return value ? "Yes" : "No";
	if (type === "number" && typeof value === "number") return value.toLocaleString("en-US");
	return String(value);
}

function ReportDetailTable({ detail }: { detail: DetailResult }) {
	return (
		<div className="space-y-3">
			<div className="rounded-lg border overflow-hidden">
				<Table>
					<TableHeader className="bg-muted">
						<TableRow>
							{detail.columns.map((col) => (
								<TableHead key={col.field}>{col.label}</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{detail.rows.map((row, index) => (
							<TableRow key={index}>
								{detail.columns.map((col) => (
									<TableCell key={col.field}>
										{formatDetailCell(row[col.field], col.type)}
									</TableCell>
								))}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
			{detail.rowsTruncated && (
				<p className="text-xs text-muted-foreground">
					Showing first {detail.rows.length.toLocaleString()} of{" "}
					{detail.totalMatched.toLocaleString()} records.
				</p>
			)}
		</div>
	);
}

export function ReportTable({
	data,
	total,
	groupBy,
	totalIsCurrency = false,
	itemValueIsCurrency = false,
	valueHeader = "Count",
	compareLabel,
	detail,
	onBucketClick,
}: ReportTableProps) {
	if (detail) {
		return <ReportDetailTable detail={detail} />;
	}

	// Sum of item `value`s, used only for the %-of-category and average calcs
	// below. Never the headline "Total:" figure — that must come from the
	// `total` prop (a ratio metric's total is not this sum).
	const itemValueSum = data.reduce((sum, d) => sum + d.value, 0);
	const averageValue = itemValueSum / (data.length || 1);

	// item.totalValue (the optional "Value" column) is only ever populated for
	// status-grouped quotes/invoices reports, where it's always a dollar sum —
	// so it's always formatted as currency, no magnitude guessing needed.
	const formatValue = (value: number) => formatReportValue(value, true);

	// Sort by value descending
	const sortedData = [...data].sort((a, b) => b.value - a.value);

	const showCompare =
		compareLabel !== undefined &&
		data.some((d) => typeof d.compareValue === "number");

	return (
		<div className="space-y-4">
			{/* Summary stats */}
			<div className="flex items-center justify-between text-sm">
				<span className="text-muted-foreground">
					{data.length} rows
				</span>
				<span className="font-medium text-foreground">
					Total: {formatReportValue(total, totalIsCurrency)}
				</span>
			</div>

			{/* Table */}
			<div className="rounded-lg border overflow-hidden">
				<Table>
					<TableHeader className="bg-muted">
						<TableRow>
							<TableHead className="w-12">#</TableHead>
							<TableHead>
								{groupBy
									? groupBy.charAt(0).toUpperCase() + groupBy.slice(1)
									: "Category"}
							</TableHead>
							<TableHead className="text-right">{valueHeader}</TableHead>
							{showCompare && (
								<>
									<TableHead className="text-right">Previous</TableHead>
									<TableHead className="text-right">Change</TableHead>
								</>
							)}
							<TableHead className="text-right">%</TableHead>
							{sortedData.some((d) => d.totalValue !== undefined) && (
								<TableHead className="text-right">Value</TableHead>
							)}
						</TableRow>
					</TableHeader>
					<TableBody>
						{sortedData.map((item, index) => {
							const percentage =
								itemValueSum > 0
									? ((item.value / itemValueSum) * 100).toFixed(1)
									: "0";

							const change =
								typeof item.compareValue === "number"
									? percentChange(item.value, item.compareValue)
									: undefined;

							return (
								<TableRow key={item.name}>
									<TableCell className="text-muted-foreground font-mono text-sm">
										{index + 1}
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											{onBucketClick && item.bucketKey ? (
												<button
													type="button"
													onClick={() =>
														onBucketClick(item.bucketKey!, item.name)
													}
													className="rounded-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
												>
													{item.name}
												</button>
											) : (
												<span className="font-medium text-foreground">
													{item.name}
												</span>
											)}
											{index === 0 && (
												<Badge variant="secondary" className="text-xs">
													Top
												</Badge>
											)}
										</div>
									</TableCell>
									<TableCell className="text-right font-mono">
										{formatReportValue(item.value, itemValueIsCurrency)}
									</TableCell>
									{showCompare && (
										<>
											<TableCell className="text-right font-mono">
												{typeof item.compareValue === "number"
													? formatReportValue(
															item.compareValue,
															itemValueIsCurrency
														)
													: "—"}
											</TableCell>
											{/* Direction reads from the sign, never from color. */}
											<TableCell className="text-right font-mono text-primary">
												{change ?? "—"}
											</TableCell>
										</>
									)}
									<TableCell className="text-right">
										<div className="flex items-center justify-end gap-2">
											<div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
												<div
													className="h-full bg-primary/70 rounded-full"
													style={{
														width: `${(item.value / (sortedData[0]?.value || 1)) * 100}%`,
													}}
												/>
											</div>
											<span className="text-muted-foreground text-sm w-12 text-right">
												{percentage}%
											</span>
										</div>
									</TableCell>
									{item.totalValue !== undefined && (
										<TableCell className="text-right font-mono">
											{formatValue(item.totalValue as number)}
										</TableCell>
									)}
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</div>

			{/* Footer summary */}
			<div className="flex items-center justify-between pt-2 text-sm text-muted-foreground border-t">
				<span>Showing all {data.length} items</span>
				<span>
					Average:{" "}
					{itemValueIsCurrency
						? formatReportValue(averageValue, true)
						: averageValue.toFixed(1)}{" "}
					per category
				</span>
			</div>
		</div>
	);
}

