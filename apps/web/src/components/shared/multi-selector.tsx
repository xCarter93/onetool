"use client";

import * as React from "react";
import { MultiSelect } from "@/components/ui/multi-selector";
import { cn } from "@/lib/utils";

/**
 * MultiSelector - A wrapper around the base MultiSelect component with consistent styling
 * that matches the application's design system
 */

interface MultiSelectorProps {
	/**
	 * An array of option objects to be displayed in the multi-select component.
	 */
	options: {
		/** The text to display for the option. */
		label: string;
		/** The unique value associated with the option. */
		value: string;
		/** Optional icon component to display alongside the option. */
		icon?: React.ComponentType<{ className?: string }>;
		/** Whether this option is disabled */
		disable?: boolean;
	}[];

	/**
	 * Callback function triggered when the selected values change.
	 */
	onValueChange: (value: string[]) => void;

	/** The current selected values (controlled) */
	value?: string[];

	/** The default selected values when the component mounts (uncontrolled). */
	defaultValue?: string[];

	/**
	 * Placeholder text to be displayed when no values are selected.
	 */
	placeholder?: string;

	/**
	 * Maximum number of items to display. Extra selected items will be summarized.
	 */
	maxCount?: number;

	/**
	 * Additional class names to apply custom styles to the multi-select component.
	 */
	className?: string;

	/**
	 * Class names for the popover content
	 */
	popoverClass?: string;

	/**
	 * Whether to show all selected items or truncate with maxCount
	 */
	showall?: boolean;

	/**
	 * Whether the selector is disabled
	 */
	disabled?: boolean;
}

export const MultiSelector = React.forwardRef<
	HTMLButtonElement,
	MultiSelectorProps
>(
	(
		{
			options,
			onValueChange,
			value,
			defaultValue = [],
			placeholder = "Select options",
			maxCount = 3,
			className,
			popoverClass,
			showall = false,
			disabled = false,
			...props
		},
		ref
	) => {
		// Use the value prop if provided (controlled), otherwise use defaultValue
		const actualValue = value !== undefined ? value : defaultValue;

		return (
			<MultiSelect
				key={JSON.stringify(actualValue)} // Force re-render when value changes
				ref={ref}
				options={options}
				onValueChange={onValueChange}
				defaultValue={actualValue}
				placeholder={placeholder}
				maxCount={maxCount}
				className={cn(
					"transition-all duration-200 border-gray-200/60 dark:border-white/10 hover:border-primary/30 dark:hover:border-primary/30",
					disabled && "cursor-not-allowed disabled:opacity-100", // Override base button opacity
					className
				)}
				popoverClass={cn(
					"backdrop-blur-md bg-background/95 dark:bg-background/95",
					popoverClass
				)}
				showall={showall}
				modalPopover={false}
				animation={0}
				disabled={disabled}
				{...props}
			/>
		);
	}
);

MultiSelector.displayName = "MultiSelector";
