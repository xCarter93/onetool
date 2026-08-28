"use client";

import { useState } from "react";
import { BarChart3, X } from "lucide-react";
import { useEntitlements } from "@/hooks/use-entitlements";
import { cn } from "@/lib/utils";
import { AssistantDock } from "./assistant-dock";
import { useAssistantDockFrame } from "./assistant-dock-frame-context";

const FRAME_DISMISSED_KEY = "assistant-report-frame-dismissed";

function readDismissed() {
	try {
		return (
			typeof window !== "undefined" &&
			localStorage.getItem(FRAME_DISMISSED_KEY) === "true"
		);
	} catch {
		return false;
	}
}

/**
 * The dock plus the contextual header a surface published, styled as one unit.
 * Header and dock carry the same fade so they leave together when the panel
 * opens (siblings, so the opacities don't compound).
 */
export function FramedAssistantDock({
	open,
	pinned,
	onOpen,
}: {
	open: boolean;
	pinned: boolean;
	onOpen: () => void;
}) {
	const frame = useAssistantDockFrame();
	const { allows, isLoading } = useEntitlements();
	const [dismissed, setDismissed] = useState(readDismissed);
	const framed =
		frame !== null && !dismissed && !isLoading && allows("nlReportGeneration");

	const dismiss = () => {
		setDismissed(true);
		try {
			localStorage.setItem(FRAME_DISMISSED_KEY, "true");
		} catch {
			// Private-mode storage failures shouldn't keep the hint on screen.
		}
	};

	return (
		<div className="flex w-full max-w-sm flex-col">
			{framed && (
				<div
					className={cn(
						"pointer-events-auto rounded-t-2xl border border-b-0 border-border bg-popover shadow-lg transition-opacity duration-300 ease-out",
						open && "pointer-events-none opacity-0 duration-150"
					)}
				>
					<div className="flex items-center gap-2 rounded-t-2xl bg-primary/[0.04] py-1.5 pl-3 pr-1.5">
						<BarChart3 className="size-3.5 shrink-0 text-primary" />
						<button
							type="button"
							onClick={onOpen}
							className="flex min-w-0 flex-1 items-baseline gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
						>
							<span className="shrink-0 text-xs font-medium">
								{frame.title}
							</span>
							<span className="truncate text-xs text-muted-foreground">
								{frame.description}
							</span>
						</button>
						<button
							type="button"
							onClick={dismiss}
							aria-label="Dismiss report assistant hint"
							className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
						>
							<X className="size-3.5" />
						</button>
					</div>
				</div>
			)}
			<AssistantDock
				open={open}
				pinned={pinned}
				framed={framed}
				onOpen={onOpen}
			/>
		</div>
	);
}
