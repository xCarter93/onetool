"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { FieldMapping, ImportResult } from "@/types/csv-import";
import { parseCsvData, buildImportRecords, resolveRecordValue } from "../utils/transform-csv";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { StyledButton } from "@/components/ui/styled/styled-button";

interface StepPreviewImportProps {
	fileContent: string;
	mappings: FieldMapping[];
	isImporting: boolean;
	importResult: ImportResult | null;
	onImport: () => void;
}

const MAX_PREVIEW_ROWS = 15;

export function StepPreviewImport({
	fileContent,
	mappings,
	isImporting,
	importResult,
	onImport,
}: StepPreviewImportProps) {
	const [previewData, setPreviewData] = useState<Record<string, unknown>[]>([]);
	const [totalRows, setTotalRows] = useState(0);
	const [isLoading, setIsLoading] = useState(true);

	const activeMappings = mappings.filter((m) => m.schemaField !== "__skip__");
	const columnHeaders = activeMappings.map((m) => m.schemaField);

	useEffect(() => {
		let cancelled = false;

		async function loadPreview() {
			setIsLoading(true);
			const rows = await parseCsvData(fileContent);
			if (cancelled) return;
			setTotalRows(rows.length);
			const records = buildImportRecords(rows.slice(0, MAX_PREVIEW_ROWS), activeMappings);
			if (cancelled) return;
			setPreviewData(records);
			setIsLoading(false);
		}

		loadPreview();
		return () => { cancelled = true; };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [fileContent]);

	if (importResult) {
		const warningCount = importResult.items.filter(
			(i) => i.success && i.warnings?.length,
		).length;
		const hasFailures = importResult.failureCount > 0;
		const hasWarnings = warningCount > 0;
		const allSuccess = !hasFailures && !hasWarnings;

		return (
			<div className="max-w-lg mx-auto text-center space-y-6 py-8">
				<div className="flex justify-center">
					{allSuccess && (
						<div className="rounded-full bg-green-100 dark:bg-green-950/40 p-4">
							<CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
						</div>
					)}
					{!allSuccess && hasWarnings && !hasFailures && (
						<div className="rounded-full bg-yellow-100 dark:bg-yellow-950/40 p-4">
							<AlertTriangle className="w-10 h-10 text-yellow-600 dark:text-yellow-400" />
						</div>
					)}
					{hasFailures && (
						<div className="rounded-full bg-red-100 dark:bg-red-950/40 p-4">
							<XCircle className="w-10 h-10 text-red-600 dark:text-red-400" />
						</div>
					)}
				</div>

				<div className="space-y-2">
					<h2 className="text-xl font-semibold text-foreground">
						{allSuccess
							? "Import complete"
							: hasFailures
								? "Import finished with errors"
								: "Import complete with warnings"}
					</h2>
					<p className="text-sm text-muted-foreground">
						{importResult.successCount} client{importResult.successCount !== 1 && "s"} imported successfully
						{hasWarnings && <> ({warningCount} with warnings)</>}
						{hasFailures && (
							<>, {importResult.failureCount} failed</>
						)}
					</p>
				</div>

				{/* Per-row results */}
				<div className="max-h-64 overflow-y-auto space-y-1 text-left">
					{importResult.items.map((item) => (
						<div
							key={item.rowIndex}
							className="flex items-start gap-2 text-sm px-2 py-1 rounded"
						>
							{item.success && !item.warnings?.length && (
								<CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
							)}
							{item.success && (item.warnings?.length ?? 0) > 0 && (
								<AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
							)}
							{!item.success && (
								<XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
							)}
							<div>
								<span className="text-foreground">Row {item.rowIndex + 1}</span>
								{item.warnings?.map((w, i) => (
									<p key={i} className="text-xs text-yellow-600 dark:text-yellow-400">
										{w}
									</p>
								))}
								{item.error && (
									<p className="text-xs text-red-600 dark:text-red-400">
										{item.error}
									</p>
								)}
							</div>
						</div>
					))}
				</div>

				<Link href="/clients">
					<StyledButton intent="primary" label="Go to Clients" />
				</Link>
			</div>
		);
	}

	return (
		<div className="space-y-6 min-w-0">
			{totalRows > 0 && (
				<p className="text-sm text-muted-foreground">
					<span className="font-medium text-foreground">
						{totalRows} total row{totalRows !== 1 && "s"}
					</span>
					{totalRows > MAX_PREVIEW_ROWS && (
						<span>
							{" "}(showing first {MAX_PREVIEW_ROWS})
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
								<TableHead className="w-12 text-center">#</TableHead>
								{columnHeaders.map((header) => (
									<TableHead key={header} className="min-w-32">
										<code className="text-xs font-mono">{header}</code>
									</TableHead>
								))}
							</TableRow>
						</TableHeader>
						<TableBody>
							{previewData.map((record, rowIndex) => (
								<TableRow key={rowIndex}>
									<TableCell className="text-center text-muted-foreground text-xs">
										{rowIndex + 1}
									</TableCell>
									{columnHeaders.map((header) => {
										const val = resolveRecordValue(record, header);
										return (
											<TableCell
												key={header}
												className="text-xs font-mono max-w-48 truncate"
											>
												{val !== undefined && val !== null
													? Array.isArray(val)
														? val.join(", ")
														: String(val)
													: <span className="text-muted-foreground italic">---</span>}
											</TableCell>
										);
									})}
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			{!isLoading && (
				<div className="flex justify-center pt-2">
					<StyledButton
						intent="primary"
						size="lg"
						onClick={onImport}
						isLoading={isImporting}
						disabled={isImporting}
						label={isImporting ? "Importing..." : `Import ${totalRows} Client${totalRows !== 1 ? "s" : ""}`}
					/>
				</div>
			)}
		</div>
	);
}
