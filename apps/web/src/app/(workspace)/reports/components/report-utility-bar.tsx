"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { ChevronDown, ChevronUp, Download, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { buildCsv, downloadCsv, sanitizeCsvFilename } from "@/lib/csv-export";
import { reportResultToCsv } from "../report-csv";
import { ReportTable } from "./report-table";
import {
	formatReportValue,
	isDetailModeActive,
	metricOptionsFor,
	metricToValue,
	resolveReportQueryArgs,
	type ReportConfigV2,
	type ReportVisualization,
} from "../report-config";

interface ReportUtilityBarProps {
	saved: { config: ReportConfigV2; visualization: ReportVisualization } | null;
	reportName: string;
	groupByLabel?: string;
	rangeLabel: string;
	/** CSV export is a saved-report affordance — the builder leaves it off. */
	showCsvDownload?: boolean;
	/** Opens the contributing-data sheet over the whole report (R10). */
	onViewContributingData?: () => void;
	/** Opens it scoped to one Calculated-values row. */
	onBucketClick?: (bucketKey: string, bucketLabel: string) => void;
}

/**
 * Canvas footer (d14): status summary + the Calculated values expander that
 * absorbed the always-on table under charts (d7), plus Download CSV on saved
 * reports. Runs the same executeReport args as the preview — Convex dedupes
 * the subscription, so the export and totals always match what's on screen.
 */
export function ReportUtilityBar({
	saved,
	reportName,
	groupByLabel,
	rangeLabel,
	showCsvDownload = false,
	onViewContributingData,
	onBucketClick,
}: ReportUtilityBarProps) {
	const [expanded, setExpanded] = useState(false);

	const liveArgs = saved
		? resolveReportQueryArgs(saved.config, saved.visualization)
		: "skip";
	const queryArgs = useDebouncedValue(liveArgs, 300);
	const reportData = useQuery(api.reportData.executeReport, queryArgs);
	// During the debounce window reportData still answers the OLD args while the
	// label/config props are already NEW — exporting then would mix them.
	const argsSettled = JSON.stringify(liveArgs) === JSON.stringify(queryArgs);

	const config = saved?.config;
	const isChart =
		saved !== null &&
		saved.visualization.type !== "table" &&
		saved.visualization.type !== "number";

	const statusText = !saved
		? "No data source selected"
		: reportData === undefined
			? "Loading…"
			: reportData.detail
				? `${reportData.detail.totalMatched.toLocaleString()} ${
						reportData.detail.totalMatched === 1 ? "record" : "records"
					}`
				: reportData.data.length === 0
					? "No data for this selection"
					: `${reportData.data.length} ${
							reportData.data.length === 1 ? "group" : "groups"
						}${groupByLabel ? ` · grouped by ${groupByLabel}` : ""}`;

	const csvReady =
		saved !== null &&
		argsSettled &&
		reportData !== undefined &&
		(reportData.detail
			? reportData.detail.rows.length > 0
			: reportData.data.length > 0);

	const handleDownloadCsv = () => {
		if (!reportData || !config) return;
		const { headers, rows } = reportResultToCsv(reportData, {
			entityType: config.entityType,
			groupBy: config.groupBy,
			groupByLabel,
		});
		downloadCsv(
			sanitizeCsvFilename(reportName.trim() || "report"),
			buildCsv(headers, rows)
		);
	};

	const metricLabel = config
		? (metricOptionsFor(config.entityType).find(
				(o) => o.value === metricToValue(config.metric)
			)?.label ?? "Count of records")
		: undefined;
	const totalIsCurrency = reportData?.metadata?.totalIsCurrency === true;
	const totalDisplay =
		reportData === undefined || !config
			? undefined
			: config.metric.op === "ratio"
				? `${reportData.total}%`
				: formatReportValue(reportData.total, totalIsCurrency);
	// Grouped, non-detail results have a summary table; for chart types it
	// lives here since d7 removed the always-on table under the chart.
	const summaryRows =
		isChart && reportData && !reportData.detail && reportData.data.length > 0
			? reportData.data.map((item) => ({
					name: item.label,
					value: item.value,
					...((item.metadata || {}) as Record<string, unknown>),
					// After the spread so a metadata key can't shadow it.
					bucketKey: item.bucketKey,
				}))
			: null;

	const calcAvailable = saved !== null && reportData !== undefined;

	// The canvas already lists the rows in raw-rows mode, so drilling adds nothing.
	const showContributingData =
		onViewContributingData !== undefined &&
		saved !== null &&
		!isDetailModeActive(saved.config, saved.visualization.type);

	return (
		<div className="border-t border-border/60">
			{expanded && calcAvailable && config && (
				<div className="max-h-72 overflow-auto border-b border-border/60 bg-muted/10 px-4 py-3">
					<dl className="flex flex-wrap gap-x-8 gap-y-1 text-xs">
						<div>
							<dt className="text-muted-foreground">Total</dt>
							<dd className="font-medium tabular-nums text-foreground">
								{totalDisplay}
							</dd>
						</div>
						{reportData && !reportData.detail && (
							<div>
								<dt className="text-muted-foreground">Groups</dt>
								<dd className="font-medium tabular-nums text-foreground">
									{reportData.data.length}
								</dd>
							</div>
						)}
						<div>
							<dt className="text-muted-foreground">Definition</dt>
							<dd className="font-medium text-foreground">
								{metricLabel}
								{groupByLabel ? ` · by ${groupByLabel}` : ""} · {rangeLabel}
							</dd>
						</div>
					</dl>
					{summaryRows && (
						<div className="mt-3">
							<ReportTable
								data={summaryRows}
								total={reportData!.total}
								groupBy={config.groupBy}
								entityType={config.entityType}
								totalIsCurrency={totalIsCurrency}
								itemValueIsCurrency={
									reportData!.metadata?.itemValueIsCurrency === true
								}
								// Mid-debounce the rows still describe the OLD args; a click then
								// would drill into a bucket the user no longer sees.
								onBucketClick={argsSettled ? onBucketClick : undefined}
							/>
						</div>
					)}
				</div>
			)}
			<div className="flex items-center justify-between gap-3 px-4 py-2">
				<div className="flex min-w-0 items-center gap-3">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setExpanded((v) => !v)}
						disabled={!calcAvailable}
						aria-expanded={expanded}
					>
						{expanded ? (
							<ChevronDown className="h-3.5 w-3.5" />
						) : (
							<ChevronUp className="h-3.5 w-3.5" />
						)}
						Calculated values
					</Button>
					{showContributingData && (
						<Button
							variant="ghost"
							size="sm"
							onClick={onViewContributingData}
							disabled={!argsSettled}
						>
							<Rows3 className="h-3.5 w-3.5" />
							View contributing data
						</Button>
					)}
					<span className="truncate text-xs text-muted-foreground">
						{statusText}
					</span>
				</div>
				<div className="flex shrink-0 items-center gap-3">
					<span className="hidden text-xs text-muted-foreground sm:inline">
						{rangeLabel}
					</span>
					{showCsvDownload && (
						<Button
							variant="ghost"
							size="sm"
							onClick={handleDownloadCsv}
							disabled={!csvReady}
						>
							<Download className="h-3.5 w-3.5" />
							Download CSV
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
