"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Flag } from "lucide-react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";

import { api } from "@onetool/backend/convex/_generated/api";
import { Badge } from "@/components/reui/badge";
import {
	Frame,
	FrameDescription,
	FrameFooter,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyErrorMessage, logError } from "@/lib/error-logger";
import {
	planCounts,
	tabForRow,
	type FilterTab,
	type ImportRun,
} from "../utils/review-model";
import { QboFilterTabs } from "./qbo-filter-tabs";
import { QboRowList, type RowDecision } from "./qbo-row-list";
import { QboStepNav, type QboImportStep } from "./qbo-step-nav";
import { QboSummaryBar } from "./qbo-summary-bar";

const PAGE_SIZE = 50;

const UNDECIDED_MESSAGE =
	"Decide the customers under Needs review before importing.";

/** The backend throws `new ConvexError("undecided_ambiguous_rows")`. */
function isUndecidedError(error: unknown): boolean {
	const data = (error as { data?: unknown } | null)?.data;
	if (typeof data === "string" && data === "undecided_ambiguous_rows") {
		return true;
	}
	return (
		error instanceof Error && error.message.includes("undecided_ambiguous_rows")
	);
}

function stepForStatus(status: ImportRun["status"]): QboImportStep {
	if (status === "running") return "fetch";
	if (status === "completed") return "done";
	return "review";
}

