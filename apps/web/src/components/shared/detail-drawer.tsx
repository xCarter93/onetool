"use client";

import * as React from "react";

import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export interface DetailDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Small identifier shown above the title, e.g. "Project #P-1024". */
	eyebrow?: React.ReactNode;
	/** Accent icon rendered beside the title. */
	icon?: React.ReactNode;
	title: React.ReactNode;
	/** Status badge shown after the title. */
	badge?: React.ReactNode;
	/** One-line context under the title. */
	description?: React.ReactNode;
	/** Quick-action row under the header. */
	actions?: React.ReactNode;
	/** Body — compose with DrawerSection. */
	children: React.ReactNode;
}

/**
 * Right-side detail drawer: an inset floating Sheet used for record previews
 * on the workspace list pages. The header (eyebrow + title + badge + actions)
 * stays fixed while the body scrolls. Compose the body with DrawerSection.
 */
export function DetailDrawer({
	open,
	onOpenChange,
	eyebrow,
	icon,
	title,
	badge,
	description,
	actions,
	children,
}: DetailDrawerProps) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="bg-popover inset-y-4 right-4 left-auto flex h-[calc(100svh-2rem)] w-[min(40rem,calc(100vw-2rem))] max-w-none sm:max-w-none flex-col gap-0 overflow-hidden rounded-xl border p-0"
			>
				<SheetHeader className="shrink-0 gap-0 border-b p-0">
					{eyebrow ? (
						<div className="text-muted-foreground px-5 pt-4 text-xs font-medium">
							{eyebrow}
						</div>
					) : null}
					<div className="flex flex-col gap-2 px-5 pb-4 pt-2">
						<div className="flex min-w-0 items-center gap-2 pr-8">
							{icon}
							<SheetTitle className="min-w-0 flex-1 truncate text-lg">
								{title}
							</SheetTitle>
							{badge}
						</div>
						{description ? (
							<SheetDescription className="truncate">
								{description}
							</SheetDescription>
						) : (
							<SheetDescription className="sr-only">
								Record details
							</SheetDescription>
						)}
						{actions ? (
							<div className="flex flex-wrap items-center gap-2 pt-1">
								{actions}
							</div>
						) : null}
					</div>
				</SheetHeader>
				<div className="min-h-0 flex-1">
					<ScrollArea className="h-full">
						<div className="divide-border divide-y">{children}</div>
					</ScrollArea>
				</div>
			</SheetContent>
		</Sheet>
	);
}

export interface DrawerSectionProps {
	/** Uppercase muted section label. */
	label?: React.ReactNode;
	/** Optional control aligned to the right of the label row. */
	action?: React.ReactNode;
	className?: string;
	children: React.ReactNode;
}

/** A titled block inside a DetailDrawer body. */
export function DrawerSection({
	label,
	action,
	className,
	children,
}: DrawerSectionProps) {
	return (
		<section className={cn("flex flex-col gap-3 px-5 py-4", className)}>
			{label || action ? (
				<div className="flex items-center justify-between gap-2">
					{label ? (
						<h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
							{label}
						</h3>
					) : (
						<span />
					)}
					{action}
				</div>
			) : null}
			{children}
		</section>
	);
}

/** Two-column label/value grid for a DrawerSection. */
export function DrawerFieldGrid({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<dl
			className={cn(
				"grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-2.5 text-sm",
				className,
			)}
		>
			{children}
		</dl>
	);
}

/** A single label/value row; render inside DrawerFieldGrid. */
export function DrawerField({
	label,
	children,
}: {
	label: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<>
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="text-foreground min-w-0 break-words">{children}</dd>
		</>
	);
}

export function formatActivityTime(ts: number): string {
	return new Date(ts).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

export function DrawerSkeleton() {
	return (
		<div className="flex flex-col gap-5 p-5">
			{[0, 1, 2, 3].map((i) => (
				<div key={i} className="flex flex-col gap-2">
					<div className="bg-muted h-3 w-24 animate-pulse rounded" />
					<div className="bg-muted h-8 w-full animate-pulse rounded" />
				</div>
			))}
		</div>
	);
}

export function RelatedRow({
	icon,
	label,
	count,
	value,
	valueLabel,
}: {
	icon: React.ReactNode;
	label: string;
	count: number;
	value: string;
	valueLabel?: string;
}) {
	return (
		<div className="flex items-center justify-between gap-3">
			<div className="flex items-center gap-2.5">
				<span className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-md">
					{icon}
				</span>
				<div className="flex flex-col">
					<span className="text-foreground text-sm font-medium">{label}</span>
					<span className="text-muted-foreground text-xs">{count} total</span>
				</div>
			</div>
			<div className="flex flex-col items-end">
				<span className="text-foreground text-sm font-medium tabular-nums">
					{value}
				</span>
				{valueLabel ? (
					<span className="text-muted-foreground text-xs">{valueLabel}</span>
				) : null}
			</div>
		</div>
	);
}
