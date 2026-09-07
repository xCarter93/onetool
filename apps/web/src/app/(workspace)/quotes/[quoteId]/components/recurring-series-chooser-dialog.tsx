"use client";

import type { ComponentType } from "react";
import { CopyPlus, FileSignature } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

function Choice({
	icon: Icon,
	title,
	description,
	recommended = false,
	onClick,
}: {
	icon: ComponentType<{ className?: string }>;
	title: string;
	description: string;
	recommended?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex w-full items-start gap-3 rounded-md border border-border p-3 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
		>
			<Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
			<span className="min-w-0">
				<span className="flex flex-wrap items-center gap-2">
					<span className="text-sm font-medium text-foreground">{title}</span>
					{recommended && <Badge variant="secondary">Recommended</Badge>}
				</span>
				<span className="mt-1 block text-sm text-muted-foreground">
					{description}
				</span>
			</span>
		</button>
	);
}

export function RecurringSeriesChooserDialog({
	open,
	onOpenChange,
	onSetUpAgreement,
	onCopyDrafts,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSetUpAgreement: () => void;
	onCopyDrafts: () => void;
}) {
	const choose = (next: () => void) => {
		onOpenChange(false);
		next();
	};
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Use this quote for the series</DialogTitle>
					<DialogDescription>
						Choose how future visits get this service and price.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-3">
					<Choice
						icon={FileSignature}
						title="Set up a recurring agreement"
						description="Your client approves once. Future visits inherit the approval and completed visits draft invoices automatically."
						recommended
						onClick={() => choose(onSetUpAgreement)}
					/>
					<Choice
						icon={CopyPlus}
						title="Copy drafts only"
						description="Each future visit gets its own draft quote to send and approve."
						onClick={() => choose(onCopyDrafts)}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