export function QboImportReview({ run }: { run: ImportRun }) {
	const router = useRouter();
	const toast = useToast();
	const { confirm: confirmDialog } = useConfirmDialog();

	const [activeTab, setActiveTab] = useState<FilterTab>("all");
	const [pendingRowIds, setPendingRowIds] = useState<Set<string>>(new Set());
	const [committing, setCommitting] = useState(false);
	const [discarding, setDiscarding] = useState(false);

	const isReviewing = run.status === "reviewing";
	const isCommitting = run.status === "committing";
	const isCompleted = run.status === "completed";
	const isFetching = run.status === "running";

	const { results, status, loadMore } = usePaginatedQuery(
		api.quickbooksImport.listImportRows,
		isFetching ? "skip" : { runId: run._id },
		{ initialNumItems: PAGE_SIZE }
	);
	const clients = useQuery(api.clients.listNamesForOrg, {});

	const setRowDecision = useMutation(api.quickbooksImport.setRowDecision);
	const commitImportRun = useMutation(api.quickbooksImport.commitImportRun);
	const discardImportRun = useMutation(api.quickbooksImport.discardImportRun);

	const counts = useMemo(() => planCounts(run, results), [run, results]);

	const tabCounts = useMemo(() => {
		const next: Record<FilterTab, number> = {
			all: results.length,
			link: 0,
			import: 0,
			review: 0,
			sites: 0,
			skip: 0,
		};
		for (const row of results) {
			next[tabForRow(row)] += 1;
		}
		return next;
	}, [results]);

	const visibleRows = useMemo(
		() =>
			activeTab === "all"
				? results
				: results.filter((row) => tabForRow(row) === activeTab),
		[activeTab, results]
	);

	const handleDecide = useCallback(
		async ({ rowId, decision, clientId }: RowDecision) => {
			setPendingRowIds((current) => new Set(current).add(rowId));
			try {
				await setRowDecision({ rowId, decision, clientId });
			} catch (error) {
				logError(error, { action: "quickbooks_import_set_row_decision" });
				toast.error(
					"Couldn't update this customer",
					getUserFriendlyErrorMessage(error) ?? "Try again in a moment."
				);
			} finally {
				setPendingRowIds((current) => {
					const next = new Set(current);
					next.delete(rowId);
					return next;
				});
			}
		},
		[setRowDecision, toast]
	);

	const handleCommit = useCallback(async () => {
		setCommitting(true);
		try {
			await commitImportRun({});
		} catch (error) {
			if (isUndecidedError(error)) {
				setActiveTab("review");
				toast.error("Still to decide", UNDECIDED_MESSAGE);
			} else {
				logError(error, { action: "quickbooks_import_commit" });
				toast.error(
					"Couldn't start the import",
					getUserFriendlyErrorMessage(error) ?? "Try again in a moment."
				);
			}
		} finally {
			setCommitting(false);
		}
	}, [commitImportRun, toast]);

	const handleDiscard = useCallback(async () => {
		const confirmed = await confirmDialog({
			title: "Discard this import?",
			message: "Nothing has been created yet.",
			confirmLabel: "Discard",
			cancelLabel: "Keep reviewing",
			variant: "destructive",
		});
		if (!confirmed) return;

		setDiscarding(true);
		try {
			await discardImportRun({});
			toast.success("Import discarded", "Nothing was created.");
			router.push("/organization/profile?tab=integrations");
		} catch (error) {
			logError(error, { action: "quickbooks_import_discard" });
			toast.error(
				"Couldn't discard the import",
				getUserFriendlyErrorMessage(error) ?? "Try again in a moment."
			);
		} finally {
			setDiscarding(false);
		}
	}, [confirmDialog, discardImportRun, router, toast]);

	// Customers already mapped by an earlier run are counted in `link` for the
	// summary, but the commit never touches them, so they stay out of "Import N".
	const importableClients =
		Math.max(0, counts.link - run.autoLinked) + counts.import;
	const importableCount = importableClients + counts.sites;
	// "customers" until job sites join the plan, then the honest generic noun.
	const importNoun = counts.sites > 0 ? "item" : "customer";
	const undecidedCount = counts.review;

	const footerHint = isFetching
		? "Fetching your QuickBooks customers."
		: isCommitting
			? "Applying your import."
			: isCompleted
				? "Import complete."
				: "Nothing is created until you import.";

	const rightAction = (() => {
		if (isCompleted) {
			return (
				<Button onClick={() => router.push("/clients")}>Go to Clients</Button>
			);
		}
		if (isCommitting || committing) {
			return (
				<Button disabled>
					<Spinner className="size-4" />
					Importing...
				</Button>
			);
		}
		if (!isReviewing) return null;

		const label = `Import ${importableCount} ${importNoun}${importableCount !== 1 ? "s" : ""}`;
		if (undecidedCount > 0) {
			return (
				<Tooltip>
					<TooltipTrigger render={<span className="inline-flex" />}>
						<Button disabled>{label}</Button>
					</TooltipTrigger>
					<TooltipContent>{UNDECIDED_MESSAGE}</TooltipContent>
				</Tooltip>
			);
		}
		return (
			<Button onClick={() => void handleCommit()} disabled={importableCount === 0}>
				{label}
			</Button>
		);
	})();

	const body = (() => {
		if (isFetching) {
			return (
				<div className="flex flex-col items-center gap-2 py-12 text-center">
					<Spinner className="size-5 text-muted-foreground" />
					<p className="text-sm font-medium text-foreground">
						Fetching your QuickBooks customers
					</p>
					<p className="text-sm tabular-nums text-muted-foreground">
						{run.totalFetched} found so far
					</p>
					<p className="text-xs text-muted-foreground">
						You can leave this page. The fetch keeps running.
					</p>
				</div>
			);
		}

		if (isCompleted) {
			return (
				<div className="space-y-4">
					<QboSummaryBar
						totalFetched={run.totalFetched}
						results={{
							linked: run.autoLinked,
							imported: run.imported,
							sites: run.properties ?? 0,
							skipped: run.skipped,
						}}
					/>
					<p className="text-sm text-muted-foreground">
						Your QuickBooks customers are now in OneTool. Linked customers keep
						their existing client record.
					</p>
				</div>
			);
		}

		return (
			<div className="space-y-4">
				{isCommitting && (
					<div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5">
						<Spinner className="size-4 text-muted-foreground" />
						<p className="text-sm tabular-nums text-muted-foreground">
							{run.committedRows ?? 0} of {run.totalFetched} applied
						</p>
					</div>
				)}

				{/* The plan only holds still while reviewing: once the commit pass
				    starts it rewrites the run counters row by row, so progress is
				    the honest thing to show. */}
				{isReviewing && (
					<QboSummaryBar totalFetched={run.totalFetched} counts={counts} />
				)}

				<div className="flex flex-wrap items-center justify-between gap-3">
					<QboFilterTabs
						activeTab={activeTab}
						onTabChange={setActiveTab}
						counts={tabCounts}
					/>
					{results.length < run.totalFetched && (
						<span className="text-xs tabular-nums text-muted-foreground">
							{results.length} of {run.totalFetched} loaded
						</span>
					)}
				</div>

				{status === "LoadingFirstPage" ? (
					<div className="space-y-3 py-2">
						{[0, 1, 2, 3].map((index) => (
							<div key={index} className="flex items-center gap-4">
								<div className="min-w-0 flex-1 space-y-1.5">
									<Skeleton className="h-4 w-48" />
									<Skeleton className="h-3 w-32" />
								</div>
								<Skeleton className="h-6 w-24 rounded-full" />
								<Skeleton className="h-8 w-40" />
							</div>
						))}
					</div>
				) : visibleRows.length === 0 ? (
					<p className="py-8 text-center text-sm text-muted-foreground">
						No customers in this view.
					</p>
				) : (
					<QboRowList
						rows={visibleRows}
						clients={clients ?? []}
						pendingRowIds={pendingRowIds}
						readOnly={!isReviewing}
						onDecide={(decision) => void handleDecide(decision)}
					/>
				)}

				{status === "CanLoadMore" && (
					<div className="flex justify-center pt-1">
						<Button
							variant="outline"
							size="sm"
							onClick={() => loadMore(PAGE_SIZE)}
						>
							Load more
						</Button>
					</div>
				)}
				{status === "LoadingMore" && (
					<div className="flex justify-center pt-1">
						<Spinner className="size-4 text-muted-foreground" />
					</div>
				)}
			</div>
		);
	})();

	return (
		<div className="h-[calc(100dvh-7rem)] px-4 py-4 sm:px-6 sm:py-6">
			<div className="mx-auto h-full w-full max-w-7xl">
				<Frame variant="default" className="h-full w-full">
					<FrameHeader className="shrink-0 flex-row items-start justify-between gap-3">
						<div className="flex min-w-0 flex-col gap-px">
							<FrameTitle>Import from QuickBooks</FrameTitle>
							<FrameDescription className="truncate text-xs">
								Review what will happen before anything is created.
							</FrameDescription>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							<Badge variant="primary-light" size="lg" radius="full">
								Clients
							</Badge>
						</div>
					</FrameHeader>

					<FramePanel className="flex min-h-0 flex-col p-0 shadow-none!">
						<div className="shrink-0 px-5 py-5 sm:px-6">
							<QboStepNav currentStep={stepForStatus(run.status)} />
						</div>
						<Separator />
						<div className="flex-1 min-h-0 overflow-y-auto px-5 py-6 sm:px-6">
							{body}
						</div>
					</FramePanel>

					<FrameFooter className="shrink-0 flex-row items-center justify-between gap-3">
						<div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
							<Flag className="size-4 shrink-0" />
							<span className="truncate">{footerHint}</span>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							{isReviewing && (
								<Button
									variant="ghost"
									disabled={discarding || committing}
									onClick={() => void handleDiscard()}
								>
									Discard
								</Button>
							)}
							{rightAction}
						</div>
					</FrameFooter>
				</Frame>
			</div>
		</div>
	);
}
