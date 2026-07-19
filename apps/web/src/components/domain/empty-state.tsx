"use client";

import * as React from "react";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { Illustration } from "@/components/illustrations";
import type {
	IllustrationName,
	IllustrationSize,
} from "@/components/illustrations";

export interface EmptyStateProps {
	icon?: React.ReactNode;
	/**
	 * Preferred over `icon`. Renders in its own media slot that skips the icon
	 * size clamp, so the artwork keeps its own canvas width.
	 */
	illustration?: IllustrationName;
	/** Defaults to sm for size="sm" and md for size="md". */
	illustrationSize?: IllustrationSize;
	title: React.ReactNode;
	description?: React.ReactNode;
	/** Optional CTA rendered under the description */
	action?: React.ReactNode;
	/**
	 * sm: compact inline slot (feed panels, popovers, sidebars) — no border,
	 * tight spacing. md: larger panel-level empty state.
	 */
	size?: "sm" | "md";
	className?: string;
}

/**
 * Canonical empty state. Composes ui/empty; replaces hand-rolled
 * "icon + title + subtext" blocks so all surfaces share one treatment.
 */
export function EmptyState({
	icon,
	illustration,
	illustrationSize,
	title,
	description,
	action,
	size = "sm",
	className,
}: EmptyStateProps) {
	const compact = size === "sm";
	const resolvedIllustrationSize: IllustrationSize =
		illustrationSize ?? (compact ? "sm" : "md");
	return (
		<Empty
			className={cn(
				"border-0",
				compact ? "gap-0 p-4 md:p-4 min-h-32" : "gap-2 p-6 md:p-8",
				className
			)}
		>
			<EmptyHeader className={compact ? "gap-0.5" : undefined}>
				{illustration != null ? (
					<EmptyMedia className={compact ? "mb-2" : "mb-4"}>
						<Illustration
							name={illustration}
							size={resolvedIllustrationSize}
						/>
					</EmptyMedia>
				) : (
					icon != null && (
						<EmptyMedia
							className={cn(
								"text-muted-foreground",
								compact
									? "mb-1 [&_svg:not([class*='size-'])]:size-6"
									: "mb-2 [&_svg:not([class*='size-'])]:size-8"
							)}
						>
							{icon}
						</EmptyMedia>
					)
				)}
				<EmptyTitle
					className={cn(
						"text-muted-foreground",
						compact ? "text-sm font-semibold" : "text-base font-semibold"
					)}
				>
					{title}
				</EmptyTitle>
				{description != null && (
					<EmptyDescription className={compact ? "text-xs" : undefined}>
						{description}
					</EmptyDescription>
				)}
			</EmptyHeader>
			{action != null && <div className={compact ? "mt-3" : "mt-4"}>{action}</div>}
		</Empty>
	);
}
