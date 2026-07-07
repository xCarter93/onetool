"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { DotField } from "@/components/ui/dot-field";

// Dot texture that fades in from the top-right so headings stay legible.
const HEADER_TEXTURE =
	"text-muted-foreground opacity-[0.5] [mask-image:radial-gradient(75%_150%_at_100%_-10%,black,transparent_70%)] [-webkit-mask-image:radial-gradient(75%_150%_at_100%_-10%,black,transparent_70%)]";

/** Uppercase micro-label that captions a group of fields. */
export function Eyebrow({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}

/** The h2 + description that introduces a tab's content pane. */
export function SectionHeading({
	title,
	description,
	aside,
	className,
}: {
	title: React.ReactNode;
	description?: React.ReactNode;
	/** Rendered on the right of the heading (badge, count, action). */
	aside?: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				aside && "flex items-start justify-between gap-4",
				className,
			)}
		>
			<div>
				<h2 className="text-lg font-semibold tracking-tight">{title}</h2>
				{description && (
					<p className="mt-1 text-sm text-muted-foreground">{description}</p>
				)}
			</div>
			{aside && <div className="shrink-0">{aside}</div>}
		</div>
	);
}

/** Bordered card surface used for every group inside the settings shell. */
export function SettingsCard({
	tone = "default",
	className,
	...props
}: React.ComponentProps<"section"> & { tone?: "default" | "danger" }) {
	return (
		<section
			className={cn(
				"relative overflow-hidden rounded-xl border bg-card",
				tone === "danger"
					? "border-destructive/30 bg-destructive/[0.03]"
					: "border-border",
				className,
			)}
			{...props}
		/>
	);
}

/** Optional card header with an accent gradient wash + dot texture. */
export function SettingsCardHeader({
	gradient = false,
	texture = false,
	className,
	children,
	...props
}: React.ComponentProps<"div"> & { gradient?: boolean; texture?: boolean }) {
	return (
		<div
			className={cn(
				"relative px-[22px] py-5",
				gradient && "bg-linear-to-b from-primary/[0.06] to-transparent",
				className,
			)}
			{...props}
		>
			{texture && <DotField className={HEADER_TEXTURE} />}
			<div className="relative">{children}</div>
		</div>
	);
}

export function SettingsCardBody({
	className,
	...props
}: React.ComponentProps<"div">) {
	return <div className={cn("px-[22px] py-5", className)} {...props} />;
}

/** Muted footer strip — typically a hint on the left, Save on the right. */
export function SettingsCardFooter({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex flex-col gap-3 border-t border-border bg-muted px-[22px] py-3.5 sm:flex-row sm:items-center sm:justify-between",
				className,
			)}
			{...props}
		/>
	);
}
