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

			{/* Separate sticky blur strip covering the gap between main header and detail header */}
			{isSticky && (
				<div
					className="sticky top-[20px] z-[25] h-[24px] -mb-[24px] bg-background pointer-events-none -ml-6 pr-6 xl:mr-[480px]"
					aria-hidden="true"
				/>
			)}

			<div
				className={cn(
					"transition-all duration-300",
					isSticky
						? "sticky top-[44px] z-20 bg-background shadow-md border-b border-border/60 py-4 -ml-6 pl-6 pr-6 xl:mr-[480px]"
						: "border-b border-border pt-4 pb-4 mb-0 pr-6"
				)}
			>
				{children(isSticky)}
			</div>
		</>
	);
}
