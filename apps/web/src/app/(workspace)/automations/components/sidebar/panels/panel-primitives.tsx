"use client";

import React from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/**
 * Shared side-panel building blocks (Attio-style anatomy): a titled section
 * ("Inputs", "Next step"), a labeled field row with optional helper text,
 * and the destructive footer action. Every config panel composes these so
 * the panels read as one surface.
 */

export function PanelSection({
	title,
	children,
	className,
}: {
	title?: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<section className={cn("py-4", className)}>
			{title && (
				<h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
					{title}
				</h4>
			)}
			<div className="space-y-4">{children}</div>
		</section>
	);
}

export function PanelField({
	label,
	helper,
	error,
	children,
}: {
	label: string;
	helper?: string;
	/** Inline per-field error; shown in place of the helper when present. */
	error?: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<Label className="text-sm font-medium">{label}</Label>
			<div className="mt-1.5">{children}</div>
			{error ? (
				<p className="text-xs text-destructive mt-1.5">{error}</p>
			) : (
				helper && (
					<p className="text-xs text-muted-foreground mt-1.5">{helper}</p>
				)
			)}
		</div>
	);
}

export function DeleteStepButton({
	label = "Delete step",
	onDelete,
}: {
	label?: string;
	onDelete: () => void;
}) {
	return (
		<div className="pt-4 border-t border-border mt-2">
			<button
				type="button"
				className="text-destructive hover:bg-destructive/10 focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none flex items-center gap-2 px-3 py-2 rounded-md transition-colors w-full cursor-pointer"
				onClick={onDelete}
			>
				<Trash2 className="h-4 w-4" />
				<span className="text-sm font-medium">{label}</span>
			</button>
		</div>
	);
}
