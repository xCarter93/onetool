"use client";

import {
	AnimatePresence,
	m,
	useMotionValueEvent,
	useReducedMotion,
	useScroll,
	useSpring,
} from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { bpEase, bpScrollSpring } from "./blueprint-motion";

export type RailScene = {
	/** Stable id. Doubles as the rail anchor target and the stage's remount key. */
	id: string;
	/** Sheet-tab label: a 2-3 word verb phrase, set in tracked caps. */
	label: string;
	/** Bold clause. Ends in a period. */
	heading: string;
	/** One muted mechanism sentence. Same heading element, muted ink. */
	body: string;
	/** The act's stage artwork. Stays a server subtree — it is only ever passed through. */
	content: ReactNode;
};

/**
 * Scroll runway per act, in vh. 110 rather than 100 so an act holds the stage
 * for a beat after it finishes drawing instead of being scrolled off mid-run.
 */
export const RAIL_SCENE_VH = 110;

/**
 * The sticky scene sequencer: ONE scroller, N acts. Not N sections, not tabs.
 *
 * LAYOUT (lg and up only — the caller renders the stacked mobile order itself).
 * A tall runway (`RAIL_SCENE_VH` per act) holds a `h-screen` sticky viewport
 * split 42% rail / 58% stage. The rail is drawing-set sheet tabs: tracked-caps
 * labels hung off a hairline grid line, the active one carrying a 2px sky bar
 * that sits on that line, with the act's own two-tone heading underneath.
 *
 * NO SCROLL HIJACK. Nothing is preventDefault-ed and no scroll is synthesised;
 * the page scrolls natively and the rail only *reads* progress. The tabs are
 * real anchors pointing at zero-height markers placed at the scroll offset
 * where each act takes the stage, so clicking one is an ordinary in-page jump.
 *
 * ACTIVATION — only the active act is mounted.
 * Every scene autoplays through its own <DrawIn> IntersectionObserver, so an
 * inactive scene sitting in the DOM behind an opacity-0 layer would still be
 * intersecting and would burn its one-shot choreography unseen. Mounting one
 * act at a time makes that structurally impossible: an act's observer cannot
 * fire before the act exists. The entering scene's own choreography IS the
 * entrance; the 8px rise here is only the plate arriving under it. Re-entering
 * an act remounts it, so it replays cleanly rather than showing a spent still.
 *
 * MECHANISM NOTES that are load-bearing:
 *  - `useSpring` with bounce-free damping smooths the scroll value; a default
 *    spring would overshoot and read as a toy.
 *  - `useMotionValueEvent` drives only the DISCRETE active index, never
 *    per-frame React state.
 *  - Scroll-linked reading is not gated by prefers-reduced-motion — it maps to
 *    the user's own scroll. The stage SWAP is gated. Every act must still read
 *    as a still image; that is the test.
 *  - Never put `content-visibility: auto` (.bp-section) on this section: it
 *    breaks position:sticky descendants and useScroll's measurement.
 *  - `useScroll` works with the repo's Lenis config because Lenis drives native
 *    scrollTop. It would break if Lenis were switched to wrapper/transform mode.
 *  - The sticky viewport pads its top clear of the fixed navbar, so a pinned
 *    act is never tucked under the nav pill.
 */
