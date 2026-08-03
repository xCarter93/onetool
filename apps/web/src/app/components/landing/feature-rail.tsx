"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SheetCode } from "./blueprint/sheet-frame";
import { FeatureAnimation, type FeatureKey } from "./feature-animation";
import { FeatureAnimationLazy } from "./feature-animation-lazy";
import { chapterAnchor } from "./feature-anchors";

export interface RailChapter {
	key: FeatureKey;
	code: string;
	label: string;
	heading: string;
	body: string;
}

const LG_QUERY = "(min-width: 1024px)";
const subscribeLg = (cb: () => void) => {
	const mq = window.matchMedia(LG_QUERY);
	mq.addEventListener("change", cb);
	return () => mq.removeEventListener("change", cb);
};

/**
 * Renders exactly ONE variant — the pinned rail at lg+, the stacked read
 * below — so no hidden Players ever mount. The server snapshot is the stacked
 * variant (real content for SSR/no-JS); desktop swaps to the rail on
 * hydration, safely below the fold.
 */
export function FeatureChaptersClient({ chapters }: { chapters: RailChapter[] }) {
	const desktop = useSyncExternalStore(
		subscribeLg,
		() => window.matchMedia(LG_QUERY).matches,
		() => false,
	);
	return desktop ? (
		<FeatureRail chapters={chapters} />
	) : (
		<StackedChapters chapters={chapters} />
	);
}

/** The below-lg fallback: chapter blocks in a plain scroll, plates lazy. */
function StackedChapters({ chapters }: { chapters: RailChapter[] }) {
	return (
		<div className="flex flex-col gap-16">
			{/* Same `#feature-<key>` anchors the rail renders — the navbar flyout
			    links to them at every breakpoint. scroll-mt clears the sticky navbar. */}
			{chapters.map((c) => (
				<div key={c.key} id={chapterAnchor(c.key)} className="scroll-mt-24">
					<SheetCode code={c.code} label={c.label} />
					<h3 className="mt-4 text-balance text-2xl font-semibold leading-[1.1] tracking-tight text-foreground">
						{c.heading}
					</h3>
					<p className="mt-3 max-w-md text-pretty text-base leading-7 text-muted-foreground">
						{c.body}
					</p>
					<div className="mt-6 border border-bp-line bg-card">
						<FeatureAnimationLazy feature={c.key} />
					</div>
				</div>
			))}
		</div>
	);
}

/**
 * Attio-style pinned chapters (lg+): the rail of headings stays in view on the
 * left while scrolling walks the right-hand plate through the Remotion scenes.
 * The section's real height is one tall scroll track; a sticky viewport-frame
 * inside it swaps the active chapter from scroll progress. Only the active
 * scene's Player is mounted — remounting on swap restarts the scene from
 * frame 0, which is the wanted behaviour.
 *
 * Anchor markers for the navbar's `#feature-<key>` deep links sit at each
 * segment boundary inside the track, so old links land on the right scene.
 */
export function FeatureRail({ chapters }: { chapters: RailChapter[] }) {
	const trackRef = useRef<HTMLDivElement>(null);
	const [active, setActive] = useState(0);

	useEffect(() => {
		const track = trackRef.current;
		if (!track) return;
		let raf = 0;
		const update = () => {
			raf = 0;
			const rect = track.getBoundingClientRect();
			const scrollable = rect.height - window.innerHeight;
			if (scrollable <= 0) return;
			const progress = Math.min(1, Math.max(0, -rect.top / scrollable));
			// 0.9999 clamp keeps progress=1 inside the last chapter.
			const next = Math.min(
				chapters.length - 1,
				Math.floor(Math.min(progress, 0.9999) * chapters.length),
			);
			setActive((prev) => (prev === next ? prev : next));
		};
		const onScroll = () => {
			if (!raf) raf = requestAnimationFrame(update);
		};
		update();
		window.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("resize", onScroll);
		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", onScroll);
		};
	}, [chapters.length]);

	const chapter = chapters[active];

	return (
		<div
			ref={trackRef}
			className="relative"
			style={{ height: `${chapters.length * 85}vh` }}
		>
			{/* Deep-link markers, one per scroll segment. */}
			{chapters.map((c, i) => (
				<div
					key={c.key}
					id={chapterAnchor(c.key)}
					aria-hidden="true"
					className="absolute left-0 w-px"
					style={{ top: `${(i / chapters.length) * 100}%` }}
				/>
			))}

			<div className="sticky top-24 grid grid-cols-12 items-center gap-12 py-6">
				{/* Rail */}
				<div className="col-span-4">
					<ol>
						{chapters.map((c, i) => {
							const isActive = i === active;
							return (
								<li
									key={c.key}
									className="relative border-l-2 border-transparent data-active:border-primary"
									data-active={isActive || undefined}
								>
									<button
										type="button"
										aria-current={isActive || undefined}
										onClick={() =>
											document
												.getElementById(chapterAnchor(c.key))
												?.scrollIntoView({ block: "start" })
										}
										className={`block w-full py-2.5 pl-5 text-left transition-colors duration-200 ${
											isActive
												? "text-foreground"
												: "text-muted-foreground hover:text-foreground"
										}`}
									>
										<span className="block text-balance text-lg font-semibold leading-snug tracking-tight sm:text-xl">
											{c.heading}
										</span>
										{/* The mechanism sentence unfolds under the active row.
										    aria-hidden when collapsed: grid-rows-[0fr]+opacity-0 hide
										    it visually only, so screen readers would read all seven. */}
										<span
											aria-hidden={!isActive || undefined}
											className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
												isActive
													? "grid-rows-[1fr] opacity-100"
													: "grid-rows-[0fr] opacity-0"
											}`}
										>
											<span className="overflow-hidden">
												<span className="block max-w-sm pt-2 text-sm leading-6 text-muted-foreground">
													{c.body}
												</span>
											</span>
										</span>
									</button>
								</li>
							);
						})}
					</ol>
				</div>

				{/* Scene plate */}
				<div className="col-span-8">
					<div className="border border-bp-line bg-card">
						{/* key remounts the Player so each chapter starts at frame 0;
						    the fade covers the module swap. */}
						<div
							key={chapter.key}
							className="animate-in fade-in duration-300 motion-reduce:animate-none"
						>
							<FeatureAnimation feature={chapter.key} />
						</div>
					</div>
					<p className="mt-3 flex items-baseline justify-between text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-bp-anno">
						<span>
							{chapter.code} · {chapter.label}
						</span>
						<span className="text-muted-foreground tabular-nums">
							{String(active + 1).padStart(2, "0")} /{" "}
							{String(chapters.length).padStart(2, "0")}
						</span>
					</p>
				</div>
			</div>
		</div>
	);
}
