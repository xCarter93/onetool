import { ChartArea } from "lucide-react";
import { ChartStripeDefs, stripeId } from "@/components/charts/chart-stripe-defs";
import { formatCurrency } from "@/lib/money";
import { cn } from "@/lib/utils";
import { PanelBar } from "./feature";

// The "Revenue by month" preset (paid invoices, This Year) as of Tue Oct 6, so October is month to date.
const MONTHS = [
	{ label: "Jan 2026", value: 14862.35 },
	{ label: "Feb 2026", value: 13407.9 },
	{ label: "Mar 2026", value: 21936.15 },
	{ label: "Apr 2026", value: 38214.6 },
	{ label: "May 2026", value: 47583.25 },
	{ label: "Jun 2026", value: 45120.8 },
	{ label: "Jul 2026", value: 42768.4 },
	{ label: "Aug 2026", value: 44091.75 },
	{ label: "Sep 2026", value: 52377.7 },
	{ label: "Oct 2026", value: 18592.75 },
];
const TOTAL = MONTHS.reduce((sum, month) => sum + month.value, 0);
// recharts' nice ticks for a 52K max.
const TICKS = [60000, 45000, 30000, 15000, 0];
const PEAK = 8;
const STRIPES = "lp-reports-stripe";
const AREA_CLIP = "lp-reports-area";

type Point = { x: number; y: number };

// Plot space is 0 to 100 on both axes; the line is stretched to fit, the stripes and dots are not.
const POINTS: Point[] = MONTHS.map((month, index) => ({
	x: (index / (MONTHS.length - 1)) * 100,
	y: (1 - month.value / TICKS[0]) * 100,
}));

// d3's curveMonotoneX, which recharts draws for type="monotone", on evenly spaced points.
function monotonePath(points: Point[]) {
	const step = points[1].x - points[0].x;
	const last = points.length - 1;
	const slope = (index: number) => (points[index + 1].y - points[index].y) / step;
	const tangents = points.map((_, index) => {
		if (index === 0 || index === last) return 0;
		const before = slope(index - 1);
		const after = slope(index);
		return (
			(Math.sign(before) + Math.sign(after)) *
			Math.min(Math.abs(before), Math.abs(after), Math.abs(before + after) / 4)
		);
	});
	tangents[0] = (3 * slope(0) - tangents[1]) / 2;
	tangents[last] = (3 * slope(last - 1) - tangents[last - 1]) / 2;
	const round = (value: number) => Math.round(value * 100) / 100;
	const third = step / 3;
	return points.slice(1).reduce((path, point, index) => {
		const from = points[index];
		const controls = [
			from.x + third,
			from.y + third * tangents[index],
			point.x - third,
			point.y - third * tangents[index + 1],
			point.x,
			point.y,
		].map(round);
		return `${path} C${controls.join(" ")}`;
	}, `M${points[0].x} ${round(points[0].y)}`);
}

const LINE = monotonePath(POINTS);
const AREA = `${LINE} L100 100 L0 100 Z`;

// recharts drops crowded month labels from the start and keeps the last one.
function labelVisibility(index: number) {
	const fromEnd = MONTHS.length - 1 - index;
	return cn(
		fromEnd % 3 === 0 ? "block" : "hidden",
		fromEnd % 2 === 0 ? "@sm:block" : "@sm:hidden",
		"@2xl:block"
	);
}

