import type { CSSProperties } from "react";
import { BP_DASH } from "@/lib/blueprint/geometry";
import { cn } from "@/lib/utils";
import { Annotation } from "../blueprint/annotation";
import { BlueprintCanvas } from "../blueprint/blueprint-canvas";
import { BP_FILL, BP_MARKER_ARROW_INK } from "../blueprint/blueprint-defs";
import { DraftedShape } from "../blueprint/drafted-shape";
import { GuideLines } from "../blueprint/guide-lines";
import { LeaderLine, leaderAnchor } from "../blueprint/leader-line";
import { VertexTick } from "../blueprint/vertex-tick";
import {
	CUT_BAND,
	EDGES,
	LANE_RULES,
	LANES,
	LEADER,
	LIVE_NODE,
	MAIN_BLOCKS,
	RULE_NODES,
	STACK,
	SUPPORT_BLOCKS,
	VIEW_BOX,
	type Block,
} from "./feature-detail-data";

/**
 * A-501 — the system diagram.
 *
 * The trade's own single-line diagram, not a UI mock: three swimlanes (your
 * office, the client's portal, the background), nine labelled blocks, and every
 * run tagged with the transition it actually carries.
 *
 * TWO INKS. Blocks are object ink (`--bp-line-strong`) because they are the
 * things; runs and their tags are construction ink (sky) because they are the
 * relationships between things. Lane rules and the header column are the
 * quietest ink of the three, which is the hierarchy that makes this read as
 * drafted rather than drawn.
 *
 * DASH GRAMMAR. Solid = a hand-off you make. Long-short-long (`BP_DASH.centre`)
 * = a control run: something the system does on its own. That is deliberately
 * NOT the product canvas's `5 4`, which means "this segment does not exist yet"
 * — reusing it here would have said the automated flows are unbuilt.
 *
 * MOTION is the kit's CSS draw-on throughout: one <DrawIn> ancestor flips
 * `.bp-in` and every mark fires on its own `--bp-delay`, in flow order. Dashed
 * runs fade rather than draw (the draw technique owns strokeDasharray), and
 * every arrowhead is a separate 6-unit stub so the marker cannot appear before
 * its line — markers ignore strokeDasharray. Reduced motion and no-JS both land
 * on the finished still.
 *
 * Server component. Zero JS of its own.
 */

const delayStyle = (delay: number) =>
	({ "--bp-delay": `${delay}s` }) as CSSProperties;

/* ---------------------------------------------------------------------------
 * Artwork — lg and up
 * ------------------------------------------------------------------------- */

function BlockLabel({ block }: { block: Block }) {
	return (
		<Annotation
			at={block.at}
			viewBox={VIEW_BOX}
			align="center"
			eyebrow={block.name}
			tone="strong"
			appear
			delay={block.delay + 0.2}
			className={cn("px-1", block.widthClass)}
		>
			{block.detail}
		</Annotation>
	);
}

