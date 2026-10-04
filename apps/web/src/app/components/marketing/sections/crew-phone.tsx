"use client";

import { useRef } from "react";
import { Iphone } from "@/components/ui/iphone";
import { cn } from "@/lib/utils";
import { useRevealOnce } from "../use-reveal-once";
import { usePreloadScreen } from "./use-preload-screen";

export function CrewPhone({ className }: { className?: string }) {
	const frame = useRef<HTMLDivElement>(null);
	useRevealOnce(frame);
	usePreloadScreen(frame);

	return (
		// Inline-size containment only: with size containment a stretched auto-height container resolves cqh to 0.
		<div
			ref={frame}
			className={cn(
				"relative h-[min(100vw,560px)] overflow-hidden rounded-2xl border border-(--rule) bg-(--sheet) [container-type:inline-size] md:h-[clamp(400px,44vw,600px)] lg:h-auto lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent",
				className
			)}
		>
			{/* Below 1024px it is width-driven and top-anchored so the screen stays legible, and the device bottom may crop. */}
			<div className="absolute left-1/2 top-5 aspect-[433/882] w-[min(82cqw,320px)] -translate-x-1/2 drop-shadow-2xl lg:static lg:w-full lg:translate-x-0">
				<Iphone
					className="lp-phone"
					src="/landing/app-today.webp"
					role="img"
					aria-label="The OneTool iOS app open on the Today screen, with the day’s visits, the overdue total and the week ahead"
				/>
			</div>
		</div>
	);
}
