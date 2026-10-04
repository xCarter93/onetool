"use client";

import { useId, useRef } from "react";
import { ChartStripeDefs, stripeId } from "@/components/charts/chart-stripe-defs";
import { formatCurrency } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useRevealOnce } from "../use-reveal-once";
import {
	FOOTNOTE_SOURCES,
	RETRIEVED_LABEL,
	VENDORS,
	quoteFor,
	type Vendor,
	type VendorKey,
} from "./competitor-data";

const MAX_CREW = 20;
const X_TICKS = [1, 5, 10, 15, 20];
const Y_STEP = 100;

const LINE_STYLE: Record<VendorKey, { stroke: string; dash?: string }> = {
	onetool: { stroke: "var(--accent-ink)" },
	jobber: { stroke: "var(--ink-2)", dash: "6 5" },
	housecall: { stroke: "var(--ink-3)", dash: "0 5" },
	joby: { stroke: "var(--ink-2)", dash: "12 5 0 5" },
};

type Point = { crew: number; monthly: number };
type Series = { vendor: Vendor; points: Point[] };

// The line ends at the first crew size the vendor can't price.
function pricedRun(v: Vendor): Point[] {
	const points: Point[] = [];
	for (let crew = 1; crew <= MAX_CREW; crew++) {
		const quote = quoteFor(v, crew);
		if (!quote) break;
		points.push({ crew, monthly: quote.monthly });
	}
	return points;
}

const SERIES: Series[] = VENDORS.map((vendor) => ({ vendor, points: pricedRun(vendor) })).filter(
	(s) => s.points.length > 0,
);
const Y_MAX = Math.ceil(Math.max(...SERIES.flatMap((s) => s.points.map((p) => p.monthly))) / Y_STEP) * Y_STEP;
const Y_TICKS = Array.from({ length: Y_MAX / Y_STEP + 1 }, (_, i) => i * Y_STEP);
const STOPPED = SERIES.filter((s) => s.points.length < MAX_CREW);

const money = (n: number) => formatCurrency(n, { whole: true });
// Each crew size is a tread one unit wide, so the marker always sits on a flat run, never a riser.
const xLeft = (crew: number) => (crew - 1) / MAX_CREW;
const xMid = (crew: number) => (crew - 0.5) / MAX_CREW;
const yUp = (monthly: number) => monthly / Y_MAX;
const pct = (fraction: number) => `${fraction * 100}%`;

function stepPath(points: Point[], w: number, h: number): string {
	return points
		.map((p, i) => {
			const y = (1 - yUp(p.monthly)) * h;
			return `${i === 0 ? `M${xLeft(p.crew) * w} ` : "V"}${y}H${xLeft(p.crew + 1) * w}`;
		})
		.join("");
}

function describe({ vendor, points }: Series): string {
	const first = points[0];
	const last = points[points.length - 1];
	if (first.monthly === last.monthly && last.crew === MAX_CREW) {
		return `${vendor.name} ${money(first.monthly)} at every size.`;
	}
	const stop = last.crew < MAX_CREW ? ", then no published price" : "";
	return `${vendor.name} from ${money(first.monthly)} for one person to ${money(last.monthly)} for ${last.crew}${stop}.`;
}

const SUMMARY = [`Published monthly price by crew size, 1 to ${MAX_CREW} people.`, ...SERIES.map(describe)].join(" ");

const stopList = new Intl.ListFormat("en-US").format(
	STOPPED.map((s) => `${s.vendor.name} at ${s.points.length} seats`),
);

const SOURCE_URL = Object.fromEntries(FOOTNOTE_SOURCES.map((s) => [s.name, s.url]));

function Source({ name }: { name: (typeof FOOTNOTE_SOURCES)[number]["name"] }) {
	return (
		<a
			href={SOURCE_URL[name]}
			target="_blank"
			rel="noopener noreferrer"
			className="underline decoration-(--rule-3) underline-offset-2 transition-colors hover:text-(--ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)"
		>
			{name}
		</a>
	);
}

function LineKey({ vendorKey }: { vendorKey: VendorKey }) {
	const style = LINE_STYLE[vendorKey];
	return (
		<svg aria-hidden="true" width="24" height="6" className="flex-none overflow-visible">
			<line
				x1="1"
				x2="23"
				y1="3"
				y2="3"
				stroke={style.stroke}
				strokeWidth={vendorKey === "onetool" ? 2.5 : 2}
				strokeDasharray={style.dash}
				strokeLinecap="round"
			/>
		</svg>
	);
}