export function BlueprintRail({
	scenes,
	className,
	ariaLabel = "Scenes",
}: {
	scenes: readonly RailScene[];
	className?: string;
	ariaLabel?: string;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const { scrollYProgress } = useScroll({
		target: ref,
		offset: ["start start", "end end"],
	});
	const progress = useSpring(scrollYProgress, bpScrollSpring);
	const [active, setActive] = useState(0);
	const reduce = useReducedMotion();

	const count = scenes.length;
	/** Total runway. */
	const runwayVh = count * RAIL_SCENE_VH;
	/** Distance actually travelled while the viewport is pinned. */
	const pinnedVh = runwayVh - 100;

	useMotionValueEvent(progress, "change", (value) => {
		const next = Math.min(count - 1, Math.max(0, Math.floor(value * count)));
		setActive((current) => (current === next ? current : next));
	});

	const activeScene = scenes[active];

	return (
		<div
			ref={ref}
			className={cn("relative hidden lg:block", className)}
			style={{ height: `${runwayVh}vh` }}
		>
			{/*
			 * Anchor markers. Each sits at the scroll offset that puts its act dead
			 * centre of that act's progress band, so a tab click lands on the act
			 * rather than on its boundary. Zero-height and inert; the visible tab is
			 * the <a>, this is only its target.
			 *
			 * Lenis intercepts in-page anchors with a -100px offset (smooth-scroll.tsx),
			 * which shifts the landing about 5% of one band — comfortably inside it.
			 */}
			{scenes.map((scene, index) => (
				<span
					key={scene.id}
					id={scene.id}
					aria-hidden="true"
					className="pointer-events-none absolute left-0 block h-px w-px"
					style={{ top: `${((index + 0.5) / count) * pinnedVh}vh` }}
				/>
			))}

			{/*
			 * No overflow-hidden: an act that is a few px taller than a short laptop
			 * viewport should spill symmetrically into the section's own padding, not
			 * be cropped. Cropping a drawing reads as a bug; a slightly tight fit does
			 * not.
			 */}
			<div className="sticky top-0 flex h-screen items-center pt-20 pb-10">
				<div className="mx-auto grid w-full max-w-7xl grid-cols-[42fr_58fr] items-center gap-x-10 px-8">
					<nav aria-label={ariaLabel} className="relative">
						{/* The grid line the sheet tabs hang off. */}
						<span
							aria-hidden="true"
							className="absolute inset-y-0 left-0 w-px bg-bp-line"
						/>
						<ol className="space-y-7">
							{scenes.map((scene, index) => {
								const isActive = index === active;
								return (
									<li key={scene.id} className="relative pl-6">
										{/* The 2px sky bar, sitting on the grid line. */}
										{isActive ? (
											<span
												aria-hidden="true"
												className="absolute inset-y-0 left-0 w-0.5 bg-bp-ink"
											/>
										) : null}

										<a
											href={`#${scene.id}`}
											aria-current={isActive ? "true" : undefined}
											className={cn(
												"inline-block rounded-sm text-[11px] font-semibold uppercase leading-none tracking-[0.14em] transition-colors duration-200 motion-reduce:transition-none",
												"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background",
												isActive
													? "text-bp-anno"
													: "text-muted-foreground hover:text-foreground",
											)}
										>
											{scene.label}
										</a>

										{/*
										 * `initial={false}` is a no-JS floor, not a taste call: an
										 * `initial` of opacity 0 is what the server renders, so a
										 * first act whose reveal never runs would be permanently
										 * invisible copy. Suppressed on first paint, animated on
										 * every later activation.
										 */}
										<AnimatePresence initial={false}>
											{isActive ? (
												<m.h3
													key={scene.id}
													initial={reduce ? false : { opacity: 0, y: 6 }}
													animate={{ opacity: 1, y: 0 }}
													transition={{ duration: 0.32, ease: bpEase }}
													/* Reserved height so a 3-line act and a 4-line act do
													   not nudge the whole centred column when the stage
													   swaps. */
													className="mt-3 min-h-28 max-w-md text-balance text-lg leading-snug tracking-[-0.01em]"
												>
													<span className="font-medium text-foreground">
														{scene.heading}
													</span>{" "}
													<span className="text-muted-foreground">
														{scene.body}
													</span>
												</m.h3>
											) : null}
										</AnimatePresence>
									</li>
								);
							})}
						</ol>
					</nav>

					{/*
					 * The stage. `mode="wait"` guarantees the outgoing act is unmounted
					 * before the incoming one mounts, which is what keeps exactly one
					 * <DrawIn> observer alive at a time. `initial={false}` stops the
					 * first act from double-entering on page load — its own draw-on is
					 * already the entrance.
					 */}
					<div className="relative min-w-0">
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
								transition={{ duration: 0.32, ease: bpEase }}
							>
								{activeScene.content}
							</m.div>
						</AnimatePresence>
					</div>
				</div>
			</div>
		</div>
	);
}
