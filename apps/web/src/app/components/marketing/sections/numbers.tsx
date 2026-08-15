"use client";

import { useEffect, useRef, useState } from "react";
import { Eyebrow, Lede, Section, SectionHeading } from "../primitives";
import { usePrefersReducedMotion } from "../use-reduced-motion";

/* NUMBERS — sheet band. Copy and figures verbatim from the comp
 * (design-import/OneTool Landing.dc.html, lines 382–424). The whole module is
 * a client component because the chart's scroll-triggered bar entrance needs an
 * IntersectionObserver; the markup is otherwise static and still server-rendered. */

const BAR_VALUES = [22, 31, 27, 38, 34, 44];
const BAR_MAX = 50;
const BAR_MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"];

const DIM_FILL = "color-mix(in oklch, var(--ink) 13%, transparent)";

const BARS = BAR_VALUES.map((value, i) => ({
	month: BAR_MONTHS[i],
	pct: `${Math.round((value / BAR_MAX) * 100)}%`,
	value: `$${value}k`,
	// Only the newest month takes the accent — decorative fill, never text.
	fill: i === BAR_VALUES.length - 1 ? "var(--accent)" : DIM_FILL,
	delay: `${i * 70}ms`,
	labelDelay: `${300 + i * 70}ms`,
}));

/** Six-bar revenue chart: bars grow from the baseline once the chart is on
 * screen, values fade in behind them. Reduced motion skips straight to the
 * settled state so the data is never withheld. */
function RevenueBars() {
	const ref = useRef<HTMLDivElement>(null);
	const [inView, setInView] = useState(false);
	const reduced = usePrefersReducedMotion();
	const settled = inView || reduced;

	useEffect(() => {
		const node = ref.current;
		if (!node) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry.isIntersecting) return;
				setInView(true);
				observer.disconnect();
			},
			{ threshold: 0.35 }
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	return (
		<div
			ref={ref}
			role="img"
			aria-label="Bar chart of revenue over the last six months, trending upward"
			className="mt-6"
		>
			<div className="relative h-[150px]">
				<span
					aria-hidden="true"
					className="absolute inset-x-0 bottom-0 h-px bg-(--rule-2)"
				/>
				<span
					aria-hidden="true"
					className="absolute inset-x-0 bottom-[33.3%] border-t border-dashed border-(--rule)"
				/>
				<span
					aria-hidden="true"
					className="absolute inset-x-0 bottom-[66.6%] border-t border-dashed border-(--rule)"
				/>
				<div className="absolute inset-0 flex items-end gap-[14px]">
					{BARS.map((bar) => (
						<div
							key={bar.month}
							className="relative flex h-full flex-1 items-end justify-center"
						>
							<span
								className="absolute inset-x-0 -translate-y-[6px] text-center font-mono text-[11px] tabular-nums text-(--ink-3)"
								style={{
									bottom: bar.pct,
									opacity: settled ? 1 : 0,
									transition: reduced
										? undefined
										: `opacity .5s var(--lp-ease) ${bar.labelDelay}`,
								}}
							>
								{bar.value}
							</span>
							<span
								aria-hidden="true"
								className="rounded-t-[4px]"
								style={{
									width: "min(58%,46px)",
									height: bar.pct,
									background: bar.fill,
									transformOrigin: "bottom",
									transform: settled ? "scaleY(1)" : "scaleY(0)",
									transition: reduced
										? undefined
										: `transform .8s var(--lp-ease) ${bar.delay}`,
								}}
							/>
						</div>
					))}
				</div>
			</div>
			<div className="mt-2 flex gap-[14px]">
				{BARS.map((bar) => (
					<span
						key={bar.month}
						className="flex-1 text-center text-xs text-(--ink-3)"
					>
						{bar.month}
					</span>
				))}
			</div>
		</div>
	);
}

export function Numbers() {
	return (
		<Section id="numbers" scheme="sheet">
			<div
				className="grid items-center gap-[clamp(28px,4vw,64px)]"
				style={{
					gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,360px),1fr))",
				}}
			>
				<div>
					<Eyebrow>Your numbers</Eyebrow>
					<SectionHeading size="md">
						Know where the month stands without opening a spreadsheet.
					</SectionHeading>
					<Lede className="max-w-[32rem]">
						Set a revenue goal and watch it fill. See what&apos;s quoted, what&apos;s
						outstanding, and which clients are worth the drive — read straight off
						your real quotes and invoices.
					</Lede>
				</div>

				{/* On the sheet band the featured card inverts to paper. */}
				<figure className="overflow-hidden rounded-2xl border border-(--rule-2) bg-(--paper)">
					<figcaption className="flex items-baseline justify-between gap-3 border-b border-(--rule) px-[22px] py-[18px]">
						<span className="text-[15px] font-semibold tracking-[-0.01em]">
							Revenue · last 6 months
						</span>
						<span className="text-[13px] text-(--ink-3)">Illustrative figures</span>
					</figcaption>
					<div className="p-[22px]">
						<div className="flex flex-wrap items-baseline gap-[14px]">
							<span className="text-[clamp(28px,3.4vw,40px)] font-semibold tracking-[-0.03em] tabular-nums">
								$38,420
							</span>
							<span className="text-[14px] font-semibold text-(--paid)">
								77% of $50,000 goal
							</span>
						</div>
						<div
							className="mt-[14px] h-[9px] overflow-hidden rounded-full"
							style={{ background: "color-mix(in oklch, var(--ink) 8%, transparent)" }}
						>
							<div
								className="h-full w-[77%] rounded-full"
								style={{
									background: "linear-gradient(90deg,var(--accent),var(--paid))",
								}}
							/>
						</div>
						<RevenueBars />
					</div>
				</figure>
			</div>
		</Section>
	);
}
