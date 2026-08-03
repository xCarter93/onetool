import type { CSSProperties, ReactNode } from "react";
import { Check } from "lucide-react";
import { BP_DASH } from "@/lib/blueprint/geometry";
import { cn } from "@/lib/utils";
import { Annotation } from "../blueprint/annotation";
import { BP_MARKER_ARROW } from "../blueprint/blueprint-defs";
import { BlueprintCanvas, BlueprintStage } from "../blueprint/blueprint-canvas";
import { DimensionLine } from "../blueprint/dimension-line";
import { DraftedShape } from "../blueprint/drafted-shape";
import { DrawIn } from "../blueprint/draw-in";
import { SheetFrame } from "../blueprint/sheet-frame";
import { Stamp } from "../blueprint/stamp";
import {
	DIM_ANGLE,
	DIM_DIA,
	DIM_FLATS,
	DIM_RADIUS,
	MARK_CONSTRUCTION,
	MARK_VB,
	MARK_VIEWBOX,
	T_MARK,
	markAnchor,
} from "./drafted-mark-data";
import { LOGO_CHECK, LOGO_WRENCH } from "./logo-mark-data";
import { MarkCentrelines } from "./mark-centrelines";
import { MarkOutline } from "./mark-outline";

/**
 * G-001 — the OneTool mark as a part detail, on a plate beside the copy.
 *
 * Server component apart from <DrawIn> (one IntersectionObserver) and the
 * centreline mask (one useId). The whole draw sequence is CSS `--bp-delay`, so
 * reduced motion and no-JS both land on the finished drawing for free.
 *
 * The check is NOT part geometry. Green is banned in artwork, and bolting a
 * tick onto a dimensioned part would be the one dishonest line on the sheet —
 * so it arrives where a check belongs on a real drawing: an inspection stamp in
 * the title-block register, in construction ink.
 */

/** Dimensions fade in as a unit — DimensionLine draws geometry, not a stroke. */
function Dim({ delay, children }: { delay: number; children: ReactNode }) {
	return (
		<g
			className="bp-fade-in"
			style={{ "--bp-delay": `${delay}s` } as CSSProperties}
		>
			{children}
		</g>
	);
}

/** A construction hairline: quieter than the object it measures, always. */
const CONSTRUCTION: CSSProperties = { stroke: "var(--bp-guide-strong)" };

