"use client";

import * as React from "react";
import {
	PILL_TAB_CONTAINER,
	PILL_TAB_SEGMENT_ACTIVE,
	PILL_TAB_SEGMENT_INACTIVE,
} from "@/components/shared/pill-tabs";
import { cn } from "@/lib/utils";

const SEGMENT_BASE =
	"inline-flex cursor-pointer items-center gap-2 font-medium transition-all duration-200 text-xs px-3 py-1.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export interface SegmentedControlOption<T extends string> {
	value: T;
	label?: React.ReactNode;
	icon?: React.ReactNode;
	/** Accessible name; required when the label is hidden or icon-only */
	ariaLabel?: string;
	/** Hide the text label below the sm breakpoint (icon stays visible) */
	hideLabelOnMobile?: boolean;
}

export interface SegmentedControlProps<T extends string> {
	value: T;
	onValueChange: (value: T) => void;
	options: ReadonlyArray<SegmentedControlOption<T>>;
	className?: string;
}

/**
 * Canonical segmented selector (view toggles, time-range filters).
 * One selected segment at a time, rendered in the shared PillTabs shell so
 * every tab-like control matches; use plain ButtonGroup + Button for
 * action rows like prev/today/next.
 */
export function SegmentedControl<T extends string>({
	value,
	onValueChange,
	options,
	className,
}: SegmentedControlProps<T>) {
	return (
		<div role="group" className={cn(PILL_TAB_CONTAINER, className)}>
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					onClick={() => onValueChange(option.value)}
					aria-pressed={value === option.value}
					aria-label={option.ariaLabel}
					className={cn(
						SEGMENT_BASE,
						value === option.value
							? PILL_TAB_SEGMENT_ACTIVE
							: PILL_TAB_SEGMENT_INACTIVE
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
		</div>
	);
}
