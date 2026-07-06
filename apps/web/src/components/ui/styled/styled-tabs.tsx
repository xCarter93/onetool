"use client";

import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * StyledTabs - A wrapper around the base Tabs component with consistent styling
 * that matches the app's design system (similar to StyledButton and Badge)
 */
export function StyledTabs({
	className,
	...props
}: React.ComponentProps<typeof Tabs>) {
	return <Tabs className={cn("w-full", className)} {...props} />;
}

export function StyledTabsList({
	className,
	...props
}: React.ComponentProps<typeof TabsList>) {
	return (
		<TabsList
			className={cn(
				"bg-background/80 dark:bg-background/60",
				"ring-1 ring-border/40 dark:ring-border/30",
				"backdrop-blur-sm",
				"shadow-sm",
				// Pill shape per ReUI maia tabs recipe (rounded-4xl list / rounded-xl triggers)
				"p-[3px] gap-0 rounded-full",
				className
			)}
			{...props}
		/>
	);
}

export function StyledTabsTrigger({
	className,
	...props
}: React.ComponentProps<typeof TabsTrigger>) {
	return (
		<TabsTrigger
			className={cn(
				// Smooth transitions
				"transition-all duration-200",
				// Active state - clean and prominent
				"data-[state=active]:bg-primary/10 dark:data-[state=active]:bg-primary/20",
				"data-[state=active]:text-primary dark:data-[state=active]:text-primary-foreground",
				"data-[state=active]:ring-1 data-[state=active]:ring-primary/30 dark:data-[state=active]:ring-primary/40",
				"data-[state=active]:shadow-sm",
				// Hover state
				"hover:bg-accent/30 hover:text-accent-foreground",
				// Font styling
				"font-medium",
				// Tighter padding for button group feel
				"px-3 py-1.5 rounded-full",
				className
			)}
			{...props}
		/>
	);
}

export function StyledTabsContent({
	className,
	...props
}: React.ComponentProps<typeof TabsContent>) {
	return (
		<TabsContent
			className={cn(
				// Smooth content transition
				"mt-6 animate-in fade-in-50 duration-200",
				className
			)}
			{...props}
		/>
	);
}
