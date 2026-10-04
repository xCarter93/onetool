"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { PanelBar } from "./feature";
import { useMotionPaused } from "../motion-pause";
import { useInView } from "../use-in-view";
import { usePrefersReducedMotion } from "../use-reduced-motion";
import { useCellLive } from "./use-cell-live";

const DAYS = [
	{ name: "Mon", date: 5, narrow: false },
	{ name: "Tue", date: 6, narrow: true },
	{ name: "Wed", date: 7, narrow: true },
	{ name: "Thu", date: 8, narrow: true },
	{ name: "Fri", date: 9, narrow: false },
];
const TODAY = 1;
const HOURS = ["8 AM", "9 AM", "10 AM", "11 AM", "12 PM"];
// 11:40 AM: inside Whitfield's fall cleanup, below its label.
const NOW = 3.67;

type Visit = { day: number; start: number; length: number; job: string; place: string };

// The view stops at 1 PM like a scrolled calendar; y-clip (not hidden) lets the dragged block cross columns.
const VISITS: Visit[] = [
	{ day: 0, start: 2.5, length: 2, job: "Deep clean", place: "Lakeside Café" },
	{ day: 1, start: 0, length: 1, job: "Weekly mow", place: "Kerr Road" },
	{ day: 1, start: 1, length: 1.5, job: "Power wash", place: "Elm Street" },
	{ day: 1, start: 3, length: 2.5, job: "Fall cleanup", place: "Whitfield" },
	{ day: 2, start: 0, length: 1, job: "Leaf removal", place: "Maple Court" },
	{ day: 2, start: 3, length: 1, job: "Hedge trim", place: "Sato" },
	{ day: 2, start: 4.5, length: 1.5, job: "Power wash", place: "Brennan" },
	{ day: 3, start: 3, length: 1.5, job: "Furnace service", place: "Novak" },
	{ day: 3, start: 4.5, length: 1.5, job: "Window cleaning", place: "Patel Dental" },
	{ day: 4, start: 1, length: 2, job: "Leaf removal", place: "Kerr Road" },
];
const MOVER: Visit = { day: 2, start: 1, length: 2, job: "Gutter clearing", place: "Dunmore" };

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";
// x is a percentage of the block, and a block is exactly one day column wide.
// Web Animations, not CSS keyframes: landing.css pauses and strips CSS animations, and FADE must still run.
const DRAG = {
	duration: 1100,
	keyframes: [
		{ offset: 0, transform: "translateX(0%) scale(1)", easing: EASE_OUT },
		{ offset: 0.2, transform: "translateX(0%) scale(1.04)", easing: EASE_IN_OUT },
		{ offset: 0.78, transform: "translateX(100%) scale(1.04)", easing: EASE_OUT },
		{ offset: 1, transform: "translateX(100%) scale(1)" },
	] satisfies Keyframe[],
};
const FADE = {
	duration: 600,
	keyframes: [
		{ offset: 0, transform: "translateX(0%)", opacity: 1, easing: "ease-in-out" },
		{ offset: 0.4, transform: "translateX(0%)", opacity: 0, easing: "ease-in-out" },
		{ offset: 0.42, transform: "translateX(100%)", opacity: 0, easing: "ease-in-out" },
		{ offset: 1, transform: "translateX(100%)", opacity: 1 },
	] satisfies Keyframe[],
};

function place(visit: Visit) {
	return {
		top: `calc(${(visit.start / HOURS.length) * 100}% + 2px)`,
		height: `calc(${(visit.length / HOURS.length) * 100}% - 4px)`,
	};
}

function Block({ visit, moved = false }: { visit: Visit; moved?: boolean }) {
	// Less than an hour above the fold leaves room for one line, as calendars show short events.
	const oneLine = HOURS.length - visit.start < 1;
	return (
		<div
			className={cn(
				"h-full overflow-hidden rounded-md border bg-(--paper) px-1.5 py-0.5 transition-colors duration-300",
				moved ? "border-(--accent-ink)" : "border-(--rule-2)"
			)}
		>
			<p className={cn("text-2xs font-semibold leading-3.5 text-(--ink)", oneLine && "truncate")}>
				{visit.job}
				{oneLine ? <span className="font-normal text-(--ink-2)"> {visit.place}</span> : null}
			</p>
			{oneLine ? null : <p className="text-2xs leading-3.5 text-(--ink-2)">{visit.place}</p>}
		</div>
	);
}