export function SystemSchematic() {
	return (
		<div className="pointer-events-none absolute inset-0 hidden lg:block">
			<BlueprintCanvas
				viewBox={`0 0 ${VIEW_BOX[0]} ${VIEW_BOX[1]}`}
				className="absolute inset-0"
			>
				{/* The section cut between your side of the job and the client's. */}
				<path
					d={CUT_BAND}
					fill={BP_FILL.hatch45}
					stroke="none"
					className="bp-fade-in"
					style={delayStyle(0.1)}
				/>

				{/* Lane rules + the header column. Quietest ink on the sheet. */}
				<g className="bp-fade-in" style={delayStyle(0.06)}>
					<GuideLines guides={LANE_RULES} dash="none" tone="strong" />
				</g>

				{/* Registration ticks where the header rule crosses each lane rule. */}
				<g className="bp-fade-in" style={delayStyle(0.14)}>
					{RULE_NODES.map(([x, y], i) => (
						<VertexTick key={`${x},${y}`} x={x} y={y} live={i === LIVE_NODE} />
					))}
				</g>

				{/* Blocks. */}
				{[...MAIN_BLOCKS, ...SUPPORT_BLOCKS].map((block) => (
					<DraftedShape
						key={block.id}
						d={block.d}
						tone="strong"
						weight="med"
						fill="var(--bp-paper)"
						draw
						delay={block.delay}
					/>
				))}

				{/* Runs. */}
				{EDGES.map((e) =>
					e.dashed ? (
						<DraftedShape
							key={e.id}
							d={e.d}
							tone="ink"
							weight="med"
							dash={BP_DASH.centre}
							className="bp-fade-in"
							style={delayStyle(e.delay)}
						/>
					) : (
						<DraftedShape
							key={e.id}
							d={e.d}
							tone="ink"
							weight="med"
							draw
							delay={e.delay}
						/>
					),
				)}

				{/* Arrowheads, on their own stubs so they land with the run. */}
				<g className="stroke-bp-ink" fill="none">
					{EDGES.map((e) => (
						<g
							key={e.id}
							className="bp-fade-in"
							style={{
								strokeWidth: "var(--lw-med)",
								...delayStyle(e.delay + 0.4),
							}}
						>
							<path
								d={e.head}
								markerEnd={BP_MARKER_ARROW_INK}
								vectorEffect="non-scaling-stroke"
							/>
							{e.tail ? (
								<path
									d={e.tail}
									markerEnd={BP_MARKER_ARROW_INK}
									vectorEffect="non-scaling-stroke"
								/>
							) : null}
						</g>
					))}
				</g>

				{/* The sheet's ONE annotation device. */}
				<LeaderLine
					from={LEADER.from}
					to={LEADER.bend}
					shoulder={LEADER.shoulder}
					draw
					delay={LEADER.delay}
				/>
			</BlueprintCanvas>

			{/* Lane names — the swimlane header column. */}
			{LANES.map((lane, i) => (
				<Annotation
					key={lane.id}
					at={lane.at}
					viewBox={VIEW_BOX}
					align="start"
					eyebrow={lane.name}
					appear
					delay={0.16 + i * 0.06}
					className="max-w-[6.5rem]"
				>
					{lane.note}
				</Annotation>
			))}

			{/* Block labels. */}
			{[...MAIN_BLOCKS, ...SUPPORT_BLOCKS].map((block) => (
				<BlockLabel key={block.id} block={block} />
			))}

			{/* Run tags. Construction ink, tracked caps — the eyebrow slot only. */}
			{EDGES.map((e) => (
				<Annotation
					key={e.id}
					at={e.at}
					viewBox={VIEW_BOX}
					align={e.align}
					eyebrow={e.label}
					appear
					delay={e.labelDelay}
					className={e.labelClass}
				/>
			))}

			<Annotation
				at={leaderAnchor(LEADER.from, LEADER.bend, LEADER.shoulder)}
				viewBox={VIEW_BOX}
				align="start"
				eyebrow={LEADER.eyebrow}
				appear
				delay={LEADER.labelDelay}
				className="max-w-[13rem]"
			>
				{LEADER.body}
			</Annotation>
		</div>
	);
}

/* ---------------------------------------------------------------------------
 * Below lg — the same diagram, stacked
 *
 * A vertical run: a solid spine down the left with a tick at each station, the
 * transition tag sitting on the spine between stations, and the background taps
 * hanging off the station they touch on their own dashed stub. No SVG, no
 * measurement, and nothing that can scroll sideways.
 * ------------------------------------------------------------------------- */

export function SchematicStack() {
	return (
		<ol className="lg:hidden">
			{STACK.map((step, i) => (
				<li key={step.id}>
					{step.via ? (
						<p className="flex items-center gap-2 py-2 pl-[9px]">
							<span
								aria-hidden="true"
								className="h-6 w-px shrink-0 bg-bp-line-strong"
							/>
							<span className="text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-bp-anno">
								{step.via}
							</span>
						</p>
					) : null}

					<div
						className="flex gap-3 border border-bp-line-strong bg-bp-paper px-3 py-2.5 bp-rise"
						style={delayStyle(0.05 + i * 0.06)}
					>
						<span
							aria-hidden="true"
							className="mt-1.5 h-[5px] w-[5px] shrink-0 border border-bp-line-strong"
						/>
						<span className="min-w-0">
							<span className="block text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-bp-anno">
								{step.name}
								<span className="ml-2 font-medium normal-case tracking-[0.06em] text-muted-foreground">
									{step.lane}
								</span>
							</span>
							<span className="mt-1.5 block text-sm font-medium leading-snug tabular-nums text-foreground">
								{step.detail}
							</span>
						</span>
					</div>

					{step.taps?.map((tap) => (
						<div
							key={tap.label}
							className="ml-[9px] border-l border-dashed border-bp-ink pl-4 pt-2.5"
						>
							<span className="block text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-bp-anno">
								{tap.label}
							</span>
							<span className="mt-1.5 block text-sm leading-snug text-muted-foreground">
								{tap.body}
							</span>
						</div>
					))}
				</li>
			))}
		</ol>
	);
}