export function DraftedMark({ className }: { className?: string }) {
	return (
		<SheetFrame
			className={cn("group", className)}
			// Tight inset on purpose: the drawing, not the margin, is the subject.
			// 12px clears the frame's 6px inner rule and nothing more.
			contentClassName="p-3 sm:p-4"
		>
			<DrawIn className="relative" amount={0.2}>
				<BlueprintStage>
					<BlueprintCanvas viewBox={MARK_VIEWBOX}>
						{/* 1. The circles the part was struck from. */}
						{MARK_CONSTRUCTION.map((d, i) => (
							<DraftedShape
								key={d}
								d={d}
								weight="thin"
								draw
								delay={T_MARK.construction[i]}
								style={CONSTRUCTION}
							/>
						))}

						{/* 2. Centrelines, wiped (never dash-animated). */}
						<MarkCentrelines />

						{/*
						 * 3a. The fill, under the line-work so the outline stays crisp.
						 * Same paths as the outlines below, so the ink lands exactly
						 * inside its own drawing. Brand color is deliberate: this is the
						 * actual logo, the one non-two-ink moment on the sheet.
						 */}
						<g
							aria-hidden="true"
							className={cn(
								"opacity-0 [clip-path:inset(100%_0_0_0)]",
								"transition-[opacity,clip-path] duration-700 ease-out motion-reduce:transition-none",
								"group-hover:opacity-100 group-hover:[clip-path:inset(0%_0_0_0)]",
							)}
						>
							<path d={LOGO_WRENCH.d} fill={LOGO_WRENCH.fill} fillRule="evenodd" />
							<path d={LOGO_CHECK.d} fill={LOGO_CHECK.fill} fillRule="evenodd" />
						</g>

						{/*
						 * 3b. The object outline — the real mark's own paths, drafted.
						 * ISO 128 makes the visible outline the widest line on a drawing,
						 * which is also what stops the part from disappearing into its
						 * own construction at hero scale. The check is part geometry now:
						 * the drawing is of the whole mark, and the fill inks both.
						 * Mask-wipe reveal, not .bp-draw — see mark-outline.tsx.
						 */}
						<MarkOutline />

						{/* 4. Four dimensions, every one of them measured. */}
						<Dim delay={T_MARK.dimensions[0]}>
							{DIM_DIA.extensions.map((d) => (
								<path
									key={d}
									d={d}
									fill="none"
									className="stroke-bp-guide-strong"
									strokeDasharray={BP_DASH.guide}
									strokeLinecap="butt"
									vectorEffect="non-scaling-stroke"
									style={{ strokeWidth: "var(--lw-thin)" }}
								/>
							))}
							<DimensionLine
								x1={DIM_DIA.x1}
								y1={DIM_DIA.y}
								x2={DIM_DIA.x2}
								y2={DIM_DIA.y}
								ends="arrow"
							/>
						</Dim>

						<Dim delay={T_MARK.dimensions[1]}>
							<DimensionLine
								x1={DIM_FLATS.b[0]}
								y1={DIM_FLATS.b[1]}
								x2={DIM_FLATS.a[0]}
								y2={DIM_FLATS.a[1]}
								ends="arrow"
							/>
						</Dim>

						<Dim delay={T_MARK.dimensions[2]}>
							<path
								d={DIM_RADIUS.d}
								fill="none"
								className="stroke-bp-line-strong"
								markerEnd={BP_MARKER_ARROW}
								strokeLinejoin="miter"
								strokeMiterlimit={8}
								strokeLinecap="butt"
								vectorEffect="non-scaling-stroke"
								style={{ strokeWidth: "var(--lw-med)" }}
							/>
						</Dim>

						<Dim delay={T_MARK.dimensions[3]}>
							<path
								d={DIM_ANGLE.reference}
								fill="none"
								className="stroke-bp-guide-strong"
								strokeDasharray={BP_DASH.guide}
								strokeLinecap="butt"
								vectorEffect="non-scaling-stroke"
								style={{ strokeWidth: "var(--lw-thin)" }}
							/>
							<path
								d={DIM_ANGLE.arc}
								fill="none"
								className="stroke-bp-line-strong"
								strokeLinecap="butt"
								vectorEffect="non-scaling-stroke"
								style={{ strokeWidth: "var(--lw-med)" }}
							/>
						</Dim>
					</BlueprintCanvas>

					{/* Every figure is real DOM text, anchored to viewBox percentages. */}
					<Annotation
						at={markAnchor(DIM_DIA.label)}
						viewBox={MARK_VB}
						align="above"
						eyebrow={DIM_DIA.value}
						appear
						delay={T_MARK.labels[0]}
						className="max-w-none whitespace-nowrap"
					/>
					<Annotation
						at={markAnchor(DIM_FLATS.label)}
						viewBox={MARK_VB}
						align="start"
						eyebrow={DIM_FLATS.value}
						appear
						delay={T_MARK.labels[1]}
						className="max-w-none whitespace-nowrap"
					/>
					<Annotation
						at={markAnchor(DIM_RADIUS.label)}
						viewBox={MARK_VB}
						align="start"
						eyebrow={DIM_RADIUS.value}
						appear
						delay={T_MARK.labels[2]}
						className="max-w-none whitespace-nowrap"
					/>
					<Annotation
						at={markAnchor(DIM_ANGLE.label)}
						viewBox={MARK_VB}
						align="center"
						eyebrow={DIM_ANGLE.value}
						appear
						delay={T_MARK.labels[3]}
						className="max-w-none whitespace-nowrap"
					/>

					{/*
					 * The inspection stamp, landing last in the lower-right corner the
					 * retired title strip used to occupy. "APPROVED" is reserved for the
					 * e-sign scene and must never appear here.
					 */}
					<div className="absolute bottom-[3%] right-[3%]">
						<Stamp
							tone="ink"
							rotate={-7}
							appear
							weathered
							delay={T_MARK.stamp}
							className="inline-flex items-center gap-1.5"
						>
							<Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
							QA passed
						</Stamp>
					</div>
				</BlueprintStage>

				<p className="sr-only">
					Technical drawing of the OneTool wrench mark, dimensioned, with a QA
					check stamp.
				</p>
			</DrawIn>
		</SheetFrame>
	);
}
