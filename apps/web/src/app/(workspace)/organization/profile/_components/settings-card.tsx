"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

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

export function SectionHeading({
	title,
	description,
	aside,
	className,
}: {
	title: React.ReactNode;
	description?: React.ReactNode;
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

export function SettingsCard({
	tone = "default",
	className,
	...props
}: React.ComponentProps<"section"> & { tone?: "default" | "danger" }) {
	return (
		<section
			className={cn(
				"relative overflow-hidden rounded-lg border bg-card",
				tone === "danger"
					? "border-destructive/30 bg-destructive/[0.03]"
					: "border-border",
				className,
			)}
			{...props}
		/>
	);
}

export function SettingsCardHeader({
	gradient = false,
	className,
	children,
	...props
}: React.ComponentProps<"div"> & { gradient?: boolean }) {
	return (
		<div
			className={cn(
				"relative px-6 py-5",
				gradient && "bg-muted/40",
				className,
			)}
			{...props}
		>
			<div className="relative">{children}</div>
		</div>
	);
}

export function SettingsCardBody({
	className,
	...props
}: React.ComponentProps<"div">) {
	return <div className={cn("px-6 py-5", className)} {...props} />;
}

export function SettingsCardFooter({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex flex-col gap-3 border-t border-border bg-muted px-6 py-3.5 sm:flex-row sm:items-center sm:justify-between",
				className,
			)}
			{...props}
		/>
	);
}