export function ReportsCell() {
	const peak = POINTS[PEAK];
	return (
		<div className="flex h-full flex-col">
			<PanelBar>
				<span className="flex min-w-0 items-center gap-2">
					<ChartArea aria-hidden="true" className="size-4 shrink-0 text-(--accent-ink)" />
					<span className="truncate text-sm font-semibold text-(--ink)">Revenue by month</span>
				</span>
				<span className="shrink-0 rounded-sm border border-(--rule-2) px-2 py-0.5 text-xs font-medium text-(--ink-2)">
					This Year
				</span>
			</PanelBar>

			<div className="flex items-center justify-between gap-3 px-4 pt-3 text-sm">
				<span className="text-(--ink-3)">{MONTHS.length} data points</span>
				<span className="font-medium tabular-nums text-(--ink)">
					Total: {formatCurrency(TOTAL, { compact: true })}
				</span>
			</div>

			<div className="grid min-h-0 flex-1 grid-cols-[2.75rem_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] pb-3 pl-1 pr-7 pt-5">
				<div className="relative">
					{TICKS.map((tick) => (
						<span
							key={tick}
							className="absolute right-2.5 -translate-y-1/2 text-2xs tabular-nums text-(--ink-3)"
							style={{ top: `${(1 - tick / TICKS[0]) * 100}%` }}
						>
							{formatCurrency(tick, { compact: true })}
						</span>
					))}
				</div>

				<div className="relative">
					<svg className="absolute inset-0 size-full overflow-visible">
						<ChartStripeDefs idPrefix={STRIPES} colors={["var(--accent-ink)"]} />
						<clipPath id={AREA_CLIP} clipPathUnits="objectBoundingBox">
							<path d={AREA} transform="scale(0.01)" />
						</clipPath>
						{TICKS.map((tick) => {
							const y = `${(1 - tick / TICKS[0]) * 100}%`;
							return (
								<line key={tick} x1="0" x2="100%" y1={y} y2={y} strokeDasharray="3 3" className="stroke-(--rule-2)" />
							);
						})}
						<rect width="100%" height="100%" fill={`url(#${stripeId(STRIPES, 0)})`} clipPath={`url(#${AREA_CLIP})`} />
						<line
							x1={`${peak.x}%`}
							x2={`${peak.x}%`}
							y1="0"
							y2="100%"
							strokeDasharray="3 3"
							className="stroke-(--accent-ink)"
						/>
						<svg viewBox="0 0 100 100" preserveAspectRatio="none" className="overflow-visible">
							<path
								d={LINE}
								fill="none"
								strokeWidth={2}
								vectorEffect="non-scaling-stroke"
								className="stroke-(--accent-ink)"
							/>
						</svg>
						{POINTS.map((point, index) => (
							<circle
								key={MONTHS[index].label}
								cx={`${point.x}%`}
								cy={`${point.y}%`}
								r={index === PEAK ? 7 : 5}
								strokeWidth={2}
								className="fill-(--accent-ink) stroke-(--sheet)"
							/>
						))}
					</svg>

					{/* The hover tooltip, flipped left of the cursor as recharts does near the right edge. */}
					<div
						className="absolute grid min-w-32 gap-1.5 rounded-lg border border-(--rule-2) bg-(--sheet) px-2.5 py-1.5 text-xs shadow-(--lp-shadow)"
						style={{ right: `calc(${100 - peak.x}% + 10px)`, top: "40%" }}
					>
						<p className="font-medium text-(--ink)">{MONTHS[PEAK].label}</p>
						<p className="flex items-center gap-2">
							<span className="size-2.5 shrink-0 rounded-[2px] bg-(--accent-ink)" />
							<span className="flex flex-1 justify-between gap-4">
								<span className="text-(--ink-3)">Amount</span>
								<span className="font-medium tabular-nums text-(--ink)">
									{formatCurrency(MONTHS[PEAK].value, { whole: true })}
								</span>
							</span>
						</p>
					</div>
				</div>

				<div className="relative col-start-2 mt-2.5 h-4">
					{MONTHS.map((month, index) => (
						<span
							key={month.label}
							className={cn(
								"absolute top-0 -translate-x-1/2 whitespace-nowrap text-2xs text-(--ink-3)",
								labelVisibility(index)
							)}
							style={{ left: `${POINTS[index].x}%` }}
						>
							{month.label}
						</span>
					))}
				</div>
			</div>
		</div>
	);
}
