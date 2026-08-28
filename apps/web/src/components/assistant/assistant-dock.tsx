"use client";

import { MessageCircle, Sparkles } from "lucide-react";
import { BorderBeam } from "@/components/ui/border-beam";
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
	pinned = false,
	framed = false,
	onOpen,
}: {
	open: boolean;
	pinned?: boolean;
	/** A surface published a contextual header above the dock: they read as one unit. */
	framed?: boolean;
	onOpen: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onOpen}
			disabled={open}
			aria-label="Open assistant chat"
			className={cn(
				"pointer-events-auto relative flex w-full max-w-sm cursor-pointer items-center gap-3 rounded-2xl border border-border bg-popover p-2 pr-2.5 text-left shadow-lg transition-[transform,opacity,box-shadow] duration-300 ease-out",
				"hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
				// Framed, the dock is the bottom half of a taller unit — lifting it
				// would tear it away from its header.
				framed ? "rounded-t-none" : "hover:-translate-y-0.5 focus-visible:-translate-y-0.5",
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
			{/* Subtle attention cue for the collapsed dock only; pinned users
			    already know where the assistant lives. Radial (rotationally
			    symmetric) glow instead of the default linear tail — the beam
			    auto-rotates through corners, and a directional gradient makes
			    that read as a snap. Framed, the header is the cue and the beam's
			    radius no longer matches the flattened top corners. */}
			{!open && !pinned && !framed && (
				<BorderBeam
					size={90}
					duration={6}
					pathRadius={16}
					borderWidth={2}
					colorFrom="var(--primary)"
					colorTo="var(--primary)"
					className="motion-reduce:hidden bg-[radial-gradient(circle_at_center,var(--color-from)_0%,var(--color-from)_20%,transparent_60%)]"
				/>
			)}
		</button>
	);
}
