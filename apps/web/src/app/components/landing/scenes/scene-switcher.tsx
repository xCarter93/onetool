"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { bpEase } from "../blueprint/blueprint-motion";

export type SwitcherScene = {
	/** Stable id. Doubles as the tab key and the stage's remount key. */
	id: string;
	/** Tracked-caps plate label: a 2-3 word verb phrase. */
	label: string;
	/** Bold clause. Ends in a period. */
	heading: string;
	/** One muted mechanism sentence. */
	body: string;
	/** The act's stage artwork. Stays a server subtree — it is only ever passed through. */
	content: ReactNode;
};

/** The stable heading id — the section labels itself with this. */
export const SCENE_HEADING_ID = "how-it-works-heading";

const PANEL_ID = "how-it-works-stage";

/**
 * A-101's selection-driven scene switcher: three plates, one stage.
 *
 * Replaces the old sticky rail. There is no runway, no vh height and no
 * position:sticky anywhere — the section is ordinary document flow, which is
 * what removes the dead scroll the rail cost.
 *
 * ONE MOUNTED ACT. Every scene autoplays through its own <DrawIn>
 * IntersectionObserver, so an inactive act left in the DOM would burn its
 * one-shot choreography unseen. `mode="wait"` unmounts the outgoing act before
 * the incoming one mounts, so re-selecting an act replays it instead of showing
 * a spent still.
 *
 * The <h2> element itself never remounts (it carries the id the section is
 * labelled by); only the inner span swaps.
 *
 * Selection is click/keyboard only — no autoplay. Arrow-key navigation is
 * scoped to the tablist with a roving tabindex; nothing listens on window.
 */
export function SceneSwitcher({
	scenes,
	className,
	tablistLabel = "Scenes",
}: {
	scenes: readonly SwitcherScene[];
	className?: string;
	tablistLabel?: string;
}) {
	const [active, setActive] = useState(0);
	const reduce = useReducedMotion();
	const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

	const activeScene = scenes[active];
	if (!activeScene) return null;

	const swap = reduce
		? { duration: 0 }
		: { duration: 0.34, ease: bpEase };

	/** Roving tabindex. Moves focus and selection together — the panels are cheap. */
	function onTablistKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
		const last = scenes.length - 1;
		let next: number | null = null;
		if (event.key === "ArrowRight" || event.key === "ArrowDown") {
			next = active === last ? 0 : active + 1;
		} else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
			next = active === 0 ? last : active - 1;
		} else if (event.key === "Home") {
			next = 0;
		} else if (event.key === "End") {
			next = last;
		}
		if (next === null) return;
		event.preventDefault();
		setActive(next);
		tabRefs.current[next]?.focus();
	}

	return (
		<div className={cn("relative", className)}>
			<h2
				id={SCENE_HEADING_ID}
				className="block min-h-16 max-w-3xl text-balance text-2xl font-semibold leading-[1.1] tracking-tight text-foreground sm:min-h-20 sm:text-3xl lg:min-h-24 lg:text-[2.5rem]"
			>
				<AnimatePresence mode="wait" initial={false}>
					<m.span
						key={activeScene.id}
						initial={reduce ? false : { opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={
							reduce
								? { opacity: 1, transition: { duration: 0 } }
								: { opacity: 0, y: -10, transition: { duration: 0.16, ease: "linear" } }
						}
						transition={swap}
						className="block"
					>
						{activeScene.heading}
					</m.span>
				</AnimatePresence>
			</h2>

			<div className="mt-4 min-h-16 max-w-2xl sm:mt-5 sm:min-h-12">
				<AnimatePresence mode="wait" initial={false}>
					<m.p
						key={activeScene.id}
						initial={reduce ? false : { opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={
							reduce
								? { opacity: 1, transition: { duration: 0 } }
								: { opacity: 0, y: -8, transition: { duration: 0.16, ease: "linear" } }
						}
						transition={reduce ? swap : { ...swap, delay: 0.04 }}
						className="text-sm leading-relaxed text-muted-foreground sm:text-base"
					>
						{activeScene.body}
					</m.p>
				</AnimatePresence>
			</div>

			{/* The plates. Square hairline tiles, never rounded cards. */}
			<div
				role="tablist"
				aria-label={tablistLabel}
				aria-orientation="horizontal"
				onKeyDown={onTablistKeyDown}
				className="mt-10 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:mt-12 lg:gap-3"
			>
				{scenes.map((scene, index) => {
					const isActive = index === active;
					return (
						<button
							key={scene.id}
							ref={(node) => {
								tabRefs.current[index] = node;
							}}
							type="button"
							role="tab"
							id={`${PANEL_ID}-tab-${scene.id}`}
							aria-selected={isActive}
							aria-controls={PANEL_ID}
							tabIndex={isActive ? 0 : -1}
							onClick={() => setActive(index)}
							className={cn(
								"group relative flex flex-col items-start gap-2 border p-4 text-left transition-colors duration-200 sm:p-5 motion-reduce:transition-none",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
								isActive
									? "border-bp-line-strong bg-bp-paper opacity-100"
									: "border-bp-line bg-muted opacity-60 hover:opacity-100",
							)}
						>
							<span className="flex items-center gap-2 text-[11px] font-semibold uppercase leading-none tracking-[0.14em]">
								<span className="tabular-nums text-bp-anno">
									{String(index + 1).padStart(2, "0")}
								</span>
								<span aria-hidden="true" className="h-px w-4 bg-bp-line-strong" />
								<span
									className={cn(
										isActive ? "text-foreground" : "text-muted-foreground",
									)}
								>
									{scene.label}
								</span>
							</span>
							<span className="text-sm font-medium leading-snug tracking-[-0.01em] text-muted-foreground">
								{scene.heading}
							</span>
						</button>
					);
				})}
			</div>

			{/*
			 * The stage. One plate at full section width; each scene centres itself
			 * inside it (the widest is 48rem), so the plate only has to reserve
			 * height. min-h rather than a fixed height: a scene a few px taller
			 * should grow the plate, not be cropped.
			 */}
			<div
				id={PANEL_ID}
				role="tabpanel"
				aria-labelledby={`${PANEL_ID}-tab-${activeScene.id}`}
				tabIndex={0}
				className="relative mt-4 border border-bp-line bg-bp-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:mt-6"
			>
				<div className="flex min-h-[26rem] items-center justify-center px-2 py-6 sm:min-h-[30rem] sm:px-6 sm:py-8 lg:min-h-[34rem] lg:px-10 lg:py-12">
					<AnimatePresence mode="wait" initial={false}>
						<m.div
							key={activeScene.id}
							initial={reduce ? false : { opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							exit={
								reduce
									? { opacity: 1, transition: { duration: 0 } }
									: { opacity: 0, transition: { duration: 0.16, ease: "linear" } }
							}
							transition={swap}
							className="w-full"
						>
							{activeScene.content}
						</m.div>
					</AnimatePresence>
				</div>
			</div>
		</div>
	);
}
