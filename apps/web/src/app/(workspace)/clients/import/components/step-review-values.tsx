"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CheckCircle2, AlertTriangle, XCircle, MinusCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StyledButton } from "@/components/ui/styled/styled-button";
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip";
import {
	StyledSelect,
	StyledSelectTrigger,
	StyledSelectContent,
	SelectItem,
	SelectValue,
} from "@/components/ui/styled/styled-select";
import { StyledInput } from "@/components/ui/styled/styled-input";
import type { FieldMapping, ImportRecord, ImportResult, ImportResultItem, RecordValidationError } from "@/types/csv-import";
import {
	parseCsvData,
	buildImportRecords,
	validateImportRecords,
	resolveRecordValue,
} from "../utils/transform-csv";
import { detectDuplicates } from "../utils/duplicate-detection";
import {
	cellKey,
	initializeCellValues,
	rebuildRecordsFromCells,
	getFieldMeta,
} from "../utils/editable-cells";
import type { ReviewRow, FilterTab } from "../utils/review-types";
import { ReviewSummaryBar } from "./review-summary-bar";
import { ReviewFilterTabs } from "./review-filter-tabs";

// ---------------------------------------------------------------------------
// StatusIcon -- per-row import result icon
// ---------------------------------------------------------------------------

function StatusIcon({ item }: { item: ImportResultItem }) {
	const hasWarnings = (item.warnings?.length ?? 0) > 0;

	let icon: React.ReactNode;
	let tooltipText: string | undefined;

	if (item.skipped) {
		icon = <MinusCircle className="w-4 h-4 text-muted-foreground" />;
		tooltipText = "Skipped (duplicate)";
	} else if (item.success && !hasWarnings) {
		icon = <CheckCircle2 className="w-4 h-4 text-green-500" />;
	} else if (item.success && hasWarnings) {
		icon = <AlertTriangle className="w-4 h-4 text-yellow-500" />;
		tooltipText = item.warnings!.join("\n");
	} else {
		icon = <XCircle className="w-4 h-4 text-red-500" />;
		tooltipText = item.error || "Import failed";
	}

	if (tooltipText) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="inline-flex">{icon}</span>
				</TooltipTrigger>
				<TooltipContent className="max-w-xs whitespace-pre-wrap">
					{tooltipText}
				</TooltipContent>
			</Tooltip>
		);
	}

	return <span className="inline-flex">{icon}</span>;
}

interface StepReviewValuesProps {
	fileContent: string;
	mappings: FieldMapping[];
	reviewSkippedRows: Set<number>;
	setRowSkip: (rowIndex: number, skip: boolean) => void;
	initReviewSkippedRows: (skippedSet: Set<number>) => void;
	isImporting: boolean;
	importResult: ImportResult | null;
	importProgress?: { current: number; total: number; succeeded: number; failed: number };
	onImport: (records: ImportRecord[], reviewRows: ReviewRow[]) => void;
}

