"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { AlertTriangle } from "lucide-react";

import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyErrorMessage, logError } from "@/lib/error-logger";

/** The backend throws `new ConvexError("import_already_running")`. */
function isAlreadyRunning(error: unknown): boolean {
	const data = (error as { data?: unknown } | null)?.data;
	if (typeof data === "string" && data === "import_already_running") return true;
	return (
		error instanceof Error && error.message.includes("import_already_running")
	);
}

/**
 * One-time QuickBooks customer import. Runs server-side, so the dialog is a
 * live view of the run rather than the thing driving it — closing it is safe.
 */
export function QuickBooksImportDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="w-[min(92vw,36rem)]">
				{/* Mounted per open so "started this session" means this open. */}
				{open && <ImportBody />}
			</DialogContent>
		</Dialog>
	);
}

function ImportBody() {
	const toast = useToast();
	const startImport = useAction(api.quickbooksImportActions.startImport);
	const run = useQuery(api.quickbooksImport.getImportRun);

	const [starting, setStarting] = useState(false);
	const [startedThisSession, setStartedThisSession] = useState(false);
	// Watching a run finish counts as this session's run, so the reviewer who
	// clears the last row lands on the summary instead of back at the intro.
	const [sawActiveRun, setSawActiveRun] = useState(false);
	if (
		(run?.status === "running" || run?.status === "awaiting_review") &&
		!sawActiveRun
	) {
		setSawActiveRun(true);
	}

	const handleStart = useCallback(async () => {
		setStarting(true);
		try {
			await startImport({});
			setStartedThisSession(true);
		} catch (error) {
			// A run already in flight is not a failure — show it instead.
			if (isAlreadyRunning(error)) {
				setStartedThisSession(true);
			} else {
				logError(error, { action: "quickbooks_start_import" });
				toast.error(
					"Couldn't start the import",
					getUserFriendlyErrorMessage(error) ?? "Try again in a moment.",
				);
			}
		} finally {
			setStarting(false);
		}
	}, [startImport, toast]);

	if (run === undefined) {
		return (
			<>
				<DialogHeader>
					<DialogTitle>Import your QuickBooks customers</DialogTitle>
				</DialogHeader>
				<div className="space-y-2 py-1">
					<Skeleton className="h-4 w-48" />
					<Skeleton className="h-4 w-3/4" />
				</div>
			</>
		);
	}

	if (run?.status === "running") {
		return <RunningState run={run} />;
	}

	if (run?.status === "awaiting_review") {
		return <ReviewState runId={run._id} ambiguous={run.ambiguous} />;
	}

	if (run?.status === "completed" && (startedThisSession || sawActiveRun)) {
		return <CompletedState run={run} />;
	}

	return (
		<IntroState
			run={run}
			starting={starting}
			onStart={() => void handleStart()}
		/>
	);
}

type ImportRun = Doc<"quickbooksImportRuns">;

function StatLine({ children }: { children: ReactNode }) {
	return (
		<p className="text-sm tabular-nums text-muted-foreground">{children}</p>
	);
}

function IntroState({
	run,
	starting,
	onStart,
}: {
	run: ImportRun | null;
	starting: boolean;
	onStart: () => void;
}) {
	const failed = run?.status === "failed";
	const previouslyCompleted = run?.status === "completed";

	return (
		<>
			<DialogHeader>
				<DialogTitle>Import your QuickBooks customers</DialogTitle>
				<DialogDescription>
					OneTool matches QuickBooks customers to your existing clients by name
					and brings the rest in as new clients. Nothing is pushed to QuickBooks
					during the import.
				</DialogDescription>
			</DialogHeader>

			{(failed || previouslyCompleted) && (
				<div className="py-1">
					{failed ? (
						<div className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.05] px-3 py-2.5">
							<AlertTriangle
								className="mt-0.5 size-4 shrink-0 text-destructive"
								aria-hidden="true"
							/>
							<p className="min-w-0 flex-1 text-sm text-foreground">
								{run?.lastError ?? "The import stopped before it finished."}
							</p>
						</div>
					) : (
						<div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
							<p className="text-sm font-medium text-foreground">
								Import complete
							</p>
							<StatLine>
								{run?.autoLinked} linked, {run?.imported} imported,{" "}
								{run?.skipped} skipped
							</StatLine>
						</div>
					)}
				</div>
			)}

			<DialogFooter>
				<DialogClose render={<Button variant="outline" />}>
					Skip for now
				</DialogClose>
				{previouslyCompleted ? (
					<Button variant="outline" onClick={onStart} disabled={starting}>
						{starting ? "Starting…" : "Import again"}
					</Button>
				) : (
					<Button onClick={onStart} disabled={starting}>
						{starting ? "Starting…" : failed ? "Try again" : "Start import"}
					</Button>
				)}
			</DialogFooter>
		</>
	);
}

