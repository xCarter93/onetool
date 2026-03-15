"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
	AlertTriangle,
	CheckCircle2,
	XCircle,
	Loader2,
} from "lucide-react";
import type {
	FieldMapping,
	ImportResult,
	ImportRecord,
	ImportResultItem,
} from "@/types/csv-import";
import { parseCsvData, buildImportRecords } from "../utils/transform-csv";
import {
	cellKey,
	initializeCellValues,
	rebuildRecordsFromCells,
	validateCells,
	getFieldMeta,
} from "../utils/editable-cells";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { StyledButton } from "@/components/ui/styled/styled-button";

interface StepPreviewImportProps {
	fileContent: string;
	mappings: FieldMapping[];
	isImporting: boolean;
	importResult: ImportResult | null;
	onImport: (records: ImportRecord[]) => void;
}

const MAX_PREVIEW_ROWS = 15;

// ---------------------------------------------------------------------------
// EditableCell -- inline sub-component
// ---------------------------------------------------------------------------

interface EditableCellProps {
	rowIndex: number;
	field: string;
	value: string;
	error: string | undefined;
	onCommit: (rowIndex: number, field: string, value: string) => void;
}

function EditableCell({
	rowIndex,
	field,
	value,
	error,
	onCommit,
}: EditableCellProps) {
	const meta = getFieldMeta(field);
	const isEnum = meta?.type === "enum" && meta.options;

	const cell = isEnum ? (
		<Select
			defaultValue={value || undefined}
			onValueChange={(v) => onCommit(rowIndex, field, v)}
		>
			<SelectTrigger
				className={`h-7 text-xs font-mono border-0 shadow-none px-1 ${
					error ? "ring-1 ring-red-500" : ""
				}`}
			>
				<SelectValue placeholder="---" />
			</SelectTrigger>
			<SelectContent>
				{meta.options!.map((opt) => (
					<SelectItem key={opt} value={opt}>
						{opt}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	) : (
		<input
			type="text"
			defaultValue={value}
			className={`w-full bg-transparent text-xs font-mono outline-none px-1 py-0.5 rounded ${
				error ? "ring-1 ring-red-500" : ""
			}`}
			onBlur={(e) => onCommit(rowIndex, field, e.currentTarget.value)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === "Tab") {
					onCommit(rowIndex, field, e.currentTarget.value);
				}
			}}
		/>
	);

	if (error) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<div>{cell}</div>
				</TooltipTrigger>
				<TooltipContent className="max-w-xs text-red-600 dark:text-red-400">
					{error}
				</TooltipContent>
			</Tooltip>
		);
	}

	return cell;
}

// ---------------------------------------------------------------------------
// StatusIcon -- per-row import result icon
// ---------------------------------------------------------------------------

