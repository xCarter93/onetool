"use client";

import { MessageCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Always-visible assistant entry point: a floating dock bar centered along the
 * bottom of the workspace card. Clicking anywhere on it opens the panel, which
 * expands out of the dock's footprint; while open the dock just fades (the
 * expanding panel covers it, so a fade is all the exit it needs — and on close
 * it's already back when the shrinking panel unmounts).
 */
export function AssistantDock({
	open,
	onOpen,
}: {
	open: boolean;
	onOpen: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onOpen}
			disabled={open}
			aria-label="Open assistant chat"
			className={cn(
				"pointer-events-auto flex w-full max-w-sm cursor-pointer items-center gap-3 rounded-2xl border border-border bg-popover p-2 pr-2.5 text-left shadow-lg transition-[transform,opacity,box-shadow] duration-300 ease-out",
				"hover:-translate-y-0.5 hover:shadow-xl focus-visible:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
				open && "pointer-events-none opacity-0 duration-150"
			)}
		>
			<span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
				<Sparkles className="size-4.5 text-primary" />
			</span>
			<span className="min-w-0 flex-1">
				<span className="block truncate text-sm font-medium leading-none">
					Assistant
				</span>
				<span className="mt-1 block truncate text-xs text-muted-foreground">
					Ask about your clients, schedule, quotes, and more
				</span>
			</span>
			<span className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-foreground/5 px-2.5 text-xs font-medium text-muted-foreground">
				<MessageCircle className="size-3.5" />
				Chat
			</span>
		</button>
	);
}
