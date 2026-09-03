import type { CSSProperties, ReactElement, ReactNode } from "react";
import {
	ISO_T,
	isoGrid,
	type IsoGrid,
} from "@/components/illustrations/art/iso";
import { at } from "./primitives";

/* `.ot-illo` resolves `--illo-*`, which alias workspace tokens that never re-ink
 * inside `lp-scheme-dark`; pointing them at the band's own paper/ink keeps the
 * drawing theme-invariant. */
const ILLO_BRIDGE = {
	"--illo-line": "var(--paper)",
	"--illo-knockout": "var(--ink)",
	"--illo-surface": "color-mix(in oklab, var(--ink) 86%, var(--paper))",
	"--illo-accent": "var(--accent)",
	"--illo-celebrate": "var(--paid)",
} as CSSProperties;

/* .illo-cast is the line colour at 10%, invisible once the line IS the paper. */
const CAST = {
	fill: "color-mix(in oklab, var(--paper) 45%, black)",
	opacity: 0.42,
} as CSSProperties;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The two top-face edges the silhouette outline skips, plus the front vertical. */
function innerEdges(g: IsoGrid, hw: number, h: number, ht: number): string {
	const top = h + ht;
	const p = (a: number, b: number, z: number) => {
		const [x, y] = g.pt(a, b, z);
		return `${r2(x)} ${r2(y)}`;
	};
	const corner = p(hw, hw, top);
	return `M${p(hw, -hw, top)}L${corner}L${p(-hw, hw, top)}M${corner}L${p(hw, hw, h)}`;
}

/** Tool plate: half-span in iso units, px per unit, slab thickness in px. */
const PLATE_HW = 2.15;
const PLATE_U = 7;
const PLATE_HT = 6;
/** Screen-px from a plate's top-face centre down to its front-bottom apex. */
const PLATE_DROP = 2 * PLATE_HW * PLATE_U * ISO_T + PLATE_HT;

/** The one record: an accent slab on a light plinth, bottom centre. */
const REC = isoGrid(170, 178, 9);
const PLINTH_HW = 4.4;
const PLINTH_HT = 5;
const PLINTH = REC.box(
	-PLINTH_HW,
	-PLINTH_HW,
	-PLINTH_HT,
	PLINTH_HW * 2,
	PLINTH_HW * 2,
	PLINTH_HT,
);
const PLINTH_EDGES = innerEdges(REC, PLINTH_HW, -PLINTH_HT, PLINTH_HT);
const RING_HW = 3.65;
const RING = REC.ground(-RING_HW, -RING_HW, 0, RING_HW * 2, RING_HW * 2);
const REC_HW = 2.9;
const REC_HT = 9;
const REC_BOX = REC.box(-REC_HW, -REC_HW, 0, REC_HW * 2, REC_HW * 2, REC_HT);
const REC_EDGES = innerEdges(REC, REC_HW, 0, REC_HT);
const REC_CAST = REC.ground(-4.9, -4.9, -9, 9.8, 9.8);
const REC_BASE_Y = REC.pt(PLINTH_HW, PLINTH_HW, -PLINTH_HT)[1];

/* --- the tools, drawn in the plate's top plane (1 unit = PLATE_U px) --- */

function EmailMark() {
	return (
		<>
			<path
				d="M-1.4 -0.95H1.4V0.95H-1.4Z"
				className="illo-outline illo-fill-knock"
				vectorEffect="non-scaling-stroke"
			/>
			<path
				d="M-1.4 -0.95L0 0.2L1.4 -0.95"
				className="illo-accent-line"
				vectorEffect="non-scaling-stroke"
			/>
		</>
	);
}

function SpreadsheetMark() {
	return (
		<>
			<path d="M-1.3 -1.3H1.3V1.3H-1.3Z" className="illo-fill-knock" />
			<path d="M-1.3 -1.3H1.3V-0.65H-1.3Z" className="illo-celebrate" />
			<path
				d="M-0.43 -0.65V1.3M0.43 -0.65V1.3M-1.3 0H1.3M-1.3 0.65H1.3"
				className="illo-hair"
				vectorEffect="non-scaling-stroke"
			/>
			<path
				d="M-1.3 -1.3H1.3V1.3H-1.3ZM-1.3 -0.65H1.3"
				className="illo-outline"
				vectorEffect="non-scaling-stroke"
			/>
		</>
	);
}

