"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemMedia,
	ItemTitle,
} from "@/components/ui/item";
import { EmptyState } from "@/components/domain/empty-state";
import { StatusBadge } from "@/components/domain/status-badge";
import { cn } from "@/lib/utils";

export interface RelatedRecordItem {
	id: string;
	title: React.ReactNode;
	/** Secondary line under the title (date, amount, …). */
	meta?: React.ReactNode;
	/** Domain status string → canonical StatusBadge. */
	status?: string;
	href?: string;
	/** Row icon; defaults to the section icon. */
	icon?: LucideIcon;
}

export interface RelatedRecordSection {
	title: string;
	icon: LucideIcon;
	items: RelatedRecordItem[];
	/** Empty-state title; defaults to "No <title> yet". */
	emptyLabel?: string;
}

const COLS: Record<number, string> = {
	1: "",
	2: "md:grid-cols-2",
	3: "md:grid-cols-3",
};

/** "in-progress" → "In Progress" */
function formatStatusLabel(status: string) {
	return status
		.split(/[-_]/)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

export function RelatedRecordsFrame({
	sections,
	columns,
	className,
}: {
	sections: RelatedRecordSection[];
	columns?: 1 | 2 | 3;
	className?: string;
}) {
	const cols = columns ?? Math.min(Math.max(sections.length, 1), 3);

	return (
		<section className={cn("workspace-related-records", className)}>
			<div className="workspace-section-heading">
				<h3 className="text-sm font-semibold">
					Related
				</h3>
			</div>

			<div className={cn("grid grid-cols-1 gap-6", COLS[cols])}>
				{sections.map((section) => {
					const SectionIcon = section.icon;
					return (
						<div key={section.title} className="min-w-0 flex flex-col gap-2">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<SectionIcon className="size-4 text-muted-foreground" />
									<span className="text-sm font-semibold text-foreground">
										{section.title}
									</span>
								</div>
								{section.items.length > 0 && (
									<span className="text-xs text-muted-foreground/70 tabular-nums">
										{section.items.length}
									</span>
								)}
							</div>

							{section.items.length === 0 ? (
								<EmptyState
									size="sm"
									icon={<SectionIcon />}
									title={
										section.emptyLabel ??
										`No ${section.title.toLowerCase()} yet`
									}
								/>
							) : (
								<div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
									{section.items.map((item) => {
										const RowIcon = item.icon ?? section.icon;
										return (
											<Item
												key={item.id}
												variant="outline"
												className="bg-card px-3 py-2.5 shadow-sm hover:bg-muted"
												size="xs"
												render={
													item.href ? (
														<Link href={item.href as Route} />
													) : undefined
												}
											>
												<ItemMedia variant="icon">
													<RowIcon />
												</ItemMedia>
												<ItemContent>
													<ItemTitle>{item.title}</ItemTitle>
													{item.meta != null && (
														<ItemDescription className="tabular-nums">
															{item.meta}
														</ItemDescription>
													)}
												</ItemContent>
												{item.status != null && (
													<ItemActions>
														<StatusBadge status={item.status} appearance="soft">
															{formatStatusLabel(item.status)}
														</StatusBadge>
													</ItemActions>
												)}
											</Item>
										);
									})}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</section>
	);
}
