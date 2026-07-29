import type { CSSProperties } from "react";
import { CalendarClock, FileText, Receipt } from "lucide-react";
import { Annotation } from "../blueprint/annotation";
import { BlueprintStage } from "../blueprint/blueprint-canvas";
import { DimensionLine } from "../blueprint/dimension-line";
import { DraftedShape } from "../blueprint/drafted-shape";
import { DrawIn } from "../blueprint/draw-in";
import { SheetCode } from "../blueprint/sheet-frame";
import { HeroLattice } from "./hero-lattice";
import {
	CARD_W,
	CONNECTOR_H,
	CONNECTOR_W,
	DIM_LABEL,
	DIM_LG,
	DIM_LG_LABEL,
	DIM_LG_VB,
	DIM_SM,
	DIM_SM_LABEL,
	DIM_SM_VB,
	ELBOW,
	SPINE,
	SPINE_H,
	T,
} from "./hero-data";
import { JourneyCard, StaticChip, StatusChip } from "./journey-card";

/**
 * G-001 — the drafted job journey. Server component; the only JavaScript in the
 * whole scene is the lattice wipe and the vertex-tick stagger.
 *
 * Everything the drawing says is also DOM text: the cards are real text, the
 * dimension value is a real <Annotation>, and the sr-only summary carries the
 * one thing the geometry adds (the order, and the two status transitions). So
 * every SVG here is aria-hidden and there is no AT surface to maintain.
 */

/**
 * The connector between two cards. Two tiny SVGs, one per layout, rather than
 * two whole card decks — the cards are the expensive markup and are rendered
 * exactly once.
 */
function Connector({ step, offset }: { step: 0 | 1; offset?: boolean }) {
	const delay = T.edge[step];
	return (
		<>
			{/* Below lg: the straight vertical spine, which is literally what the
			    product's own automation canvas draws. */}
			<svg
				aria-hidden="true"
				focusable="false"
				width={CARD_W}
				height={SPINE_H}
				className="shrink-0 lg:hidden"
			>
				<DraftedShape d={SPINE} tone="ink" weight="med" draw delay={delay} />
			</svg>
			{/* lg and up: an orthogonal elbow stepping down to the next card. */}
			<svg
				aria-hidden="true"
				focusable="false"
				width={CONNECTOR_W}
				height={CONNECTOR_H}
				className={`hidden shrink-0 lg:block ${offset ? "lg:mt-6" : ""}`}
			>
				<DraftedShape d={ELBOW} tone="ink" weight="med" draw delay={delay} />
			</svg>
		</>
	);
}

/**
 * The section's ONE annotation device: a dimension across the whole run.
 *
 * Geometry is SVG, the value string is real DOM text anchored to a viewBox
 * percentage — <svg><text> does not wrap, applies Outfit's letter-spacing
 * inconsistently and is a screen-reader liability.
 *
 * The stage is pinned to the run's exact pixel width because the percentage
 * anchoring is only valid while the canvas scales uniformly inside a box that
 * is precisely its own footprint.
 */
function RunDimension({
	viewBox,
	dim,
	labelAt,
	align,
	className,
}: {
	viewBox: readonly [number, number];
	dim: { readonly x1: number; readonly y1: number; readonly x2: number; readonly gap: number };
	labelAt: readonly [number, number];
	align: "center" | "below";
	className?: string;
}) {
	return (
		<BlueprintStage className={className}>
			<div
				className="relative mx-auto w-full"
				style={{ maxWidth: viewBox[0] }}
			>
				<svg
					aria-hidden="true"
					focusable="false"
					viewBox={`0 0 ${viewBox[0]} ${viewBox[1]}`}
					className="bp-fade-in h-auto w-full overflow-visible"
					style={{ "--bp-delay": `${T.dimension}s` } as CSSProperties}
				>
					<DimensionLine
						x1={dim.x1}
						y1={dim.y1}
						x2={dim.x2}
						y2={dim.y1}
						gap={dim.gap}
						extension={12}
						ends="tick"
					/>
				</svg>
				<Annotation
					at={labelAt}
					viewBox={viewBox}
					align={align}
					eyebrow={DIM_LABEL}
					appear
					delay={T.dimensionLabel}
					className="max-w-none whitespace-nowrap"
				/>
			</div>
		</BlueprintStage>
	);
}

export function HeroScene() {
	return (
		<div className="mx-auto mt-14 max-w-5xl px-4 sm:mt-16 sm:px-6 lg:mt-20 lg:px-8">
			<DrawIn className="relative">
				<HeroLattice />

				<div className="relative flex flex-col items-center">
					<SheetCode
						code="G-001"
						label="Quote to paid"
						className="mb-8 justify-center"
					/>

					<p className="sr-only">
						One job, three steps in OneTool. Quote Q-1042 for $4,850.00 is sent,
						then approved. The job is scheduled for Tuesday at 9:00 AM. Invoice
						INV-1042 for $4,850.00 is sent, then paid.
					</p>

					<div className="flex flex-col items-center lg:flex-row lg:items-start">
						<JourneyCard
							step={0}
							eyebrow="Quote"
							icon={FileText}
							title="Q-1042"
							subtitle="Spring cleanup + seasonal mowing"
							footLabel="Total"
							footValue="$4,850.00"
							chip={
								<StatusChip from="Sent" to="Approved" delay={T.chip[0]} />
							}
						/>

						<Connector step={0} />

						<JourneyCard
							step={1}
							eyebrow="Job"
							icon={CalendarClock}
							title="Spring cleanup"
							subtitle="Vega Property Group"
							footLabel="First visit"
							footValue="Tue 9:00 AM"
							chip={<StaticChip>Scheduled</StaticChip>}
							className="lg:mt-6"
						/>

						<Connector step={1} offset />

						<JourneyCard
							step={2}
							eyebrow="Invoice"
							icon={Receipt}
							title="INV-1042"
							subtitle="Vega Property Group"
							footLabel="Amount"
							footValue="$4,850.00"
							chip={<StatusChip from="Sent" to="Paid" delay={T.chip[1]} />}
							className="lg:mt-12"
						/>
					</div>

					<RunDimension
						className="mt-10 w-full lg:hidden"
						viewBox={DIM_SM_VB}
						dim={DIM_SM}
						labelAt={DIM_SM_LABEL}
						align="below"
					/>
					<RunDimension
						className="mt-10 hidden w-full lg:block"
						viewBox={DIM_LG_VB}
						dim={DIM_LG}
						labelAt={DIM_LG_LABEL}
						align="center"
					/>
				</div>
			</DrawIn>
		</div>
	);
}