function RunningState({ run }: { run: ImportRun }) {
	return (
		<>
			<DialogHeader>
				<DialogTitle>Importing your QuickBooks customers</DialogTitle>
			</DialogHeader>

			<div className="space-y-2 py-1">
				<div className="flex items-center gap-2">
					<Spinner className="size-4 text-muted-foreground" />
					<StatLine>
						{run.totalFetched} found, {run.autoLinked} linked, {run.imported}{" "}
						imported, {run.skipped} skipped
					</StatLine>
				</div>
				<p className="text-xs text-muted-foreground">
					You can close this. The import keeps running in the background.
				</p>
			</div>

			<DialogFooter>
				<DialogClose render={<Button variant="outline" />}>Close</DialogClose>
			</DialogFooter>
		</>
	);
}

function ReviewState({
	runId,
	ambiguous,
}: {
	runId: Id<"quickbooksImportRuns">;
	ambiguous: number;
}) {
	const toast = useToast();
	const rows = useQuery(api.quickbooksImport.listAmbiguousRows, { runId });
	const resolveImportRow = useMutation(api.quickbooksImport.resolveImportRow);
	const skipImportRow = useMutation(api.quickbooksImport.skipImportRow);

	const [pending, setPending] = useState<Set<string>>(new Set());
	const [picked, setPicked] = useState<Record<string, string>>({});

	const runRowAction = useCallback(
		async (
			rowId: Id<"quickbooksImportRows">,
			action: () => Promise<null>,
			failureTitle: string,
		) => {
			setPending((current) => new Set(current).add(rowId));
			try {
				await action();
			} catch (error) {
				logError(error, { action: "quickbooks_import_row_action" });
				toast.error(
					failureTitle,
					getUserFriendlyErrorMessage(error) ?? "Try again in a moment.",
				);
			} finally {
				setPending((current) => {
					const next = new Set(current);
					next.delete(rowId);
					return next;
				});
			}
		},
		[toast],
	);

	return (
		<>
			<DialogHeader>
				<DialogTitle>Review these QuickBooks customers</DialogTitle>
				<DialogDescription>
					{ambiguous} {ambiguous === 1 ? "customer matches" : "customers match"}{" "}
					more than one client. Pick the right one or choose not to import them.
				</DialogDescription>
			</DialogHeader>

			<div className="py-1">
				{rows === undefined ? (
					<div className="space-y-2">
						<Skeleton className="h-4 w-48" />
						<Skeleton className="h-4 w-3/4" />
					</div>
				) : (
					<ul className="divide-y divide-border">
						{rows.map((row) => {
							const busy = pending.has(row.rowId);
							const selected = picked[row.rowId] ?? "";
							return (
								<li
									key={row.rowId}
									className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4"
								>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium text-foreground">
											{row.qboDisplayName}
										</p>
										{row.qboEmail && (
											<p className="truncate text-xs text-muted-foreground">
												{row.qboEmail}
											</p>
										)}
									</div>
									<div className="flex shrink-0 items-center gap-1.5">
										<Select
											value={selected}
											onValueChange={(value) =>
												setPicked((current) => ({
													...current,
													[row.rowId]: value as string,
												}))
											}
										>
											<SelectTrigger
												className="w-44"
												aria-label={`Client for ${row.qboDisplayName}`}
											>
												<SelectValue placeholder="Choose client" />
											</SelectTrigger>
											<SelectContent>
												{row.candidates.map((candidate) => (
													<SelectItem
														key={candidate.clientId}
														value={candidate.clientId}
													>
														{candidate.companyName}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<Button
											size="sm"
											disabled={busy || !selected}
											onClick={() =>
												void runRowAction(
													row.rowId,
													() =>
														resolveImportRow({
															rowId: row.rowId,
															clientId: selected as Id<"clients">,
														}),
													"Couldn't link this customer",
												)
											}
										>
											Link
										</Button>
										<Button
											size="sm"
											variant="ghost"
											disabled={busy}
											onClick={() =>
												void runRowAction(
													row.rowId,
													() => skipImportRow({ rowId: row.rowId }),
													"Couldn't skip this customer",
												)
											}
										>
											Don&rsquo;t import
										</Button>
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</div>

			<DialogFooter>
				<DialogClose render={<Button variant="outline" />}>Close</DialogClose>
			</DialogFooter>
		</>
	);
}

function CompletedState({ run }: { run: ImportRun }) {
	return (
		<>
			<DialogHeader>
				<DialogTitle>Import your QuickBooks customers</DialogTitle>
			</DialogHeader>

			<div className="py-1">
				<div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
					<p className="text-sm font-medium text-foreground">Import complete</p>
					<StatLine>
						{run.autoLinked} linked, {run.imported} imported, {run.skipped}{" "}
						skipped
					</StatLine>
				</div>
			</div>

			<DialogFooter>
				<DialogClose render={<Button />}>Done</DialogClose>
			</DialogFooter>
		</>
	);
}
