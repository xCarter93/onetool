"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface CreateRecordDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Fires once the open/close animation has finished. */
	onOpenChangeComplete?: (open: boolean) => void;
	title: string;
	description?: string;
	submitLabel: string;
	submittingLabel?: string;
	isSubmitting?: boolean;
	/** Disables submit while upstream data (e.g. the client list) is still loading. */
	canSubmit?: boolean;
	onSubmit: () => void | Promise<void>;
	children: React.ReactNode;
	className?: string;
}

// Keep form actions reachable while the fields scroll.
export function CreateRecordDialog({
	open,
	onOpenChange,
	onOpenChangeComplete,
	title,
	description,
	submitLabel,
	submittingLabel = "Creating…",
	isSubmitting = false,
	canSubmit = true,
	onSubmit,
	children,
	className,
}: CreateRecordDialogProps) {
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				// Swallows Esc and backdrop dismissal while a create is in flight.
				if (isSubmitting) return;
				onOpenChange(next);
			}}
			onOpenChangeComplete={onOpenChangeComplete}
		>
			<DialogContent
				className={cn(
					"workspace-record-form flex max-h-[min(90dvh,48rem)] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0",
					className
				)}
			>
				<DialogHeader className="gap-1 border-b border-border bg-muted px-6 py-4">
					<DialogTitle>{title}</DialogTitle>
					{description ? (
						<DialogDescription>{description}</DialogDescription>
					) : null}
				</DialogHeader>

				<form
					noValidate
					onSubmit={(event) => {
						event.preventDefault();
						void onSubmit();
					}}
					className="flex min-h-0 flex-1 flex-col"
				>

					<div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-6 py-5 [&_[data-slot=field-legend]]:mb-4 [&_[data-slot=field-legend]]:text-lg [&_[data-slot=field-legend]]:font-semibold [&_[data-slot=field-legend]]:tracking-tight">
						{children}
					</div>

					{/* Cancel the default footer bleed because this dialog has no padding. */}
					<DialogFooter className="m-0 rounded-none border-t border-border px-6 py-4">
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isSubmitting || !canSubmit}>
							{isSubmitting ? (
								<>
									<Spinner />
									{submittingLabel}
								</>
							) : (
								submitLabel
							)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
