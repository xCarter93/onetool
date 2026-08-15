"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "./use-reduced-motion";

/* The job-sheet spine: the page indexed like a drawing set. A fixed mono rail
 * in the left gutter — only where there IS a gutter (the column is 1280px, so
 * ≥1560px leaves ≥140px a side). Hairline track, an accent progress fill driven
 * by document scroll, and the active row marked with the page's eyebrow
 * rectangle. It reads as an instrument, not nav chrome: always-visible labels,
 * no hover-reveal, nothing that moves unless you scroll.
 *
 * Two deliberate choices:
 * - `#top` is never observed. It sits on the page ROOT, which spans the whole
 *   document and would intersect the scrollspy band forever. It is the fallback
 *   when nothing else is in the band.
 * - Progress writes `transform: scaleY()` straight to the node inside rAF —
 *   no state, no re-render per frame, and no CSS transition to fight the
 *   writes. It is position, not decoration, so it keeps updating under
 *   reduced motion. */

const ENTRIES = [
	{ id: "top", code: "01", label: "Cover" },
	{ id: "one-place", code: "02", label: "The old way" },
	{ id: "loop", code: "03", label: "The loop" },
	{ id: "try-it", code: "04", label: "Try it" },
	{ id: "work", code: "05", label: "What's inside" },
	{ id: "compare", code: "06", label: "Compare" },
	{ id: "phone", code: "07", label: "On the job" },
	{ id: "pricing", code: "08", label: "Pricing" },
	{ id: "faq", code: "09", label: "FAQ" },
] as const;

const ALL_IDS = ENTRIES.map((entry) => entry.id) as readonly string[];

/** Flips the active entry as a section crosses the viewport's middle. */
const SPY_MARGIN = "-45% 0px -50% 0px";

/* Which sections actually shipped. The page is static, so this is read once and
 * cached — the identity has to be stable or useSyncExternalStore re-renders
 * forever. SSR renders the full index; the client prunes right after hydration. */
let presentCache: readonly string[] | null = null;
const subscribePresent = () => () => {};
const getPresent = () => {
	presentCache ??= ALL_IDS.filter((id) => document.getElementById(id) !== null);
	return presentCache;
};
const getServerPresent = () => ALL_IDS;

export function SheetSpine() {
	const reducedMotion = usePrefersReducedMotion();
	const fillRef = useRef<HTMLSpanElement>(null);
	const presentIds = useSyncExternalStore(
		subscribePresent,
		getPresent,
		getServerPresent
	);
	const [activeId, setActiveId] = useState<string>("top");

	useEffect(() => {
		const found = ENTRIES.filter((entry) => document.getElementById(entry.id));
		const spied = found.filter((entry) => entry.id !== "top");
		const elements = spied
			.map((entry) => document.getElementById(entry.id))
			.filter((el): el is HTMLElement => el !== null);
		if (elements.length === 0) return;

		const order = spied.map((entry) => entry.id);
		const inBand = new Set<string>();
		const observer = new IntersectionObserver(
			(records) => {
				for (const record of records) {
					if (record.isIntersecting) inBand.add(record.target.id);
					else inBand.delete(record.target.id);
				}
				// Lowest section in the band wins.
				let next = "top";
				for (const id of order) {
					if (inBand.has(id)) next = id;
				}
				// Nothing in the 5%-tall band: fall back by position, so the
				// unindexed final CTA/footer keep FAQ lit instead of snapping
				// back to the cover. Above every section, "top" survives.
				if (inBand.size === 0) {
					const bandTop = window.innerHeight * 0.45;
					for (const el of elements) {
						if (el.getBoundingClientRect().top <= bandTop) next = el.id;
					}
				}
				setActiveId(next);
			},
			{ rootMargin: SPY_MARGIN }
		);
		elements.forEach((el) => observer.observe(el));
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const fill = fillRef.current;
		if (!fill) return;

		let frame = 0;
		const paint = () => {
			frame = 0;
			const max = document.documentElement.scrollHeight - window.innerHeight;
			const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
			fill.style.transform = `scaleY(${progress})`;
		};
		const schedule = () => {
			if (frame) return;
			frame = requestAnimationFrame(paint);
		};

		paint(); // restored scroll positions start correct
		window.addEventListener("scroll", schedule, { passive: true });
		window.addEventListener("resize", schedule, { passive: true });
		return () => {
			if (frame) cancelAnimationFrame(frame);
			window.removeEventListener("scroll", schedule);
			window.removeEventListener("resize", schedule);
		};
	}, []);

	const entries = ENTRIES.filter((entry) => presentIds.includes(entry.id));

	return (
		<nav
			aria-label="Page sections"
			className="fixed left-[clamp(16px,2vw,40px)] top-1/2 z-40 hidden -translate-y-1/2 select-none min-[1560px]:block"
		>
			{/* Drawing-set title block. */}
			<p
				aria-hidden="true"
				className="mb-[14px] pl-[11px] font-mono text-[10px] uppercase leading-[1.5] tracking-[0.14em] text-(--ink-3)"
			>
				OT-2026
				<br />
				Job sheet
			</p>

			<div className="relative">
				<span
					aria-hidden="true"
					className="pointer-events-none absolute inset-y-0 left-0 w-px bg-(--rule-2)"
				/>
				<span
					ref={fillRef}
					aria-hidden="true"
					className="pointer-events-none absolute inset-y-0 left-0 w-px origin-top bg-(--accent)"
					style={{ transform: "scaleY(0)" }}
				/>

				<ol className="flex flex-col">
					{entries.map((entry) => {
						const isActive = entry.id === activeId;
						return (
							<li key={entry.id}>
								<a
									href={`#${entry.id}`}
									aria-current={isActive ? "location" : undefined}
									className={cn(
										"flex items-center rounded-[3px] py-[5px] pl-[11px] pr-1 transition-colors duration-200 ease-(--lp-ease) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)",
										isActive
											? "text-(--ink)"
											: "text-(--ink-3) hover:text-(--ink-2)"
									)}
								>
									<span className="w-[15px] flex-none font-mono text-[10.5px] leading-none tabular-nums">
										{entry.code}
									</span>
									{/* Fixed slot: the marker slides in without reflowing the label. */}
									<span
										aria-hidden="true"
										className="mr-[5px] w-[14px] flex-none"
									>
										<span
											className={cn(
												"block h-[7px] w-[14px] rounded-[1px] bg-(--accent)",
												!reducedMotion &&
													"transition-[translate,opacity] duration-[240ms] ease-(--lp-ease)",
												isActive
													? "translate-x-0 opacity-100"
													: "-translate-x-[6px] opacity-0"
											)}
										/>
									</span>
									<span className="whitespace-nowrap text-[11.5px] font-medium leading-none">
										{entry.label}
									</span>
								</a>
							</li>
						);
					})}
				</ol>
			</div>
		</nav>
	);
}
