"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThemeCardProps {
	id: string;
	label: string;
	description: string;
	isSelected: boolean;
	onSelect: () => void;
}

/**
 * Mini-mockup bar/block styles keyed by theme.
 * Each entry produces a visually distinct thumbnail
 * so the business owner can tell themes apart at a glance.
 */
const THEME_MOCKUP_STYLES: Record<
	string,
	{
		trustBar: string;
		heading: string;
		bodyLines: string;
		cta: string;
	}
> = {
	"clean-professional": {
		trustBar: "bg-muted/40 border-b border-border/40",
		heading: "bg-fg/80 h-2.5 w-24 rounded-sm",
		bodyLines: "bg-muted-fg/20",
		cta: "bg-primary/70 h-3 w-16 rounded-sm",
	},
	"bold-expressive": {
		trustBar: "bg-primary/10 border-b-2 border-primary/30",
		heading: "bg-fg/90 h-3 w-28 rounded-sm",
		bodyLines: "bg-muted-fg/25",
		cta: "bg-primary h-3.5 w-20 rounded-sm",
	},
	"warm-approachable": {
		trustBar:
			"bg-amber-100/60 dark:bg-amber-950/30 border-b border-amber-200/50 dark:border-amber-800/30",
		heading: "bg-fg/70 h-2.5 w-20 rounded-full",
		bodyLines: "bg-muted-fg/15",
		cta: "bg-primary/60 h-3 w-18 rounded-full",
	},
};

export function ThemeCard({
	id,
	label,
	description,
	isSelected,
	onSelect,
}: ThemeCardProps) {
	const mockup = THEME_MOCKUP_STYLES[id] ?? THEME_MOCKUP_STYLES["clean-professional"];

	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"relative w-full text-left rounded-xl border-2 p-4 transition-all duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
				isSelected
					? "border-primary ring-2 ring-primary/20 shadow-sm"
					: "border-border hover:border-border/80",
			)}
		>
			{/* Selected indicator */}
			{isSelected && (
				<span className="absolute top-2.5 right-2.5 flex items-center justify-center size-5 rounded-full bg-primary text-white">
					<Check className="size-3" />
				</span>
			)}

			{/* Mini mockup */}
			<div className="rounded-lg border border-border/40 bg-background overflow-hidden">
				{/* Trust bar mockup */}
				<div className={cn("h-4 px-2 flex items-center gap-1.5", mockup.trustBar)}>
					<div className="size-1.5 rounded-full bg-muted-fg/30" />
					<div className="h-1 w-8 rounded-full bg-muted-fg/25" />
					<div className="size-1.5 rounded-full bg-muted-fg/30" />
					<div className="h-1 w-6 rounded-full bg-muted-fg/25" />
				</div>

				{/* Content mockup */}
				<div className="p-3 space-y-2.5">
					{/* Heading */}
					<div className={mockup.heading} />

					{/* Body lines */}
					<div className="space-y-1.5">
						<div className={cn("h-1.5 w-full rounded-sm", mockup.bodyLines)} />
						<div className={cn("h-1.5 w-4/5 rounded-sm", mockup.bodyLines)} />
						<div className={cn("h-1.5 w-3/5 rounded-sm", mockup.bodyLines)} />
					</div>

					{/* CTA */}
					<div className={mockup.cta} />
				</div>
			</div>

			{/* Label and description */}
			<h3 className="text-sm font-bold text-fg mt-3">{label}</h3>
			<p className="text-xs text-muted-fg mt-1">{description}</p>
		</button>
	);
}
