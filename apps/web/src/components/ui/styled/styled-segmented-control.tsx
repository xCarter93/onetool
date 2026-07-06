"use client";

import * as React from "react";
import { ButtonGroup } from "@/components/ui/button-group";
import { cn } from "@/lib/utils";

// rounded-full pills; ButtonGroup strips the inner edges so only the group ends stay round
const SEGMENT_BASE =
	"inline-flex cursor-pointer items-center gap-2 font-semibold transition-all duration-200 text-xs px-3 py-1.5 rounded-full ring-1 shadow-sm hover:shadow-md backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const SEGMENT_SELECTED =
	"text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/15 ring-primary/30 hover:ring-primary/40";

const SEGMENT_UNSELECTED =
	"text-muted-foreground hover:text-foreground bg-transparent hover:bg-muted ring-transparent hover:ring-border";

export interface StyledSegmentedControlOption<T extends string> {
	value: T;
	label?: React.ReactNode;
	icon?: React.ReactNode;
	/** Accessible name; required when the label is hidden or icon-only */
	ariaLabel?: string;
	/** Hide the text label below the sm breakpoint (icon stays visible) */
	hideLabelOnMobile?: boolean;
}

export interface StyledSegmentedControlProps<T extends string> {
	value: T;
	onValueChange: (value: T) => void;
	options: ReadonlyArray<StyledSegmentedControlOption<T>>;
	className?: string;
}

/**
 * Canonical segmented selector (view toggles, time-range filters).
 * One selected segment at a time; use plain ButtonGroup + Button for
 * action rows like prev/today/next.
 */
export function StyledSegmentedControl<T extends string>({
	value,
	onValueChange,
	options,
	className,
}: StyledSegmentedControlProps<T>) {
	return (
		<ButtonGroup className={className}>
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					onClick={() => onValueChange(option.value)}
					aria-pressed={value === option.value}
					aria-label={option.ariaLabel}
					className={cn(
						SEGMENT_BASE,
						value === option.value ? SEGMENT_SELECTED : SEGMENT_UNSELECTED
					)}
				>
					{option.icon}
					{option.label != null && (
						<span
							className={
								option.hideLabelOnMobile ? "hidden sm:inline" : undefined
							}
						>
							{option.label}
						</span>
					)}
				</button>
			))}
		</ButtonGroup>
	);
}
