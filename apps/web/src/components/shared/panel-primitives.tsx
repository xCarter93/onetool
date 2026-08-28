"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/**
 * Shared side-panel building blocks (Attio-style anatomy): a titled section
 * ("Inputs", "Next step") and a labeled field row with optional helper text.
 * Builder config panels compose these so the panels read as one surface.
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