export function StepReviewValues({
	fileContent,
	mappings,
	reviewSkippedRows,
	setRowSkip,
	initReviewSkippedRows,
	isImporting,
	importResult,
	importProgress,
	onImport,
}: StepReviewValuesProps) {
	const parentRef = useRef<HTMLDivElement>(null);
	const [activeTab, setActiveTab] = useState<FilterTab>("all");
	const [parsedRows, setParsedRows] = useState<Record<string, unknown>[] | null>(null);
	const [editingCell, setEditingCell] = useState<string | null>(null);
	const [cellValues, setCellValues] = useState<Map<string, string> | null>(null);

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

	const columnHeaders = useMemo(
		() => activeMappings.map((m) => m.schemaField),
		[activeMappings]
	);

	// Build initial import records from parsed rows + mappings
	const initialRecords = useMemo(() => {
		if (!parsedRows) return [];
		return buildImportRecords(parsedRows, activeMappings);
	}, [parsedRows, activeMappings]);

	// Initialize cellValues once from initial records
	useEffect(() => {
		if (initialRecords.length > 0 && cellValues === null) {
			setCellValues(initializeCellValues(initialRecords as unknown as Record<string, unknown>[], columnHeaders));
		}
	}, [initialRecords, columnHeaders, cellValues]);

	// Derive records from cellValues (reflects edits) or fall back to initial
	const records = useMemo(() => {
		if (!cellValues || cellValues.size === 0) return initialRecords;
		return rebuildRecordsFromCells(cellValues, activeMappings, initialRecords.length);
	}, [cellValues, activeMappings, initialRecords]);

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

	// Import-related derived state
	const isResultsMode = importResult !== null;
	const hasValidationErrors = validationErrors.length > 0;
	const importableCount = reviewRows.filter((r) => !r.skipImport && r.status !== "error").length;

	// Handle import click: rebuild records, filter out skipped/error rows, pass to parent
	const handleImportClick = useCallback(() => {
		const builtRecords = rebuildRecordsFromCells(cellValues ?? new Map(), activeMappings, records.length);
		// Filter to only importable rows (not skipped, not error)
		const importableRecords = builtRecords.filter((_, i) => {
			const row = reviewRows[i];
			return row && !row.skipImport && row.status !== "error";
		});
		onImport(importableRecords, reviewRows);
	}, [cellValues, activeMappings, records.length, reviewRows, onImport]);

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

	// Cell editing handlers
	const handleCellClick = useCallback((rowIndex: number, field: string) => {
		if (isResultsMode) return; // No editing in results mode
		setEditingCell(cellKey(rowIndex, field));
	}, [isResultsMode]);

	const handleCellChange = useCallback((key: string, value: string) => {
		setCellValues((prev) => {
			const next = new Map(prev ?? []);
			next.set(key, value);
			return next;
		});
	}, []);

	const handleCellBlur = useCallback(() => {
		setEditingCell(null);
	}, []);

	const handleCellKeyDown = useCallback((e: React.KeyboardEvent) => {
		if (e.key === "Enter" || e.key === "Escape") {
			setEditingCell(null);
		}
	}, []);

	// Helper: check if a row's result is skipped in results mode
	const isResultSkipped = useCallback((rowIndex: number): boolean => {
		if (!importResult) return false;
		const resultItem = importResult.items.find((i) => i.rowIndex === rowIndex);
		return resultItem?.skipped === true;
	}, [importResult]);

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
			{/* Summary stats bar */}
			<ReviewSummaryBar
				totalRows={reviewRows.length}
				validCount={counts.valid}
				errorCount={counts.errors}
				duplicateCount={counts.duplicates}
				skippedCount={skippedCount}
				resultsMode={isResultsMode ? {
					importedCount: importResult.successCount,
					failedCount: importResult.failureCount,
					skippedCount: importResult.skippedCount ?? 0,
				} : undefined}
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
					className={`h-[500px] overflow-auto ${isImporting ? "opacity-60 pointer-events-none" : ""}`}
				>
					{/* Sticky table header */}
					<div className="sticky top-0 z-10 border-b min-w-max bg-muted/80 backdrop-blur-sm">
						<div className="flex">
							<div className="w-12 shrink-0 px-2 py-2 text-xs font-medium text-muted-foreground">#</div>
							<div className="w-10 shrink-0 px-2 py-2 text-xs font-medium text-muted-foreground">
								{isResultsMode ? "Status" : ""}
							</div>
							{activeMappings.map((mapping) => (
								<div
									key={mapping.csvColumn}
									className="w-40 shrink-0 px-3 py-2 text-xs font-medium text-muted-foreground truncate"
									title={mapping.schemaField}
								>
									{mapping.schemaField}
								</div>
							))}
							{!isResultsMode && counts.duplicates > 0 && (
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
							const resultSkipped = isResultsMode && isResultSkipped(row.rowIndex);

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
										isSkipped || resultSkipped ? "opacity-50" : ""
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
										{isResultsMode ? (
											(() => {
												const resultItem = importResult.items.find(
													(i) => i.rowIndex === row.rowIndex
												);
												return resultItem ? (
													<StatusIcon item={resultItem} />
												) : (
													<span className="text-muted-foreground">-</span>
												);
											})()
										) : (
											<>
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
											</>
										)}
									</div>

									{/* Data columns */}
									{activeMappings.map((mapping) => {
										const field = mapping.schemaField;
										const key = cellKey(row.rowIndex, field);
										const isEditing = !isResultsMode && editingCell === key;
										const cellVal = cellValues?.get(key) ?? "";
										const displayValue = cellVal || resolveRecordValue(
											row.record as Record<string, unknown>,
											field
										);
										const displayStr =
											displayValue !== undefined && displayValue !== null
												? String(displayValue)
												: "";
										const hasError = errorFields.has(field);
										const errorMsg = hasError
											? getFieldError(row, field)
											: undefined;
										const meta = getFieldMeta(field);
										const isEnum = meta?.type === "enum" && meta.options;

										return (
											<div
												key={mapping.csvColumn}
												className={`w-40 shrink-0 px-3 py-1.5 ${
													hasError && !isResultsMode
														? "bg-red-50 dark:bg-red-950/30 border-l border-r border-red-300 dark:border-red-700"
														: ""
												}`}
											>
												{isResultsMode ? (
													<div className="truncate text-sm text-foreground">
														{displayStr || (
															<span className="text-muted-foreground">-</span>
														)}
													</div>
												) : isEditing ? (
													isEnum ? (
														<StyledSelect
															value={cellVal || undefined}
															onValueChange={(val) => {
																handleCellChange(key, val);
																setEditingCell(null);
															}}
															open
															onOpenChange={(open) => {
																if (!open) setEditingCell(null);
															}}
														>
															<StyledSelectTrigger size="sm" className="w-full h-7 text-sm">
																<SelectValue placeholder="Select..." />
															</StyledSelectTrigger>
															<StyledSelectContent>
																{meta.options!.map((opt) => (
																	<SelectItem key={opt} value={opt}>{opt}</SelectItem>
																))}
															</StyledSelectContent>
														</StyledSelect>
													) : (
														<StyledInput
															autoFocus
															type="text"
															className="h-7 text-sm"
															value={cellVal}
															onChange={(e) => handleCellChange(key, e.target.value)}
															onBlur={handleCellBlur}
															onKeyDown={handleCellKeyDown}
														/>
													)
												) : hasError ? (
													<Tooltip>
														<TooltipTrigger asChild>
															<div
																className="truncate text-sm text-red-700 dark:text-red-300 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/40 rounded px-1 -mx-1"
																onClick={() => handleCellClick(row.rowIndex, field)}
															>
																{displayStr || (
																	<span className="italic text-red-400">empty</span>
																)}
															</div>
														</TooltipTrigger>
														<TooltipContent>
															<p className="text-xs">{errorMsg}</p>
															<p className="text-xs text-muted-foreground mt-1">Click to edit</p>
														</TooltipContent>
													</Tooltip>
												) : (
													<div
														className="space-y-0 cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1"
														onClick={() => handleCellClick(row.rowIndex, field)}
													>
														<div className="truncate text-sm text-foreground">
															{displayStr || (
																<span className="text-muted-foreground">-</span>
															)}
														</div>
														{/* Show duplicate match info below companyName */}
														{row.status === "duplicate" &&
															field === "companyName" &&
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
									{!isResultsMode && counts.duplicates > 0 && (
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

			{/* Import button / results footer */}
			{!isResultsMode && !isImporting && (
				<div className="flex justify-center pt-2">
					{hasValidationErrors ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<span>
									<StyledButton
										intent="primary"
										size="lg"
										disabled
										label={`Import ${importableCount} Client${importableCount !== 1 ? "s" : ""}`}
									/>
								</span>
							</TooltipTrigger>
							<TooltipContent>
								{validationErrors.length} validation error{validationErrors.length !== 1 ? "s" : ""} found. Fix errors before importing.
							</TooltipContent>
						</Tooltip>
					) : (
						<StyledButton
							intent="primary"
							size="lg"
							onClick={handleImportClick}
							label={`Import ${importableCount} Client${importableCount !== 1 ? "s" : ""}`}
						/>
					)}
				</div>
			)}

			{isImporting && (
				<div className="flex flex-col items-center pt-4">
					{importProgress ? (
						<div className="space-y-2 w-full max-w-md mx-auto">
							<div className="h-2 bg-muted rounded-full overflow-hidden">
								<div
									className="h-full bg-primary rounded-full transition-all duration-300"
									style={{ width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%` }}
								/>
							</div>
							<p className="text-sm text-center text-muted-foreground">
								Importing {importProgress.current} of {importProgress.total} clients...
							</p>
							<p className="text-xs text-center text-muted-foreground">
								{importProgress.succeeded} succeeded{" "}&middot;{" "}{importProgress.failed} failed
							</p>
						</div>
					) : (
						<StyledButton
							intent="primary"
							size="lg"
							isLoading={true}
							disabled
							label="Importing..."
						/>
					)}
				</div>
			)}

			{isResultsMode && (
				<div className="flex justify-center pt-2">
					<Link href="/clients">
						<StyledButton intent="primary" label="Go to Clients" />
					</Link>
				</div>
			)}
		</div>
	);
}