export function ScheduleCell() {
	const ref = useRef<HTMLDivElement>(null);
	const moverRef = useRef<HTMLDivElement>(null);
	const live = useCellLive(ref);
	const seen = useInView(ref, { once: true, amount: 0.6 });
	const reduce = usePrefersReducedMotion();
	const paused = useMotionPaused();
	const [moved, setMoved] = useState(false);
	const settled = moved || (seen && paused);

	useEffect(() => {
		if (!live || !seen || moved) return;
		const timer = window.setTimeout(() => setMoved(true), 1400);
		return () => window.clearTimeout(timer);
	}, [live, seen, moved]);

	useEffect(() => {
		if (!settled) return;
		const plan = reduce || !moved ? FADE : DRAG;
		const animation = moverRef.current?.animate(plan.keyframes, { duration: plan.duration, fill: "forwards" });
		return () => animation?.cancel();
	}, [settled, reduce, moved]);

	return (
		<div ref={ref} className="flex h-full flex-col">
			<PanelBar>
				<p className="text-sm font-semibold text-(--ink)">
					October 2026 <span className="ml-1.5 font-normal text-(--ink-2)">Week 41</span>
				</p>
				<span className="flex items-center gap-1 text-xs font-medium text-(--ink-2)">
					<ChevronLeft aria-hidden="true" className="size-4" />
					Today
					<ChevronRight aria-hidden="true" className="size-4" />
				</span>
			</PanelBar>

			<div className="grid flex-1 grid-cols-[40px_repeat(3,minmax(0,1fr))] grid-rows-[32px_minmax(0,1fr)] @xl:grid-cols-[48px_repeat(5,minmax(0,1fr))]">
				<div />
				{DAYS.map((day, index) => (
					<div
						key={day.name}
						className={cn(
							"flex items-center justify-center gap-1.5 border-l border-(--rule) text-xs",
							!day.narrow && "hidden @xl:flex",
							index === TODAY ? "font-semibold text-(--ink)" : "text-(--ink-2)"
						)}
					>
						{day.name}
						<span
							className={cn(
								"grid size-5 place-items-center rounded-full tabular-nums",
								index === TODAY && "bg-(--accent-ink) text-(--sheet)"
							)}
						>
							{day.date}
						</span>
					</div>
				))}

				<div className="relative border-t border-(--rule)">
					{HOURS.map((hour, index) => (
						<span
							key={hour}
							className="absolute right-2 text-2xs leading-4 tabular-nums text-(--ink-2)"
							style={{ top: `calc(${(index / HOURS.length) * 100}% + 2px)` }}
						>
							{hour}
						</span>
					))}
				</div>

				{DAYS.map((day, dayIndex) => (
					<div
						key={day.name}
						className={cn(
							"relative overflow-y-clip border-l border-t border-(--rule)",
							!day.narrow && "hidden @xl:block",
							dayIndex === TODAY && "bg-[color-mix(in_oklch,var(--accent-wash)_45%,transparent)]"
						)}
					>
						{HOURS.slice(1).map((hour, index) => (
							<div
								key={hour}
								className="absolute inset-x-0 border-t border-(--rule)"
								style={{ top: `${((index + 1) / HOURS.length) * 100}%` }}
							/>
						))}
						{VISITS.filter((visit) => visit.day === dayIndex).map((visit) => (
							<div key={visit.job + visit.place} className="absolute inset-x-1" style={place(visit)}>
								<Block visit={visit} />
							</div>
						))}
						{dayIndex === MOVER.day && (
							<div ref={moverRef} className="absolute inset-x-0 z-10 px-1" style={place(MOVER)}>
								<Block visit={MOVER} moved={settled} />
							</div>
						)}
						{dayIndex === TODAY && (
							<div
								className="absolute inset-x-0 flex items-center"
								style={{ top: `${(NOW / HOURS.length) * 100}%` }}
							>
								<span className="-ml-1 size-2 rounded-full bg-(--accent-ink)" />
								<span className="h-px flex-1 bg-(--accent-ink)" />
							</div>
						)}
					</div>
				))}
			</div>
		</div>
	);
}