function NotebookMark() {
	return (
		<>
			<path
				d="M-1.05 -1.2H1.05V1.2H-1.05Z"
				className="illo-outline illo-fill-knock"
				vectorEffect="non-scaling-stroke"
			/>
			<path
				d="M-0.6 -1.5V-0.9M-0.2 -1.5V-0.9M0.2 -1.5V-0.9M0.6 -1.5V-0.9"
				className="illo-outline"
				vectorEffect="non-scaling-stroke"
			/>
			<path
				d="M-0.65 -0.4H0.65M-0.65 0.1H0.65M-0.65 0.6H0.2"
				className="illo-hair"
				vectorEffect="non-scaling-stroke"
			/>
		</>
	);
}

const FRONT_BUBBLE = "M-0.5 -0.5H1.4V0.7H0.4L0 1.2L0.05 0.7H-0.5Z";

function GroupTextMark() {
	return (
		<>
			<path
				d="M-1.4 -1.25H0.2V-0.15H-0.7L-1.1 0.3L-1.07 -0.15H-1.4Z"
				className="illo-outline illo-fill-surface"
				vectorEffect="non-scaling-stroke"
			/>
			<path d={FRONT_BUBBLE} className="illo-accent" />
			<path
				d={FRONT_BUBBLE}
				className="illo-outline"
				vectorEffect="non-scaling-stroke"
			/>
			<path
				d="M-0.15 -0.05H1.05M-0.15 0.35H0.6"
				className="illo-on-accent"
				vectorEffect="non-scaling-stroke"
			/>
		</>
	);
}

function StickyMark() {
	return (
		<>
			<path
				d="M-1.15 -1.15H1.15V0.4L0.4 1.15H-1.15Z"
				className="illo-outline illo-fill-accent-soft"
				vectorEffect="non-scaling-stroke"
			/>
			<path
				d="M1.15 0.4L0.4 0.4L0.4 1.15Z"
				className="illo-outline illo-fill-surface"
				vectorEffect="non-scaling-stroke"
			/>
			<path
				d="M-0.7 -0.6H0.7M-0.7 -0.15H0.4"
				className="illo-hair"
				vectorEffect="non-scaling-stroke"
			/>
		</>
	);
}

interface Tool {
	id: string;
	/** top-face centre, screen px */
	x: number;
	y: number;
	/** where its leader lands, in the record's top-plane iso coords */
	la: number;
	lb: number;
	delay: string;
	/** negative, so every plate starts mid-bob at its own phase */
	bob: string;
	Mark: () => ReactElement;
}

/* Ordered back-to-front (ascending y) so nearer plates overlap farther ones.
   Landings run left-to-right along the record's back rim in the same order the
   plates do, so no two leaders cross. */
const TOOLS: readonly Tool[] = [
	{
		id: "spreadsheet",
		x: 130,
		y: 30,
		la: -1.5,
		lb: -2.5,
		delay: "0s",
		bob: "-0.9s",
		Mark: SpreadsheetMark,
	},
	{
		id: "email",
		x: 58,
		y: 40,
		la: -2.5,
		lb: -1.5,
		delay: "0.06s",
		bob: "-0.2s",
		Mark: EmailMark,
	},
	{
		id: "notebook",
		x: 182,
		y: 50,
		la: 0.2,
		lb: -2.5,
		delay: "0.12s",
		bob: "-1.6s",
		Mark: NotebookMark,
	},
	{
		id: "group-text",
		x: 280,
		y: 94,
		la: 1.7,
		lb: -2.5,
		delay: "0.18s",
		bob: "-0.6s",
		Mark: GroupTextMark,
	},
	{
		id: "sticky",
		x: 62,
		y: 122,
		la: -2.5,
		lb: 0.4,
		delay: "0.24s",
		bob: "-1.2s",
		Mark: StickyMark,
	},
];

/* Leaders start 6px inside the slab so the plate still covers the end at the
   top of its bob. */
const LEADERS = TOOLS.map(({ id, x, y, la, lb }) => {
	const [lx, ly] = REC.pt(la, lb, REC_HT);
	return { id, d: `M${x} ${r2(y + PLATE_DROP - 6)}L${r2(lx)} ${r2(ly)}` };
});

