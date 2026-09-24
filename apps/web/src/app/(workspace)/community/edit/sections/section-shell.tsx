"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface SectionShellProps {
	id: string;
	sectionRef: (el: HTMLElement | null) => void;
	icon: React.ComponentType<{ className?: string }>;
	title: string;
	description: string;
	/** Rendered to the right of the header (badges, counters). */
	headerAccessory?: React.ReactNode;
	/** First section skips the top separator. */
	first?: boolean;
	children: React.ReactNode;
	contentClassName?: string;
}

/** Shared chrome for editor sections: separator, icon tile, title, description. */
export function SectionShell({
	id,
	sectionRef,
	icon: Icon,
	title,
	description,
	headerAccessory,
	first = false,
	children,
	contentClassName,
}: SectionShellProps) {
	return (
		<section
			id={id}
			ref={sectionRef}
			className={cn(
				"scroll-mt-(--community-scroll-offset)",
				!first && "border-t border-border pt-8",
			)}
		>
			<div className="mb-6 flex items-start justify-between gap-4">
				<div className="flex items-start gap-3">
					<Icon
						className="mt-0.5 size-4 shrink-0 text-primary"
						aria-hidden="true"
					/>
					<div>
						<h2 className="text-lg font-semibold text-foreground">{title}</h2>
						<p className="mt-0.5 text-sm text-muted-foreground">
							{description}
						</p>
					</div>
				</div>
				{headerAccessory}
			</div>
			<div className={cn("space-y-6", contentClassName)}>{children}</div>
		</section>
	);
}