function StatusIcon({ item }: { item: ImportResultItem }) {
	const hasWarnings = (item.warnings?.length ?? 0) > 0;

	let icon: React.ReactNode;
	let tooltipText: string | undefined;

	if (item.success && !hasWarnings) {
		icon = (
			<CheckCircle2 className="w-4 h-4 text-green-500" />
		);
	} else if (item.success && hasWarnings) {
		icon = (
			<AlertTriangle className="w-4 h-4 text-yellow-500" />
		);
		tooltipText = item.warnings!.join("\n");
	} else {
		icon = (
			<XCircle className="w-4 h-4 text-red-500" />
		);
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

// ---------------------------------------------------------------------------
// StepPreviewImport
// ---------------------------------------------------------------------------

export function StepPreviewImport({
	fileContent,
	mappings,
	isImporting,
	importResult,
	onImport,
}: StepPreviewImportProps) {
	const [previewData, setPreviewData] = useState<
		Record<string, unknown>[]
	>([]);
	const [totalRows, setTotalRows] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [cellValues, setCellValues] = useState<Map<string, string>>(
		() => new Map()
	);
	const [cellErrors, setCellErrors] = useState<Map<string, string>>(
		() => new Map()
	);

	const activeMappings = useMemo(
		() => mappings.filter((m) => m.schemaField !== "__skip__"),
		[mappings]
	);
	const columnHeaders = useMemo(
		() => activeMappings.map((m) => m.schemaField),
		[activeMappings]
	);

	const isResultsMode = importResult !== null;
	const hasErrors = cellErrors.size > 0;

	// Load preview data and initialize cell values
	useEffect(() => {
		let cancelled = false;

		async function loadPreview() {
			setIsLoading(true);
			const rows = await parseCsvData(fileContent);
			if (cancelled) return;
			setTotalRows(rows.length);
			const preview = rows.slice(0, MAX_PREVIEW_ROWS);
			const records = buildImportRecords(preview, activeMappings);
			if (cancelled) return;
			setPreviewData(records);

			// Initialize cell values and run initial validation
			const cells = initializeCellValues(records, columnHeaders);
			setCellValues(cells);
			const errors = validateCells(cells, activeMappings, records.length);
			setCellErrors(errors);

			setIsLoading(false);
		}

		loadPreview();
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [fileContent]);

	// Handle cell edit commit
	const handleCellCommit = useCallback(
		(rowIndex: number, field: string, value: string) => {
			setCellValues((prev) => {
				const next = new Map(prev);
				next.set(cellKey(rowIndex, field), value);
				// Validate after update
				const errors = validateCells(
					next,
					activeMappings,
					previewData.length
				);
				setCellErrors(errors);
				return next;
			});
		},
		[activeMappings, previewData.length]
	);

	// Handle import click
	const handleImportClick = useCallback(() => {
		const records = rebuildRecordsFromCells(
			cellValues,
			activeMappings,
			previewData.length
		);
		onImport(records);
	}, [cellValues, activeMappings, previewData.length, onImport]);

	return (
		<div className="space-y-6 min-w-0">
			{totalRows > 0 && (
				<p className="text-sm text-muted-foreground">
					<span className="font-medium text-foreground">
						{totalRows} total row{totalRows !== 1 && "s"}
					</span>
					{totalRows > MAX_PREVIEW_ROWS && (
						<span>
							{" "}
							(showing first {MAX_PREVIEW_ROWS})
						</span>
					)}
				</p>
			)}

			{isLoading ? (
				<div className="flex items-center justify-center gap-3 p-8">
					<Loader2 className="w-5 h-5 animate-spin text-primary" />
					<span className="text-sm text-muted-foreground">
						Building preview...
					</span>
				</div>
			) : (
				<div className="overflow-x-auto rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-12 text-center">
									#
								</TableHead>
								{isResultsMode && (
									<TableHead className="w-10 text-center">
										Status
									</TableHead>
								)}
								{columnHeaders.map((header) => (
									<TableHead
										key={header}
										className="min-w-32"
									>
										<code className="text-xs font-mono">
											{header}
										</code>
									</TableHead>
								))}
							</TableRow>
						</TableHeader>
						<TableBody>
							{previewData.map((_, rowIndex) => {
								const resultItem = isResultsMode
									? importResult.items.find(
											(i) => i.rowIndex === rowIndex
										)
									: undefined;

								return (
									<TableRow key={rowIndex}>
										<TableCell className="text-center text-muted-foreground text-xs">
											{rowIndex + 1}
										</TableCell>
										{isResultsMode && (
											<TableCell className="text-center">
												{resultItem ? (
													<StatusIcon
														item={resultItem}
													/>
												) : (
													<span className="text-muted-foreground">
														-
													</span>
												)}
											</TableCell>
										)}
										{columnHeaders.map((header) => {
											const key = cellKey(
												rowIndex,
												header
											);
											const val =
												cellValues.get(key) ?? "";
											const error = cellErrors.get(key);

											return (
												<TableCell
													key={header}
													className="text-xs font-mono max-w-48 p-1"
												>
													{isResultsMode ? (
														<span className="px-1">
															{val || (
																<span className="text-muted-foreground italic">
																	---
																</span>
															)}
														</span>
													) : (
														<EditableCell
															rowIndex={rowIndex}
															field={header}
															value={val}
															error={error}
															onCommit={
																handleCellCommit
															}
														/>
													)}
												</TableCell>
											);
										})}
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			)}

			{!isLoading && !isResultsMode && (
				<div className="flex justify-center pt-2">
					{hasErrors ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<span>
									<StyledButton
										intent="primary"
										size="lg"
										disabled
										label={`Import ${totalRows} Client${totalRows !== 1 ? "s" : ""}`}
									/>
								</span>
							</TooltipTrigger>
							<TooltipContent>
								{cellErrors.size} cell
								{cellErrors.size !== 1 ? "s" : ""} have errors
							</TooltipContent>
						</Tooltip>
					) : (
						<StyledButton
							intent="primary"
							size="lg"
							onClick={handleImportClick}
							isLoading={isImporting}
							disabled={isImporting}
							label={
								isImporting
									? "Importing..."
									: `Import ${totalRows} Client${totalRows !== 1 ? "s" : ""}`
							}
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
