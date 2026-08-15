"use client";

import SimpleGraph, { type DataPoint } from "@/components/react-bits/simple-graph";
import { formatCurrency } from "@/lib/money";
import { Eyebrow, Lede, Section, SectionHeading } from "../primitives";
import { usePrefersReducedMotion } from "../use-reduced-motion";

/* NUMBERS — sheet band. Copy and figures verbatim from the comp
 * (design-import/OneTool Landing.dc.html, lines 382–424). One chart only: the
 * goal bar states where the period stands, the line states how it got there.
 * Client component because the line draws itself on scroll and reduced motion
 * has to be able to switch that off. */

const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"];

/* The six months have to add up to the figure above the chart, or hovering a
   point contradicts the headline. Sum === BOOKED. */
const REVENUE = [4120, 5340, 5880, 6910, 7290, 8880];
const BOOKED = REVENUE.reduce((a, b) => a + b, 0);
const GOAL = 50000;
const PERCENT = Math.round((BOOKED / GOAL) * 100);

const SERIES: DataPoint[] = REVENUE.map((value, i) => ({
	value,
	label: MONTHS[i],
}));

/* Accent as a literal: SimpleGraph feeds the colour into SVG stroke/gradient
 * attributes, which never resolve a CSS custom property. Matches --accent. */
const ACCENT = "#00a6f4";

/** Shared by the plot and the label row — the labels only sit under their
 *  points while both use the same horizontal inset. */
const GRAPH_INSET_X = 10;

/** Six-month revenue line: draws once when the chart scrolls into view, then
 * settles. Reduced motion collapses the draw to nothing so the data is never
 * withheld. */
function RevenueLine() {
	const reduced = usePrefersReducedMotion();

	return (
		<div
			role="img"
			aria-label={`Line chart of monthly revenue from April to September, trending upward from ${formatCurrency(REVENUE[0], { whole: true })} to ${formatCurrency(REVENUE[REVENUE.length - 1], { whole: true })}`}
			className="mt-6"
		>
			<SimpleGraph
				data={SERIES}
				className="text-(--ink)"
				height={190}
				lineColor={ACCENT}
				dotColor={ACCENT}
				dotSize={5}
				dotRingColor="var(--paper)"
				paddingX={GRAPH_INSET_X}
				paddingY={20}
				graphLineThickness={2.5}
				gridStyle="dashed"
				gridLines="both"
				curved
				gradientFade
				animateOnScroll={!reduced}
				animationDuration={reduced ? 0 : 1.6}
				formatValue={(value) => formatCurrency(value, { whole: true })}
			/>
			{/* Absolute, not equal-flex: flex centres each label in its own sixth,
			    which is half a step off the data points. */}
			<div className="relative mt-2 h-4" style={{ marginInline: `${GRAPH_INSET_X}px` }}>
				{MONTHS.map((month, i) => (
					<span
						key={month}
						style={{ left: `${(i / (MONTHS.length - 1)) * 100}%` }}
						className="absolute -translate-x-1/2 text-xs leading-4 text-(--ink-3)"
					>
						{month}
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
						outstanding, and which clients are worth the drive, read straight off
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
								{formatCurrency(BOOKED, { whole: true })}
							</span>
							<span className="text-[14px] font-semibold text-(--paid)">
								{PERCENT}% of {formatCurrency(GOAL, { whole: true })} goal
							</span>
						</div>
						<div
							className="mt-[14px] h-[9px] overflow-hidden rounded-full"
							style={{ background: "color-mix(in oklch, var(--ink) 8%, transparent)" }}
						>
							<div
								className="h-full rounded-full"
								style={{
									width: `${PERCENT}%`,
									background: "linear-gradient(90deg,var(--accent),var(--paid))",
								}}
							/>
						</div>
						<RevenueLine />
					</div>
				</figure>
			</div>
		</Section>
	);
}
