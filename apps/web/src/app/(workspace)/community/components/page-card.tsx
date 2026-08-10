"use client";

import * as React from "react";
import Link from "next/link";
import { Copy, Check, QrCode } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/domain/status-badge";
import { DotField } from "@/components/ui/dot-field";
import { cn } from "@/lib/utils";

export interface SetupStep {
	id: string;
	/** Imperative and specific: "Add 3 photos of recent work", not "Gallery". */
	label: string;
}

interface PageCardProps {
	displayTitle: string;
	pagePath: string;
	isLive: boolean;
	bannerUrl?: string | null;
	avatarUrl?: string | null;
	/** Town line under the name, derived from the org address. */
	locationLine?: string;
	galleryCount: number;
	/** Which of the three layouts the page renders, e.g. "Storefront". */
	layoutLabel: string;
	remainingSteps: SetupStep[];
	completedCount: number;
	totalSteps: number;
	copied: boolean;
	onCopy: () => void;
	onShare: () => void;
}

/**
 * The page itself, as an object you can act on: what it looks like, whether it
 * is live, how to hand it out, and what is still missing from it.
 */
export function PageCard({
	displayTitle,
	pagePath,
	isLive,
	bannerUrl,
	avatarUrl,
	locationLine,
	galleryCount,
	layoutLabel,
	remainingSteps,
	completedCount,
	totalSteps,
	copied,
	onCopy,
	onShare,
}: PageCardProps) {
	return (
		<div className="self-start rounded-xl border border-border bg-muted/40 p-[3px]">
			{/* Miniature of the live page */}
			<div className="overflow-hidden rounded-lg bg-background" aria-hidden="true">
				<div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-3 py-2">
					<div className="flex gap-1.5">
						<span className="size-2 rounded-full bg-border" />
						<span className="size-2 rounded-full bg-border" />
						<span className="size-2 rounded-full bg-border" />
					</div>
					<div className="ml-1 flex-1 truncate rounded-md border border-border/60 bg-background px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
						onetool.biz<span className="text-foreground">{pagePath}</span>
					</div>
				</div>

				<div className="relative h-16">
					{bannerUrl ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img src={bannerUrl} alt="" className="size-full object-cover" />
					) : (
						<DotField className="text-primary opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
					)}
				</div>

				<div className="px-4 pb-4">
					<div className="-mt-5 flex size-10 items-center justify-center overflow-hidden rounded-lg border-4 border-background bg-primary/15 text-sm font-bold text-primary">
						{avatarUrl ? (
							// eslint-disable-next-line @next/next/no-img-element
							<img src={avatarUrl} alt="" className="size-full object-cover" />
						) : (
							displayTitle.charAt(0).toUpperCase()
						)}
					</div>
					<p className="mt-2 truncate text-sm font-bold tracking-tight text-foreground">
						{displayTitle}
					</p>
					{locationLine && (
						<p className="mt-0.5 truncate text-[11px] text-muted-foreground">
							{locationLine}
						</p>
					)}
					<div className="mt-3 grid grid-cols-3 gap-1.5">
						{/* Always three slots: the shape of the row is the point. */}
						{Array.from({ length: 3 }).map((_, index) => (
							<div
								key={index}
								className={cn(
									"aspect-4/3 rounded-md",
									index < galleryCount ? "bg-primary/15" : "bg-muted"
								)}
							/>
						))}
					</div>
				</div>
			</div>

			{/* Status + hand-out actions */}
			<div className="mt-[3px] rounded-lg bg-background p-3">
				<div className="flex items-center justify-between gap-3">
					{isLive ? (
						<StatusBadge role="success" appearance="soft" className="gap-1.5">
							<span className="size-2 rounded-full bg-success" />
							Live
						</StatusBadge>
					) : (
						<StatusBadge role="warning" appearance="soft">
							Draft
						</StatusBadge>
					)}
					<Link
						href="/community/edit#design"
						className="text-xs text-muted-foreground hover:text-foreground hover:underline"
					>
						{layoutLabel} layout
					</Link>
				</div>
				{isLive ? (
					<div className="mt-2.5 grid grid-cols-2 gap-2">
						<Button variant="outline" size="sm" onClick={onCopy}>
							{copied ? (
								<Check className="size-4 mr-1.5 text-success" />
							) : (
								<Copy className="size-4 mr-1.5" />
							)}
							Copy link
						</Button>
						<Button variant="outline" size="sm" onClick={onShare}>
							<QrCode className="size-4 mr-1.5" />
							Share
						</Button>
					</div>
				) : (
					<p className="mt-2.5 text-xs text-muted-foreground">
						Publish the page before you hand the link out. Until then the
						address is not reachable.
					</p>
				)}
			</div>

			{/* What is still missing */}
			{remainingSteps.length > 0 && (
				<div className="mt-[3px] rounded-lg bg-background p-4">
					<div className="flex items-center justify-between gap-3">
						<h2 className="text-sm font-semibold text-foreground">
							Finish your page
						</h2>
						<span className="text-xs tabular-nums text-muted-foreground">
							{completedCount} of {totalSteps}
						</span>
					</div>
					<ul className="mt-2.5 space-y-1">
						{remainingSteps.slice(0, 3).map((step) => (
							<li key={step.id}>
								<Link
									href={`/community/edit#${step.id}`}
									className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 -mx-2 text-sm text-foreground transition-colors hover:bg-accent/50"
								>
									<span className="min-w-0 truncate">{step.label}</span>
									<span className="shrink-0 text-xs font-medium text-primary">
										Add
									</span>
								</Link>
							</li>
						))}
					</ul>
					<p className="mt-2 text-xs text-muted-foreground">
						Pages with photos and a bio give visitors something to judge you on
						before they call.
					</p>
				</div>
			)}
		</div>
	);
}
