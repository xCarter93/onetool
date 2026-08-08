"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyErrorMessage, logError } from "@/lib/error-logger";
import { formatRelativeTime } from "@/lib/notification-utils";
import { SectionHeading, SettingsCard } from "./settings-card";

const ENTITY_LABEL: Record<"client" | "invoice" | "payment" | "sku", string> = {
	client: "Client",
	invoice: "Invoice",
	payment: "Payment",
	sku: "Line item",
};

/**
 * Failed sync jobs with per-row Retry/Ignore and a bulk retry. Hidden entirely
 * when there is nothing wrong, so a healthy connection shows no chrome.
 */
export function QuickBooksSyncIssues() {
	const toast = useToast();
	const errors = useQuery(api.quickbooks.listSyncErrors);
	const retryJob = useMutation(api.quickbooks.retryJob);
	const ignoreJob = useMutation(api.quickbooks.ignoreJob);
	const retryAllFailed = useMutation(api.quickbooks.retryAllFailed);

	const [pending, setPending] = useState<Set<string>>(new Set());
	const [retryingAll, setRetryingAll] = useState(false);

	const runRowAction = useCallback(
		async (
			jobId: Id<"quickbooksSyncJobs">,
			action: () => Promise<null>,
			successTitle: string,
			successMessage: string,
			failureTitle: string,
		) => {
			setPending((current) => new Set(current).add(jobId));
			try {
				await action();
				toast.success(successTitle, successMessage);
			} catch (error) {
				logError(error, { action: "quickbooks_sync_issue_action" });
				toast.error(
					failureTitle,
					getUserFriendlyErrorMessage(error) ?? "Try again in a moment.",
				);
			} finally {
				setPending((current) => {
					const next = new Set(current);
					next.delete(jobId);
					return next;
				});
			}
		},
		[toast],
	);

	const handleRetryAll = useCallback(async () => {
		setRetryingAll(true);
		try {
			const { retried } = await retryAllFailed({});
			toast.success(
				"Retrying sync",
				`${retried} ${retried === 1 ? "item is" : "items are"} queued to sync again.`,
			);
		} catch (error) {
			logError(error, { action: "quickbooks_retry_all_failed" });
			toast.error(
				"Couldn't retry",
				getUserFriendlyErrorMessage(error) ?? "Try again in a moment.",
			);
		} finally {
			setRetryingAll(false);
		}
	}, [retryAllFailed, toast]);

	if (!errors || errors.length === 0) return null;

	return (
		<div className="space-y-3">
			<SectionHeading
				title="Sync issues"
				description="These records did not reach QuickBooks. Fix the cause in QuickBooks, then retry, or ignore an item to stop tracking it."
				aside={
					<Button
						variant="outline"
						size="sm"
						onClick={() => void handleRetryAll()}
						disabled={retryingAll}
					>
						{retryingAll ? "Retrying…" : "Retry all"}
					</Button>
				}
			/>

			<SettingsCard>
				<ul className="divide-y divide-border">
					{errors.map((row) => {
						const busy = pending.has(row._id);
						return (
							<li
								key={row._id}
								className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4"
							>
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-2">
										<Badge variant="secondary" radius="full" size="sm">
											{ENTITY_LABEL[row.entityType]}
										</Badge>
										<span className="truncate text-sm font-medium text-foreground">
											{row.entityLabel}
										</span>
									</div>
									<p
										className="mt-1 truncate text-xs text-muted-foreground"
										title={row.lastError ?? undefined}
									>
										{row.lastError ?? "QuickBooks rejected this record."}
									</p>
									<p className="mt-1 text-xs text-muted-foreground">
										{row.attempts} {row.attempts === 1 ? "attempt" : "attempts"}{" "}
										· failed {formatRelativeTime(row.failedAt)}
									</p>
								</div>
								<div className="flex shrink-0 items-center gap-1">
									<Button
										variant="outline"
										size="sm"
										disabled={busy}
										onClick={() =>
											void runRowAction(
												row._id,
												() => retryJob({ jobId: row._id }),
												"Retrying sync",
												`${row.entityLabel} is queued to sync again.`,
												"Couldn't retry",
											)
										}
									>
										Retry
									</Button>
									<Button
										variant="ghost"
										size="sm"
										disabled={busy}
										onClick={() =>
											void runRowAction(
												row._id,
												() => ignoreJob({ jobId: row._id }),
												"Issue ignored",
												`${row.entityLabel} will not sync automatically.`,
												"Couldn't ignore",
											)
										}
									>
										Ignore
									</Button>
								</div>
							</li>
						);
					})}
				</ul>
			</SettingsCard>
		</div>
	);
}
