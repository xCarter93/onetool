"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";

function Popover({
	...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
	return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
	...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
	return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
	className,
	align = "center",
	sideOffset = 4,
	...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
	return (
		<PopoverPrimitive.Portal>
			<PopoverPrimitive.Content
				data-slot="popover-content"
				align={align}
				sideOffset={sideOffset}
				className={cn(
					"bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-72 origin-[var(--radix-popover-content-transform-origin)] rounded-md border p-4 shadow-md outline-hidden",
					className
				)}
				{...props}
			/>
		</PopoverPrimitive.Portal>
	);
}

function PopoverAnchor({
	...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
	return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

/**
 * Bordered-square nubbin (rotated 45°, half-tucked under the panel) matching
 * the landing navbar flyout's arrow — the north-star nubbin style. Radix
 * rotates the arrow container per side, so the exposed border-b/border-r
 * corner always points at the anchor.
 */
function PopoverArrow({
	className,
	...props
}: React.ComponentProps<typeof PopoverPrimitive.Arrow>) {
	return (
		<PopoverPrimitive.Arrow
			data-slot="popover-arrow"
			width={12}
			height={6}
			asChild
			{...props}
		>
			<span
				className={cn(
					"block h-3 w-3 -translate-y-1/2 rotate-45 rounded-[2px] border-b border-r border-border bg-popover",
					className
				)}
			/>
		</PopoverPrimitive.Arrow>
	);
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor, PopoverArrow };