function ToolPlate({
	x,
	y,
	delay,
	bob,
	children,
}: {
	x: number;
	y: number;
	delay: string;
	bob: string;
	children: ReactNode;
}) {
	const g = isoGrid(x, y, PLATE_U);
	const box = g.box(
		-PLATE_HW,
		-PLATE_HW,
		-PLATE_HT,
		PLATE_HW * 2,
		PLATE_HW * 2,
		PLATE_HT,
	);
	return (
		<g className="lp-fade" style={at(delay)}>
			<path
				d={g.ground(
					-PLATE_HW * 0.78,
					-PLATE_HW * 0.78,
					-(PLATE_HT + 26),
					PLATE_HW * 1.56,
					PLATE_HW * 1.56,
				)}
				className="illo-cast"
				style={CAST}
			/>
			<g
				className="lp-bob"
				style={{ "--lp-bob-delay": bob } as CSSProperties}
			>
				<path d={box.top} className="illo-face-top" />
				<path d={box.left} className="illo-face-left" />
				<path d={box.right} className="illo-face-right" />
				<path
					d={innerEdges(g, PLATE_HW, -PLATE_HT, PLATE_HT)}
					className="illo-outline"
				/>
				<path d={box.outline} className="illo-outline" />
				<g transform={g.topMatrix(0, 0, 0)}>{children}</g>
			</g>
		</g>
	);
}

export function OldWayStack() {
	return (
		<div className="mx-auto mt-3 max-w-[340px]" style={ILLO_BRIDGE}>
			<svg
				viewBox="0 0 340 260"
				className="ot-illo w-full"
				fill="none"
				aria-hidden="true"
				focusable="false"
				role="presentation"
			>
				{/* plinth, ring, and the one record on top */}
				<path d={REC_CAST} className="illo-cast" style={CAST} />
				<path d={PLINTH.top} className="illo-face-top" />
				<path d={PLINTH.left} className="illo-face-left" />
				<path d={PLINTH.right} className="illo-face-right" />
				<path d={PLINTH_EDGES} className="illo-outline" />
				<path d={PLINTH.outline} className="illo-outline" />
				<path
					d={RING}
					className="illo-celebrate-line"
					style={{ strokeWidth: 3 }}
				/>
				<path d={REC_BOX.top} className="illo-accent" />
				<path d={REC_BOX.left} className="illo-accent-shade" />
				<path d={REC_BOX.right} className="illo-accent-shade" />
				<path d={REC_EDGES} className="illo-outline" />
				<path d={REC_BOX.outline} className="illo-outline" />
				<g transform={REC.topMatrix(0, 0, REC_HT)}>
					<circle cx={-1.7} cy={-0.3} r={0.32} className="illo-knock" />
					<path
						d="M-1.1 -0.3H1.4"
						className="illo-on-accent"
						vectorEffect="non-scaling-stroke"
					/>
					<path
						d="M-1.9 0.5H1.9"
						className="illo-on-accent"
						vectorEffect="non-scaling-stroke"
						opacity={0.4}
					/>
					<path
						d="M-1.7 1.1H1.2M-1.7 1.7H1.8"
						className="illo-on-accent"
						vectorEffect="non-scaling-stroke"
						opacity={0.75}
					/>
				</g>

				{/* leaders stream toward the record; drawn under the plates so they tuck behind the slabs */}
				<g className="lp-fade" style={at("0.24s")}>
					{LEADERS.map(({ id, d }) => (
						<path
							key={id}
							d={d}
							className="illo-accent-line lp-flow"
							strokeDasharray="4 3"
							opacity={0.8}
						/>
					))}
					<g transform={REC.topMatrix(0, 0, REC_HT)}>
						{TOOLS.map(({ id, la, lb }) => (
							<circle
								key={id}
								cx={la}
								cy={lb}
								r={0.22}
								className="illo-knock"
							/>
						))}
					</g>
				</g>

				{/* the five things that stopped being five things */}
				{TOOLS.map(({ id, x, y, delay, bob, Mark }) => (
					<ToolPlate key={id} x={x} y={y} delay={delay} bob={bob}>
						<Mark />
					</ToolPlate>
				))}

				{/* and out the bottom, into the card below */}
				<path
					d={`M170 ${r2(REC_BASE_Y + 4)}V249`}
					className="illo-accent-line"
				/>
				<circle cx={170} cy={253} r={3} className="illo-accent" />
			</svg>
			<span className="sr-only">
				Five scattered tools (email, a spreadsheet, a notebook, the group text
				and a sticky note) drop onto one shared record.
			</span>
		</div>
	);
}
