"use client";

import { useEffect, useRef } from "react";
import { Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { setMotionPaused, useMotionPaused } from "./motion-pause";

/** Pauses the page's looping animations; the label stays fixed because `aria-pressed` carries the state (APG toggle button). */
export function MotionToggle({ className }: { className?: string }) {
	const paused = useMotionPaused();
	const ref = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		ref.current?.closest(".dc-landing")?.toggleAttribute("data-paused", paused);
	}, [paused]);

	return (
		<button
			ref={ref}
			type="button"
			aria-pressed={paused}
			onClick={() => setMotionPaused(!paused)}
			className={cn(
				"inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-medium pointer-fine:min-h-8 text-(--ink-3) transition-colors duration-150 hover:text-(--ink) aria-pressed:bg-(--accent-wash) aria-pressed:text-(--accent-ink)",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)",
				className,
			)}
		>
			<Pause aria-hidden="true" className="size-3.5" />
			Pause animations
		</button>
	);
}
