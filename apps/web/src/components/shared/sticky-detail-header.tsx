"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useStickyHeader } from "@/hooks/use-sticky-header";

interface StickyDetailHeaderProps {
	children: (isSticky: boolean) => ReactNode;
}

export function StickyDetailHeader({ children }: StickyDetailHeaderProps) {
	const { sentinelRef, isSticky } = useStickyHeader();

	return (
		<>
			<div ref={sentinelRef} className="h-0 w-full" />
			<div
				className={cn(
					"transition-all duration-300",
					isSticky
						? "sticky top-[73px] z-20 backdrop-blur-2xl bg-background/80 dark:bg-background/70 shadow-md border-b border-border/60 py-4 -ml-6 pl-6 pr-6 xl:mr-[480px]"
						: "border-b border-border pb-4 mb-0"
				)}
			>
				{children(isSticky)}
			</div>
		</>
	);
}
