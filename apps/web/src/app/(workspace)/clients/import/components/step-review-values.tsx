"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import type { FieldMapping, ImportRecord, RecordValidationError } from "@/types/csv-import";
import {
	parseCsvData,
	buildImportRecords,
	validateImportRecords,
	resolveRecordValue,
} from "../utils/transform-csv";
import { detectDuplicates } from "../utils/duplicate-detection";
import type { ReviewRow, FilterTab } from "../utils/review-types";
import { ReviewSummaryBar } from "./review-summary-bar";
import { ReviewFilterTabs } from "./review-filter-tabs";
import { PlanLimitBanner } from "./plan-limit-banner";

interface StepReviewValuesProps {
	fileContent: string;
	mappings: FieldMapping[];
	reviewSkippedRows: Set<number>;
	setRowSkip: (rowIndex: number, skip: boolean) => void;
	initReviewSkippedRows: (skippedSet: Set<number>) => void;
}

export function StepReviewValues({
	fileContent,
	mappings,
	reviewSkippedRows,
	setRowSkip,
	initReviewSkippedRows,
}: StepReviewValuesProps) {
	const parentRef = useRef<HTMLDivElement>(null);
	const [activeTab, setActiveTab] = useState<FilterTab>("all");
	const [parsedRows, setParsedRows] = useState<Record<string, unknown>[] | null>(null);

	// Parse CSV content (async due to dynamic papaparse import)
	useEffect(() => {
		let cancelled = false;
		parseCsvData(fileContent).then((rows) => {
			if (!cancelled) setParsedRows(rows);
		});
		return () => {
			cancelled = true;
		};
	}, [fileContent]);

	// Active mappings (exclude skipped columns)
	const activeMappings = useMemo(
		() => mappings.filter((m) => m.schemaField !== "__skip__"),
		[mappings]
	);

	// Build import records from parsed rows + mappings
	const records = useMemo(() => {
		if (!parsedRows) return [];
		return buildImportRecords(parsedRows, activeMappings);
	}, [parsedRows, activeMappings]);

	// Query existing clients for duplicate detection
	const existingClients = useQuery(api.clients.listNamesForOrg) ?? [];

	// Run validation
	const validationErrors = useMemo(
		() => validateImportRecords(records),
		[records]
	);

	// Group errors by row index for efficient lookup
	const errorsByRow = useMemo(() => {
		const map = new Map<number, RecordValidationError[]>();
		for (const err of validationErrors) {
			const existing = map.get(err.rowIndex) || [];
			existing.push(err);
			map.set(err.rowIndex, existing);
		}
		return map;
	}, [validationErrors]);

	// Run duplicate detection
	const duplicateMap = useMemo(
		() => detectDuplicates(records, existingClients),
		[records, existingClients]
	);

	// Initialize skipped rows for duplicates (run once when duplicate map is computed)
	const [initialized, setInitialized] = useState(false);
	useEffect(() => {
		if (initialized || duplicateMap.size === 0) return;
		const skippedSet = new Set<number>();
		for (const [rowIndex] of duplicateMap) {
			skippedSet.add(rowIndex);
		}
		initReviewSkippedRows(skippedSet);
		setInitialized(true);
	}, [duplicateMap, initialized, initReviewSkippedRows]);

	// Build ReviewRow array
	const reviewRows: ReviewRow[] = useMemo(() => {
		return records.map((record, rowIndex) => {
			const errors = errorsByRow.get(rowIndex) || [];
			const duplicateMatch = duplicateMap.get(rowIndex);
			const hasErrors = errors.length > 0;
			const isDuplicate = !!duplicateMatch;

			// Status priority: error > duplicate > valid
			const status = hasErrors ? "error" : isDuplicate ? "duplicate" : "valid";

			return {
				rowIndex,
				record,
				status,
				errors,
				duplicateMatch: duplicateMatch
					? { matchedName: duplicateMatch.matchedName, score: duplicateMatch.score }
					: undefined,
				skipImport: reviewSkippedRows.has(rowIndex),
			};
		});
	}, [records, errorsByRow, duplicateMap, reviewSkippedRows]);

	// Compute counts
	const counts = useMemo(() => {
		const valid = reviewRows.filter((r) => r.status === "valid").length;
		const errors = reviewRows.filter((r) => r.status === "error").length;
		const duplicates = reviewRows.filter((r) => r.status === "duplicate").length;
		return {
			all: reviewRows.length,
			errors,
			duplicates,
			valid,
		};
	}, [reviewRows]);

	const skippedCount = useMemo(
		() => reviewRows.filter((r) => r.skipImport).length,
		[reviewRows]
	);

	// Filter rows based on active tab
	const filteredRows = useMemo(() => {
		switch (activeTab) {
			case "errors":
				return reviewRows.filter((r) => r.status === "error");
			case "duplicates":
				return reviewRows.filter((r) => r.status === "duplicate");
			case "valid":
				return reviewRows.filter((r) => r.status === "valid");
			default:
				return reviewRows;
		}
	}, [reviewRows, activeTab]);

	// Plan limits
	const { planLimits, currentUsage, hasPremiumAccess } = useFeatureAccess();
	const importableCount = reviewRows.filter((r) => !r.skipImport && r.status !== "error").length;

	// Virtualizer
	const virtualizer = useVirtualizer({
		count: filteredRows.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 56,
		overscan: 10,
	});

	// Get error fields set for a row to highlight cells
	const getRowErrorFields = (row: ReviewRow): Set<string> => {
		return new Set(row.errors.map((e) => e.field));
	};

	// Get error message for a specific field in a row
	const getFieldError = (row: ReviewRow, field: string): string | undefined => {
		return row.errors.find((e) => e.field === field)?.message;
	};

	if (!parsedRows) {
		return (
			<div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
				Parsing CSV data...
			</div>
		);
	}

	if (records.length === 0) {
		return (
			<div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
				No records found in the CSV file.
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Plan limit banner */}
			<PlanLimitBanner
				currentCount={currentUsage?.clientsCount ?? 0}
				importableCount={importableCount}
				clientLimit={planLimits.clients}
				hasPremiumAccess={hasPremiumAccess}
			/>

			{/* Summary stats bar */}
			<ReviewSummaryBar
				totalRows={reviewRows.length}
				validCount={counts.valid}
				errorCount={counts.errors}
				duplicateCount={counts.duplicates}
				skippedCount={skippedCount}
			/>

			{/* Filter tabs */}
			<ReviewFilterTabs
				activeTab={activeTab}
				onTabChange={setActiveTab}
				counts={counts}
			/>

			{/* Virtualized table */}
			<div className="overflow-hidden rounded-lg border">
				<div
					ref={parentRef}
					className="h-[500px] overflow-auto"
				>
					{/* Sticky table header */}
					<div className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm border-b">
						<div className="flex min-w-max">
							<div className="w-12 shrink-0 px-2 py-2 text-xs font-medium text-muted-foreground">#</div>
							<div className="w-10 shrink-0 px-2 py-2" />
							{activeMappings.map((mapping) => (
								<div
									key={mapping.csvColumn}
									className="w-40 shrink-0 px-3 py-2 text-xs font-medium text-muted-foreground truncate"
									title={mapping.schemaField}
								>
									{mapping.schemaField}
								</div>
							))}
							{counts.duplicates > 0 && (
								<div className="w-24 shrink-0 px-3 py-2 text-xs font-medium text-muted-foreground">
									Action
								</div>
							)}
						</div>
					</div>

					{/* Virtual rows */}
					<div
						style={{
							height: `${virtualizer.getTotalSize()}px`,
							width: "100%",
							position: "relative",
						}}
					>
						{virtualizer.getVirtualItems().map((virtualRow) => {
							const row = filteredRows[virtualRow.index];
							const errorFields = getRowErrorFields(row);
							const isSkipped = row.skipImport;

							return (
								<div
									key={row.rowIndex}
									style={{
										position: "absolute",
										top: 0,
										left: 0,
										width: "100%",
										height: `${virtualRow.size}px`,
										transform: `translateY(${virtualRow.start}px)`,
									}}
									className={`flex min-w-max items-center border-b border-border/50 ${
										isSkipped ? "opacity-50" : ""
									} ${
										row.status === "error"
											? "bg-red-50/50 dark:bg-red-950/10"
											: ""
									}`}
								>
									{/* Row number */}
									<div className="w-12 shrink-0 px-2 text-xs text-muted-foreground tabular-nums">
										{row.rowIndex + 1}
									</div>

									{/* Status icon */}
									<div className="w-10 shrink-0 px-2 flex items-center justify-center">
										{row.status === "valid" && (
											<CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
										)}
										{row.status === "error" && (
											<Tooltip>
												<TooltipTrigger asChild>
													<XCircle className="h-4 w-4 text-red-600 dark:text-red-400 cursor-help" />
												</TooltipTrigger>
												<TooltipContent>
													<div className="space-y-1">
														{row.errors.map((e, i) => (
															<p key={i} className="text-xs">
																<span className="font-medium">{e.field}:</span> {e.message}
															</p>
														))}
													</div>
												</TooltipContent>
											</Tooltip>
										)}
										{row.status === "duplicate" && (
											<AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
										)}
									</div>

									{/* Data columns */}
									{activeMappings.map((mapping) => {
										const value = resolveRecordValue(
											row.record as Record<string, unknown>,
											mapping.schemaField
										);
										const displayValue =
											value !== undefined && value !== null
												? String(value)
												: "";
										const hasError = errorFields.has(mapping.schemaField);
										const errorMsg = hasError
											? getFieldError(row, mapping.schemaField)
											: undefined;

										return (
											<div
												key={mapping.csvColumn}
												className={`w-40 shrink-0 px-3 py-1.5 ${
													hasError
														? "bg-red-50 dark:bg-red-950/30 border-l border-r border-red-300 dark:border-red-700"
														: ""
												}`}
											>
												{hasError ? (
													<Tooltip>
														<TooltipTrigger asChild>
															<div className="truncate text-sm text-red-700 dark:text-red-300 cursor-help">
																{displayValue || (
																	<span className="italic text-red-400">empty</span>
																)}
															</div>
														</TooltipTrigger>
														<TooltipContent>
															<p className="text-xs">{errorMsg}</p>
														</TooltipContent>
													</Tooltip>
												) : (
													<div className="space-y-0">
														<div className="truncate text-sm text-foreground">
															{displayValue || (
																<span className="text-muted-foreground">-</span>
															)}
														</div>
														{/* Show duplicate match info below companyName */}
														{row.status === "duplicate" &&
															mapping.schemaField === "companyName" &&
															row.duplicateMatch && (
																<p className="text-xs text-muted-foreground truncate">
																	Possible match: {row.duplicateMatch.matchedName}
																</p>
															)}
													</div>
												)}
											</div>
										);
									})}

									{/* Action column for duplicates */}
									{counts.duplicates > 0 && (
										<div className="w-24 shrink-0 px-3 flex items-center">
											{row.status === "duplicate" && (
												<Button
													intent={isSkipped ? "outline" : "secondary"}
													size="sm"
													className="text-xs h-7"
													onPress={() =>
														setRowSkip(row.rowIndex, !isSkipped)
													}
												>
													{isSkipped ? "Import" : "Skip"}
												</Button>
											)}
										</div>
									)}
								</div>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
}
