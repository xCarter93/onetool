"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { Loader2, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { convexErrorMessage } from "@/lib/convex-error";
import {
	FutureSetupItem,
	FutureSetupSection,
	SetupErrorAlert,
} from "./future-setup-section";

type Template = {
	_id: Id<"projectSeriesQuoteTemplates">;
	sourceQuoteId: Id<"quotes">;
	title?: string;
	active: boolean;
	sourceAvailable: boolean;
	version: number;
};

export function FutureQuoteSetup({ projectId }: { projectId: Id<"projects"> }) {
	const { can, hasAllRecords } = usePermissions();
	const toast = useToast();
	const stopCopying = useMutation(api.projectSeriesQuotes.stop);
	const [selection, setSelection] = useState<{
		template: Template;
		revision: number;
	} | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const canView =
		can("projects") &&
		can("quotes") &&
		hasAllRecords("projects") &&
		hasAllRecords("quotes");
	const canModify =
		canView && can("projects", "modify") && can("quotes", "modify");
	const setup = useQuery(
		api.projectSeriesQuotes.getSetup,
		canView ? { projectId } : "skip",
	);
	const activeTemplates =
		setup?.templates.filter((template) => template.active) ?? [];

	if (!canView) return null;
	if (setup === undefined) return <Skeleton className="mb-5 h-20 w-full" />;
	if (!setup || activeTemplates.length === 0) return null;

	const closeDialog = () => {
		if (isSubmitting) return;
		setSelection(null);
		setError(null);
	};

	const reviewLatest = () => {
		if (!selection) return;
		const current = activeTemplates.find(
			(template) => template._id === selection.template._id,
		);
		if (!current) {
			closeDialog();
			return;
		}
		setSelection({ template: current, revision: setup.revision });
		setError(null);
	};

	const confirmStop = async () => {
		if (!selection || !setup.canStop || !canModify || error || isSubmitting)
			return;
		setIsSubmitting(true);
		setError(null);
		try {
			await stopCopying({
				templateId: selection.template._id,
				expectedRevision: selection.revision,
			});
			toast.success(
				"Copying stopped",
				"Existing quote copies remain unchanged.",
			);
			setSelection(null);
		} catch (nextError) {
			setError(
				convexErrorMessage(
					nextError,
					"Review the latest project changes and try again.",
				),
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<>
			<FutureSetupSection
				id="future-quote-setup-title"
				title="Future quote setup"
				description="These quote drafts are added to new projects in this series."
			>
				{activeTemplates.map((template) => {
					const title = template.title || "Untitled quote";
					return (
						<FutureSetupItem
							key={template._id}
							action={
								setup.canStop &&
								canModify && (
									<Button
										variant="ghost"
										size="sm"
										className="min-h-11"
										onClick={() => {
											setError(null);
											setSelection({ template, revision: setup.revision });
										}}
										aria-label={`Stop copying ${title} to future projects`}
									>
										<Square className="size-4" /> Stop copying
									</Button>
								)
							}
						>
							{template.sourceAvailable ? (
								<Link
									href={`/quotes/${template.sourceQuoteId}`}
									className="text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									{title}
								</Link>
							) : (
								<p className="truncate text-sm font-medium text-foreground">
									{title}
								</p>
							)}
							<div className="mt-1 flex flex-wrap items-center gap-2">
								<span className="text-xs text-muted-foreground tabular-nums">
									Source version {template.version}
								</span>
								{!template.sourceAvailable && (
									<Badge variant="outline" className="font-normal">
										Source quote deleted
									</Badge>
								)}
							</div>
						</FutureSetupItem>
					);
				})}
			</FutureSetupSection>

			<Dialog
				open={selection !== null}
				onOpenChange={(open) => !open && closeDialog()}
			>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>Stop copying this quote?</DialogTitle>
						<DialogDescription>
							New projects will no longer receive “
							{selection?.template.title || "this quote"}”. Existing quote
							copies stay unchanged.
						</DialogDescription>
					</DialogHeader>
					{error && <SetupErrorAlert message={error} onRetry={reviewLatest} />}
					<DialogFooter showCloseButton>
						<Button
							variant="destructive"
							className="min-h-11"
							disabled={
								!setup.canStop || !canModify || Boolean(error) || isSubmitting
							}
							onClick={() => void confirmStop()}
						>
							{isSubmitting && (
								<Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
							)}
							Stop copying
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
