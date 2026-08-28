"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { ColumnDef, useTable } from "@tanstack/react-table";
import { Download, TriangleAlert } from "lucide-react";
import type { ReportFieldType } from "@onetool/backend/convex/lib/reportFields";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/domain/empty-state";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import {
	DataGrid,
	DataGridContainer,
	dataGridFeatures,
	type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { buildCsv, downloadCsv, sanitizeCsvFilename } from "@/lib/csv-export";
import { formatCurrency } from "@/lib/money";
import { reportResultToCsv } from "../report-csv";
import {
	effectiveDetailColumns,
	entityLabels,
	formatDate,
	resolveReportQueryArgs,
	TRUNCATION_NOTICE,
	type EntityType,
	type ReportConfigV2,
	type ReportVisualization,
} from "../report-config";

type ReportResult = FunctionReturnType<typeof api.reportData.executeReport>;
type DetailResult = NonNullable<ReportResult["detail"]>;
type DetailRow = DetailResult["rows"][number];

/** Matches the server's own detail cap; asking for more silently clamps. */
const ROW_LIMIT = 1000;

/** What the sheet is showing: every record behind the report, or one bucket of it. */
export interface ContributingScope {
	bucketKey?: string;
	bucketLabel?: string;
}

interface ReportContributingSheetProps {
	/** null closes the sheet; an object opens it at that scope. */
	scope: ContributingScope | null;
	onClose: () => void;
	config: ReportConfigV2;
	visualization: ReportVisualization;
	reportName: string;
	/** CSV export is a saved-report affordance — the builder leaves it off. */
	showCsvDownload?: boolean;
}

/** Entities with a record page of their own. `as const` keeps typed routes happy. */
const RECORD_ROUTES = {
	clients: "/clients",
	projects: "/projects",
	quotes: "/quotes",
	invoices: "/invoices",
} as const satisfies Partial<Record<EntityType, string>>;

/** Page-less entities link to the parent that owns them, via the row's FK refs. */
const PARENT_ROUTES = {
	tasks: { ref: "projectId", base: "/projects" },
	payments: { ref: "invoiceId", base: "/invoices" },
	quoteLineItems: { ref: "quoteId", base: "/quotes" },
	invoiceLineItems: { ref: "invoiceId", base: "/invoices" },
} as const satisfies Partial<Record<EntityType, { ref: string; base: string }>>;

function recordHref(entityType: EntityType, row: DetailRow) {
	const own =
		entityType in RECORD_ROUTES
			? RECORD_ROUTES[entityType as keyof typeof RECORD_ROUTES]
			: undefined;
	if (own) return `${own}/${row.id}` as const;
	if (!(entityType in PARENT_ROUTES)) return undefined;
	const parent = PARENT_ROUTES[entityType as keyof typeof PARENT_ROUTES];
	const parentId = row.refs?.[parent.ref];
	return parentId ? (`${parent.base}/${parentId}` as const) : undefined;
}

function formatCell(
	value: string | number | boolean | null,
	type: ReportFieldType
): string {
	if (value === null) return "—";
	// Records show exact cents; only stats and charts round to whole dollars.
	if (type === "currency" && typeof value === "number") return formatCurrency(value);
	if (type === "timestamp" && typeof value === "number") return formatDate(value);
	if (type === "boolean") return value ? "Yes" : "No";
	if (type === "number" && typeof value === "number") {
		return value.toLocaleString("en-US");
	}
	return String(value);
}

function isNumericType(type: ReportFieldType): boolean {
	return type === "currency" || type === "number";
}

/**
 * Drill-down (R10): the records behind a report, or behind one clicked chart
 * bucket. Runs its own detail-mode executeReport over the same config the
 * canvas renders, so the rows always match the number they came from.
 */
