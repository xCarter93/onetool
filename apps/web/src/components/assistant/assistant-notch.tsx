"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bottom-of-viewport trigger for the assistant panel — the header notches
 * mirrored: a tab bulging up from the bottom frame band (.assistant-notch in
 * globals.css). The hover lift reveals a sliver of frame beneath it, which is
 * the same color, so the tab reads as pulling up while staying fused to the
 * frame. Slides away below the edge while the panel is open.
 */
export function AssistantNotch({
	open,
	onOpen,
}: {
	open: boolean;
	onOpen: () => void;
}) {
	return (
		<div
			className={cn(
				"transition-transform duration-300 ease-out",
				open && "pointer-events-none translate-y-12"
			)}
		>
			<button
				type="button"
				onClick={onOpen}
				disabled={open}
				tabIndex={open ? -1 : undefined}
				aria-hidden={open}
				aria-label="Open assistant chat"
				className="assistant-notch flex h-10 min-w-64 cursor-pointer items-center justify-center gap-2 rounded-t-xl px-14 text-sm font-medium text-muted-foreground transition-[transform,color] duration-200 ease-out hover:-translate-y-1 hover:text-foreground focus-visible:-translate-y-1 focus-visible:text-foreground focus-visible:outline-none"
			>
				<Sparkles className="size-4 text-primary" />
				Assistant
			</button>
		</div>
	);
}
