"use client";

import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const PILL_TAB_CONTAINER =
	"inline-flex w-fit items-center gap-0.5 rounded-sm border border-border bg-muted p-0.5";

export const PILL_TAB_SEGMENT_ACTIVE =
	"rounded-sm border border-border bg-background text-primary shadow-none";

export const PILL_TAB_SEGMENT_INACTIVE =
	"rounded-sm border border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground";

export function PillTabs({
	className,
	...props
}: React.ComponentProps<typeof Tabs>) {
	return <Tabs className={cn("w-full", className)} {...props} />;
}

export function PillTabsList({
	className,
	...props
}: React.ComponentProps<typeof TabsList>) {
	return (
		<TabsList
			className={cn(PILL_TAB_CONTAINER, "workspace-record-tabs gap-0", className)}
			{...props}
		/>
	);
}

export function PillTabsTrigger({
	className,
	...props
}: React.ComponentProps<typeof TabsTrigger>) {
	return (
		<TabsTrigger
			className={cn(
				"rounded-sm px-3 py-1.5 font-medium transition-colors duration-150",
				"data-active:border-border data-active:bg-background data-active:text-primary data-active:shadow-none",
				"hover:bg-background/70 hover:text-foreground data-active:hover:bg-background data-active:hover:text-primary",
				className
			)}
			{...props}
		/>
	);
}

export function PillTabsContent({
	className,
	...props
}: React.ComponentProps<typeof TabsContent>) {
	return (
		<TabsContent
			className={cn(
				"mt-6",
				className
			)}
			{...props}
		/>
	);
}