export function ReportContributingSheet({
	scope,
	onClose,
	config,
	visualization,
	reportName,
	showCsvDownload = false,
}: ReportContributingSheetProps) {
	const base = resolveReportQueryArgs(config, visualization);
	const entityType = base.config.entityType;
	// Server recomputes bucket keys from the config's groupBy and throws without one.
	const bucketKey = base.config.groupBy ? scope?.bucketKey : undefined;

	const queryArgs =
		scope === null
			? "skip"
			: {
					entityType,
					config: base.config,
					detail: {
						columns: effectiveDetailColumns(entityType, base.config.columns),
						limit: ROW_LIMIT,
						...(bucketKey !== undefined ? { bucketKey } : {}),
					},
				};
	const result = useQuery(api.reportData.executeReport, queryArgs);
	const detail = result?.detail;

	const columns = useMemo<ColumnDef<DataGridFeatures, DetailRow>[]>(() => {
		if (!detail) return [];
		return detail.columns.map((col, index) => ({
			id: col.field,
			accessorFn: (row: DetailRow) => row[col.field],
			header: ({ column }) => (
				<DataGridColumnHeader title={col.label} column={column} />
			),
			meta: { skeleton: <Skeleton className="h-4 w-24" /> },
			cell: ({ row }) => {
				const text = formatCell(row.original[col.field], col.type);
				const href = index === 0 ? recordHref(entityType, row.original) : undefined;
				const className = isNumericType(col.type) ? "tabular-nums" : undefined;
				if (!href) {
					return <span className={className}>{text}</span>;
				}
				return (
					<Link
						href={href}
						className="rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{text}
					</Link>
				);
			},
		}));
	}, [detail, entityType]);

	const table = useTable({
		features: dataGridFeatures,
		data: detail?.rows ?? [],
		columns,
		// No pagination UI; stops the bundled paginatedRowModel truncating at 10 rows.
		manualPagination: true,
	});

	const entityName = entityLabels[entityType] ?? entityType;
	const title = scope?.bucketLabel
		? `${entityName} · ${scope.bucketLabel}`
		: entityName;
	const subtitle = !detail
		? "Loading records"
		: detail.rowsTruncated
			? `Showing first ${detail.rows.length.toLocaleString()} of ${detail.totalMatched.toLocaleString()} records`
			: `${detail.totalMatched.toLocaleString()} ${
					detail.totalMatched === 1 ? "record" : "records"
				}`;

	const handleDownloadCsv = () => {
		if (!result) return;
		const { headers, rows } = reportResultToCsv(result, { entityType });
		const name = [reportName.trim() || "report", scope?.bucketLabel]
			.filter(Boolean)
			.join(" - ");
		downloadCsv(sanitizeCsvFilename(name), buildCsv(headers, rows));
	};

	return (
		<Sheet
			open={scope !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<SheetContent side="right" className="w-full sm:max-w-2xl">
				<SheetHeader>
					<SheetTitle>{title}</SheetTitle>
					<SheetDescription>{subtitle}</SheetDescription>
				</SheetHeader>

				{result?.metadata?.truncated === true && (
					<div className="mx-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
						<TriangleAlert className="h-3.5 w-3.5 shrink-0" />
						<span>{TRUNCATION_NOTICE}</span>
					</div>
				)}

				<div className="min-h-0 flex-1 overflow-auto px-4">
					{!detail ? (
						<div
							className="overflow-hidden rounded-lg border border-border/60"
							aria-busy="true"
						>
							{Array.from({ length: 8 }).map((_, index) => (
								<div
									key={index}
									className="flex items-center gap-4 border-b border-border/60 px-4 py-3 last:border-b-0"
								>
									<Skeleton className="h-4 w-40" />
									<Skeleton className="h-4 w-24" />
									<Skeleton className="h-4 w-28" />
								</div>
							))}
						</div>
					) : (
						<DataGrid
							table={table}
							recordCount={detail.rows.length}
							emptyMessage={
								<EmptyState size="sm" title="No records behind this selection." />
							}
							tableLayout={{ width: "auto", headerBackground: true }}
						>
							<DataGridContainer className="rounded-lg border">
								<DataGridTable />
							</DataGridContainer>
						</DataGrid>
					)}
				</div>

				{showCsvDownload && (
					<SheetFooter className="flex-row justify-end border-t border-border/60">
						<Button
							variant="outline"
							size="sm"
							onClick={handleDownloadCsv}
							disabled={!detail || detail.rows.length === 0}
						>
							<Download className="h-3.5 w-3.5" />
							Download CSV
						</Button>
					</SheetFooter>
				)}
			</SheetContent>
		</Sheet>
	);
}
