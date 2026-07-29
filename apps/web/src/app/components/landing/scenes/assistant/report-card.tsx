import type { CSSProperties } from "react";
import { LeaderLine } from "../../blueprint/leader-line";
import {
	BAR_COLORS,
	BAR_PATHS,
	LEADER_BODY,
	LEADER_BOX,
	LEADER_FROM,
	LEADER_LABEL,
	LEADER_SHOULDER,
	LEADER_TO,
	PLOT_GRID,
	PLOT_H,
	PLOT_W,
	REVENUE,
	REVENUE_CATEGORIES,
	REVENUE_TOTAL,
	STRIPE_ID_PREFIX,
	T,
} from "./assistant-data";

/**
 * The `runReport` generative card — the only assistant tool in this scene that
 * renders real UI rather than a chip, and the reason this exchange was chosen.
 *
 * The mark is OneTool's own: diagonal-stripe pattern fill plus a 1px solid
 * stroke in the same categorical hue, dashed 3-3 horizontal grid, no axis line,
 * 11px muted ticks. The pattern recipe is reproduced from
 * components/charts/chart-stripe-defs.tsx rather than imported — that module is
 * "use client", and importing it would drag a client boundary into an otherwise
 * fully server-rendered scene for eight lines of static SVG. Workspace files
 * are not touched.
 *
 * Pattern ids are static rather than useId-derived: this scene mounts exactly
 * once per page (it is one act of one rail), so there is nothing to collide
 * with, and a static id keeps the component on the server. Anything reusable
 * would need the sanitized-useId route.
 */

/** Verbatim recipe from ChartStripeDefs: 8x8 tile, tinted ground, two offset diagonals. */
function StripePattern({ id, color }: { id: string; color: string }) {
	return (
		<pattern id={id} patternUnits="userSpaceOnUse" width={8} height={8}>
			<rect width={8} height={8} fill={color} opacity={0.1} />
			<path
				d="M0,8 L8,0 M4,12 L12,4 M-4,4 L4,-4"
				stroke={color}
				strokeWidth={1.5}
				opacity={0.6}
			/>
			<path
				d="M2,10 L10,2 M6,14 L14,6 M-2,6 L6,-2"
				stroke={color}
				strokeWidth={1}
				opacity={0.3}
			/>
		</pattern>
	);
}

export function ReportCard() {
	return (
		<div
			className="bp-rise relative rounded-xl border border-border bg-card p-3"
			style={{ "--bp-delay": `${T.card}s` } as CSSProperties}
		>
			{/*
			 * The scene's ONE annotation device. Anchored to this card so the
			 * geometry cannot drift as the transcript reflows, and hidden below lg
			 * where the gutter it lands in does not exist.
			 */}
			<div
				className="pointer-events-none absolute left-full top-1/2 hidden lg:block"
				style={{ transform: "translateY(-100%)" }}
			>
				<svg
					aria-hidden="true"
					focusable="false"
					width={LEADER_BOX.w}
					height={LEADER_BOX.h}
					className="overflow-visible"
				>
					<LeaderLine
						from={LEADER_FROM}
						to={LEADER_TO}
						shoulder={LEADER_SHOULDER}
						draw
						delay={T.leader}
					/>
				</svg>
				<p
					className="bp-rise absolute max-w-[9rem]"
					style={
						{
							left: LEADER_TO[0] + LEADER_SHOULDER + 6,
							top: LEADER_TO[1],
							transform: "translateY(-50%)",
							"--bp-delay": `${T.leader + 0.45}s`,
						} as CSSProperties
					}
				>
					<span className="block text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-bp-anno">
						{LEADER_LABEL}
					</span>
					<span className="mt-1 block text-xs leading-snug text-muted-foreground">
						{LEADER_BODY}
					</span>
				</p>
			</div>

			{/* The report chart's own summary row. */}
			<div
				className="bp-fade-in flex items-baseline justify-between gap-3 text-sm"
				style={{ "--bp-delay": `${T.plotLabels}s` } as CSSProperties}
			>
				<span className="text-muted-foreground">{REVENUE_CATEGORIES}</span>
				<span className="font-medium tabular-nums text-foreground">
					Total: {REVENUE_TOTAL}
				</span>
			</div>

			{/*
			 * The only thing the drawing says that the surrounding text does not:
			 * the per-month figures. Everything else in this scene — the question,
			 * the chip, the total, the answer — is already real DOM text, so this
			 * is the whole accessible surface the artwork needs.
			 */}
			<p className="sr-only">
				Revenue by month from paid invoices:{" "}
				{REVENUE.map((bar) => `${bar.month} ${bar.amount}`).join(", ")}.
			</p>

			{/*
			 * Artwork: aria-hidden, with every figure duplicated above. Uniform
			 * scaling only — preserveAspectRatio is never set, which is what keeps
			 * the axis labels below locked to bar centres.
			 */}
			<svg
				aria-hidden="true"
				focusable="false"
				viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
				className="mt-3 h-auto w-full"
			>
				<defs>
					{BAR_COLORS.map((color, i) => (
						<StripePattern
							key={`${STRIPE_ID_PREFIX}-${i}`}
							id={`${STRIPE_ID_PREFIX}-${i}`}
							color={color}
						/>
					))}
				</defs>

				<g stroke="var(--border)" strokeWidth={1} fill="none">
					{PLOT_GRID.map((line) => (
						<line
							key={`grid-${line.y1}`}
							x1={line.x1}
							y1={line.y1}
							x2={line.x2}
							y2={line.y2}
							strokeDasharray="3 3"
							strokeLinecap="butt"
						/>
					))}
				</g>

				{BAR_PATHS.map((d, i) => (
					<path
						key={REVENUE[i].label}
						d={d}
						className="bp-rise"
						fill={`url(#${STRIPE_ID_PREFIX}-${i})`}
						stroke={BAR_COLORS[i]}
						strokeWidth={1}
						style={
							{ "--bp-delay": `${T.bars + i * T.barStep}s` } as CSSProperties
						}
					/>
				))}
			</svg>

			{/* Real DOM text, 11px muted with tabular figures — the product's tick
			    style. aria-hidden because six bare month names without their values
			    are noise; the sr-only summary pairs each month with its amount. */}
			<div
				aria-hidden="true"
				className="bp-fade-in mt-1.5 grid grid-cols-6"
				style={{ "--bp-delay": `${T.plotLabels}s` } as CSSProperties}
			>
				{REVENUE.map((bar) => (
					<span
						key={bar.label}
						className="text-center text-[11px] leading-none tabular-nums text-muted-foreground"
					>
						{bar.label}
					</span>
				))}
			</div>
		</div>
	);
}
