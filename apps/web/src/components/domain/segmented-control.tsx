"use client";

import * as React from "react";
import {
	PILL_TAB_CONTAINER,
	PILL_TAB_SEGMENT_ACTIVE,
	PILL_TAB_SEGMENT_INACTIVE,
} from "@/components/shared/pill-tabs";
import { cn } from "@/lib/utils";

const SEGMENT_BASE =
	"inline-flex cursor-pointer items-center gap-2 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

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
	disabled?: boolean;
}

export function SegmentedControl<T extends string>({
	value,
	onValueChange,
	options,
	className,
	disabled = false,
}: SegmentedControlProps<T>) {
	return (
		<div role="group" className={cn(PILL_TAB_CONTAINER, "workspace-segments", className)}>
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					disabled={disabled}
					onClick={() => onValueChange(option.value)}
					aria-pressed={value === option.value}
					aria-label={option.ariaLabel}
					className={cn(
						SEGMENT_BASE,
						"disabled:cursor-not-allowed disabled:opacity-70",
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