/** `width`/`height` are the viewBox; the plot box keeps that aspect so the HTML labels' percentages land on the SVG. */
export function CompareChart({ crew, width, height }: { crew: number; width: number; height: number }) {
	const figure = useRef<HTMLElement>(null);
	useRevealOnce(figure);
	const id = useId();
	const us = SERIES.find((s) => s.vendor.isUs);
	const markerX = xMid(crew) * width;

	return (
		<figure ref={figure} className="grid gap-5">
			<div className="pb-11 pl-10 pt-7">
				<div className="relative" style={{ aspectRatio: `${width} / ${height}` }}>
					<svg
						role="img"
						aria-label={SUMMARY}
						viewBox={`0 0 ${width} ${height}`}
						className="absolute inset-0 size-full overflow-visible"
					>
						<ChartStripeDefs colors={["var(--accent)"]} idPrefix={id} />
						<defs>
							{SERIES.map(({ vendor: v, points }) => (
								<mask key={v.key} id={`${id}-mask-${v.key}`} maskUnits="userSpaceOnUse">
									<path d={stepPath(points, width, height)} pathLength={1} className="lp-cmp-draw" />
								</mask>
							))}
						</defs>
						{Y_TICKS.map((t) => (
							<line
								key={t}
								x1={0}
								x2={width}
								y1={(1 - yUp(t)) * height}
								y2={(1 - yUp(t)) * height}
								stroke={t === 0 ? "var(--rule-2)" : "var(--rule)"}
								vectorEffect="non-scaling-stroke"
							/>
						))}
						{us && (
							<path
								d={`${stepPath(us.points, width, height)}V${height}H${xLeft(us.points[0].crew) * width}Z`}
								fill={`url(#${stripeId(id, 0)})`}
								className="lp-cmp-fade"
							/>
						)}
						<line
							x1={markerX}
							x2={markerX}
							y1={0}
							y2={height}
							stroke="var(--rule-3)"
							vectorEffect="non-scaling-stroke"
						/>
						{[...SERIES].reverse().map(({ vendor: v, points }) => (
							<path
								key={v.key}
								d={stepPath(points, width, height)}
								mask={`url(#${id}-mask-${v.key})`}
								stroke={LINE_STYLE[v.key].stroke}
								strokeDasharray={LINE_STYLE[v.key].dash}
								className={cn("lp-cmp-line", v.isUs && "lp-cmp-line-us")}
							/>
						))}
					</svg>

					<div aria-hidden="true" className="tabular-nums">
						<span className="absolute -left-10 bottom-[calc(100%+10px)] whitespace-nowrap text-2xs leading-none text-(--ink-3)">
							Per month
						</span>
						{Y_TICKS.map((t) => (
							<span
								key={t}
								className="absolute right-[calc(100%+8px)] translate-y-1/2 text-2xs leading-none text-(--ink-3)"
								style={{ bottom: pct(yUp(t)) }}
							>
								{money(t)}
							</span>
						))}
						{X_TICKS.map((n) => (
							<span
								key={n}
								className="absolute top-[calc(100%+8px)] -translate-x-1/2 text-2xs leading-none text-(--ink-3)"
								style={{ left: pct(xMid(n)) }}
							>
								{n}
							</span>
						))}
						<span className="absolute right-0 top-[calc(100%+28px)] text-2xs leading-none text-(--ink-3)">
							Crew size
						</span>
						{SERIES.map(({ vendor: v, points }) => {
							const end = points[points.length - 1];
							return (
								<span
									key={v.key}
									className={cn(
										"lp-cmp-fade absolute -translate-x-full whitespace-nowrap rounded-sm bg-(--sheet) px-1 text-xs leading-4",
										v.isUs ? "font-semibold text-(--ink)" : "font-medium text-(--ink-2)",
									)}
									style={{ left: pct(xLeft(end.crew + 1)), bottom: `calc(${pct(yUp(end.monthly))} + 4px)` }}
								>
									{v.name}
								</span>
							);
						})}
						{SERIES.map(({ vendor: v }) => {
							const quote = quoteFor(v, crew);
							if (!quote) return null;
							return (
								<span
									key={v.key}
									className="lp-cmp-fade absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-(--sheet)"
									style={{
										left: pct(xMid(crew)),
										top: pct(1 - yUp(quote.monthly)),
										background: LINE_STYLE[v.key].stroke,
									}}
								/>
							);
						})}
					</div>
				</div>
			</div>

			<div className="grid gap-2">
				<p className="text-xs text-(--ink-2)">At a crew of {crew}</p>
				<ul className="flex flex-wrap gap-x-5 gap-y-2">
					{VENDORS.map((v) => {
						const quote = quoteFor(v, crew);
						return (
							<li key={v.key} className="flex items-center gap-2 whitespace-nowrap text-xs text-(--ink-2)">
								<LineKey vendorKey={v.key} />
								<span>{v.name}</span>
								{quote ? (
									<>
										<span className="font-semibold tabular-nums text-(--ink)">{money(quote.monthly)}</span>
										<span className="text-(--ink-3)">{quote.planName}</span>
									</>
								) : (
									<span className="text-(--ink-3)">Not published</span>
								)}
							</li>
						);
					})}
				</ul>
				{STOPPED.length > 0 && (
					<p className="text-xs text-(--ink-2)">Lines stop where published prices end: {stopList}.</p>
				)}
			</div>

			<figcaption className="max-w-[46rem] text-xs leading-[1.65] text-(--ink-2)">
				Prices are month-to-month list prices from each vendor&rsquo;s own pricing page on{" "}
				{RETRIEVED_LABEL}. Each point is the cheapest plan that covers that many people:{" "}
				<Source name="Jobber" /> prices by team size, each <Source name="Housecall Pro" /> plan includes a
				set number of users, and OneTool and <Source name="Joby" /> charge one flat price for the team.{" "}
				<Source name="Workiz" /> publishes no base price, so it has no line. Committing to a year costs
				less at three of the five: Jobber from {money(29)} a month, Housecall Pro from {money(59)} a month,
				OneTool {money(300)} a year. Joby publishes no annual rate.
			</figcaption>
		</figure>
	);
}
