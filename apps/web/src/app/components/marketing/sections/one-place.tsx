import type { CSSProperties, ReactElement, ReactNode } from "react";
import { ISO_T, isoGrid } from "@/components/illustrations/art/iso";
import { TechWall } from "@/components/react-bits/tech-wall";
import { AmbientLayer } from "../ambient";
import {
	Eyebrow,
	GridBackdrop,
	Lede,
	PlusCorners,
	Section,
	SectionHeading,
} from "../primitives";

/* THE OLD WAY — dark band. Re-inked by `lp-scheme-dark` (Section scheme="dark"),
 * so this reads identically in light and dark: tokens only, no theme branches.
 * The five scattered tools converge on one record, drawn as an Illustration V2
 * isometric exploded stack: five tool plates floating over one accent record
 * slab, dashed leaders dropping onto its top face. Its only motion is a
 * staggered fade-in, killed under prefers-reduced-motion by landing.css. */

/** The five places a job currently lives, with what each one actually gives you. */
const REPLACES = [
	{ label: "Email", note: "Three replies deep for a gate code" },
	{ label: "Spreadsheet", note: "Last updated… Tuesday? By someone?" },
	{ label: "Notebook", note: "In the truck. With the truck." },
	{ label: "Group text", note: "“who's taking Kerr Road?”" },
	{ label: "Sticky note", note: "$180 owed, stuck to the dashboard" },
] as const;

const RECORD_CHIPS = [
	"Contacts",
	"Property",
	"Quote",
	"Signature",
	"Visits",
	"Photos",
	"Invoice",
	"Payment",
] as const;

/* ---------------------------------------------------------------------------
 * EXPLODED STACK — Illustration V2 language on a 340x260 canvas.
 *
 * The `.ot-illo` paint classes resolve `--illo-*`, which alias WORKSPACE tokens
 * on :root and do not re-ink inside this band. ILLO_BRIDGE re-points them at the
 * band's own tokens on the wrapper, so the drawing follows `lp-scheme-dark`.
 * ------------------------------------------------------------------------- */

const ILLO_BRIDGE = {
	"--illo-line": "var(--ink-3)",
	"--illo-accent": "var(--accent)",
	"--illo-knockout": "var(--sheet)",
	"--illo-surface": "color-mix(in oklch, var(--ink) 8%, transparent)",
	"--illo-celebrate": "var(--paid)",
} as CSSProperties;

const at = (delay: string) => ({ "--lp-delay": delay }) as CSSProperties;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Tool plate: half-span in iso units, px per unit, slab thickness in px. */
const PLATE_HW = 2.15;
const PLATE_U = 7;
const PLATE_HT = 6;
/** Screen-px from a plate's top-face centre down to its front-bottom apex. */
const PLATE_DROP = 2 * PLATE_HW * PLATE_U * ISO_T + PLATE_HT;

/** The one record, bottom centre — bigger unit, thicker slab, accent hue. */
const REC = isoGrid(170, 184, 9);
const REC_HW = 3.4;
const REC_HT = 11;
const REC_BOX = REC.box(
	-REC_HW,
	-REC_HW,
	-REC_HT,
	REC_HW * 2,
	REC_HW * 2,
	REC_HT,
);
/* Both turned faces take the same shade, so the front corner needs its own edge. */
const REC_EDGE = REC.poly([
	[REC_HW, REC_HW, 0],
	[REC_HW, REC_HW, -REC_HT],
]);
const REC_CAST = REC.ground(
	-REC_HW * 0.7,
	-REC_HW * 0.7,
	-(REC_HT + 22),
	REC_HW * 1.4,
	REC_HW * 1.4,
);
const REC_BASE_Y = REC.pt(REC_HW, REC_HW, -REC_HT)[1];

/* --- identifying marks, drawn in the plate's top plane (1 unit = PLATE_U px) --- */

function EmailMark() {
	return (
		<>
			<path
				d="M-1.25 -0.8H1.25V0.8H-1.25Z"
				className="illo-outline"
				vectorEffect="non-scaling-stroke"
			/>
			<path
				d="M-1.25 -0.8L0 0.2L1.25 -0.8"
				className="illo-outline"
				vectorEffect="non-scaling-stroke"
			/>
		</>
	);
}

function SpreadsheetMark() {
	return (
		<>
			<path
				d="M-1.15 -1.15H1.15V1.15H-1.15Z"
				className="illo-outline"
				vectorEffect="non-scaling-stroke"
			/>
			<path
				d="M-0.38 -1.15V1.15M0.38 -1.15V1.15M-1.15 -0.38H1.15M-1.15 0.38H1.15"
				className="illo-hair"
				vectorEffect="non-scaling-stroke"
			/>
		</>
	);
}

function NotebookMark() {
	return (
		<>
			<path
				d="M-1.05 -1.05H1.05V1.05H-1.05Z"
				className="illo-outline"
				vectorEffect="non-scaling-stroke"
			/>
			{/* binding wire crossing the top edge */}
			<path
				d="M-0.6 -1.35V-0.8M-0.2 -1.35V-0.8M0.2 -1.35V-0.8M0.6 -1.35V-0.8"
				className="illo-hair"
				vectorEffect="non-scaling-stroke"
			/>
			<path
				d="M-0.65 -0.25H0.65M-0.65 0.2H0.65M-0.65 0.65H0.25"
				className="illo-hair"
				vectorEffect="non-scaling-stroke"
			/>
		</>
	);
}

function GroupTextMark() {
	return (
		<>
			<path
				d="M-1.35 -1.2H0.15V-0.15H-0.75L-1.1 0.25L-1.07 -0.15H-1.35Z"
				className="illo-hair"
				vectorEffect="non-scaling-stroke"
			/>
			{/* front bubble knocks out the one behind it */}
			<path
				d="M-0.45 -0.45H1.35V0.7H0.35L0 1.15L0.03 0.7H-0.45Z"
				className="illo-outline illo-fill-knock"
				vectorEffect="non-scaling-stroke"
			/>
		</>
	);
}

function StickyMark() {
	return (
		<>
			{/* the one accent-soft tint in the stack */}
			<path
				d="M-1.1 -1.1H1.1V0.35L0.35 1.1H-1.1Z"
				className="illo-outline illo-fill-accent-soft"
				vectorEffect="non-scaling-stroke"
			/>
			<path
				d="M1.1 0.35H0.35V1.1"
				className="illo-hair"
				vectorEffect="non-scaling-stroke"
			/>
			<path
				d="M-0.65 -0.55H0.65M-0.65 -0.1H0.35"
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
		la: -1.8,
		lb: -3,
		delay: "0s",
		Mark: SpreadsheetMark,
	},
	{ id: "email", x: 58, y: 40, la: -3, lb: -1.8, delay: "0.06s", Mark: EmailMark },
	{
		id: "notebook",
		x: 182,
		y: 50,
		la: 0.2,
		lb: -3,
		delay: "0.12s",
		Mark: NotebookMark,
	},
	{
		id: "group-text",
		x: 280,
		y: 94,
		la: 2,
		lb: -3,
		delay: "0.18s",
		Mark: GroupTextMark,
	},
	{ id: "sticky", x: 62, y: 122, la: -3, lb: 0.4, delay: "0.24s", Mark: StickyMark },
];

const LEADERS = TOOLS.map(({ id, x, y, la, lb }) => {
	const [lx, ly] = REC.pt(la, lb, 0);
	return { id, d: `M${x} ${r2(y + PLATE_DROP)}L${r2(lx)} ${r2(ly)}` };
});

/** One floating tool: cast shadow, three-face slab, its mark laid in the top plane. */
function ToolPlate({
	x,
	y,
	delay,
	children,
}: {
	x: number;
	y: number;
	delay: string;
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
			/>
			<path d={box.top} className="illo-face-top" />
			<path d={box.left} className="illo-face-left" />
			<path d={box.right} className="illo-face-right" />
			<path d={box.outline} className="illo-outline" />
			<g transform={g.topMatrix(0, 0, 0)}>{children}</g>
		</g>
	);
}

function ExplodedStack() {
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
				{/* the one record */}
				<path d={REC_CAST} className="illo-cast" />
				<path d={REC_BOX.top} className="illo-accent" />
				<path d={REC_BOX.left} className="illo-accent-shade" />
				<path d={REC_BOX.right} className="illo-accent-shade" />
				<path d={REC_EDGE} className="illo-outline" />
				<path d={REC_BOX.outline} className="illo-outline" />
				<g transform={REC.topMatrix(0, 0, 0)}>
					<circle cx={-2} cy={-0.35} r={0.3} className="illo-knock" />
					<path
						d="M-1.4 -0.35H1.5"
						className="illo-on-accent"
						vectorEffect="non-scaling-stroke"
					/>
					<path
						d="M-2.3 0.45H2.3"
						className="illo-on-accent"
						vectorEffect="non-scaling-stroke"
						opacity={0.4}
					/>
					<path
						d="M-2 1.1H1.5M-2 1.75H2.1M-2 2.4H0.8"
						className="illo-on-accent"
						vectorEffect="non-scaling-stroke"
						opacity={0.75}
					/>
				</g>

				{/* leaders, one group under every plate so they tuck behind the slabs */}
				<g className="lp-fade" style={at("0.24s")}>
					{LEADERS.map(({ id, d }) => (
						<path key={id} d={d} className="illo-dash" />
					))}
					<g transform={REC.topMatrix(0, 0, 0)}>
						{TOOLS.map(({ id, la, lb }) => (
							<circle key={id} cx={la} cy={lb} r={0.26} className="illo-knock" />
						))}
					</g>
				</g>

				{/* the five things that stopped being five things */}
				{TOOLS.map(({ id, x, y, delay, Mark }) => (
					<ToolPlate key={id} x={x} y={y} delay={delay}>
						<Mark />
					</ToolPlate>
				))}

				{/* and out the bottom, into the card below */}
				<path d={`M170 ${r2(REC_BASE_Y + 4)}V249`} className="illo-accent-line" />
				<circle cx={170} cy={253} r={3} className="illo-accent" />
			</svg>
			<span className="sr-only">
				Five scattered tools — email, a spreadsheet, a notebook, the group text and
				a sticky note — drop onto one shared record.
			</span>
		</div>
	);
}

export function OnePlace() {
	return (
		<Section id="one-place" scheme="dark" className="overflow-hidden">
			{/* Ambient panel wall, full-bleed under the whole band. This band is dark
			    in BOTH site themes, so the panel/accent colours can be literal. */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-y-0 left-1/2 w-screen -translate-x-1/2"
			>
				<AmbientLayer opacity={0.35}>
					<TechWall
						className="h-full w-full"
						color="#131b26"
						accentColor="#00a6f4"
						edgeColor="#2d7fa8"
						backgroundColor="transparent"
						density={9}
						speed={0.35}
						grain={0}
						vignette={0.25}
						cursorInteraction={false}
						paused={false}
						adaptiveQuality
						dpr={1.25}
					/>
				</AmbientLayer>
			</div>

			{/* Full-bleed construction grid: the wrapper escapes the 1280px container,
			    the section's overflow-hidden clips it back to the band. */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-y-0 left-1/2 w-screen -translate-x-1/2"
			>
				<GridBackdrop
					size={48}
					opacity={0.45}
					mask="radial-gradient(90% 70% at 22% 30%, #000 0%, transparent 72%)"
				/>
			</div>

			<div className="relative grid items-start gap-[clamp(32px,5vw,80px)] [grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr))]">
				<div>
					<Eyebrow>The old way</Eyebrow>
					<SectionHeading>
						Five places to look. <span className="text-(--accent-ink)">One job</span> to
						do.
					</SectionHeading>
					<Lede className="max-w-[34rem]">
						Email, a spreadsheet, a notebook, the group text and a sticky note on the
						dash. None of them know about each other, so you become the integration.
					</Lede>

					<div className="mt-[clamp(40px,6vw,80px)] grid max-w-[30rem] gap-[22px]">
						<div className="border-t border-dashed border-(--rule-2) pt-[18px]">
							<h3 className="text-[19px] font-medium leading-[1.35] tracking-[-0.02em]">
								The address exists in five handwritings
							</h3>
							<p className="mt-2 text-[15px] leading-[1.6] text-(--ink-2) text-pretty">
								It&apos;s in the thread, on the quote, in the notebook and on the
								sticky note. Four of them are out of date and you find out which on
								the driveway.
							</p>
						</div>
						<div className="border-t border-dashed border-(--rule-2) pt-[18px]">
							<h3 className="text-[19px] font-medium leading-[1.35] tracking-[-0.02em]">
								A spreadsheet only knows what you typed into it
							</h3>
							<p className="mt-2 text-[15px] leading-[1.6] text-(--ink-2) text-pretty">
								It can&apos;t tell you the quote came back signed, that the invoice
								went out, or that nobody has paid it. It waits for you — usually at
								nine in the evening.
							</p>
						</div>
					</div>
				</div>

				<div>
					<p className="font-mono text-[11px] uppercase tracking-[0.12em] text-(--ink-3)">
						What it replaces
					</p>
					<ul className="mt-[14px]">
						{REPLACES.map(({ label, note }, i) => (
							<li
								key={label}
								className={
									i === REPLACES.length - 1
										? "flex items-baseline gap-4 border-t border-b border-dashed border-(--rule-2) py-[13px]"
										: "flex items-baseline gap-4 border-t border-dashed border-(--rule-2) py-[13px]"
								}
							>
								<span className="w-24 flex-none font-mono text-[11px] uppercase tracking-[0.1em] text-(--ink-3)">
									{label}
								</span>
								<span className="text-[15px] leading-[1.5] text-(--ink-2) text-pretty">
									{note}
								</span>
							</li>
						))}
					</ul>

					<ExplodedStack />

					<div className="relative mt-[14px] grid gap-[14px] rounded-[14px] border border-(--rule-3) bg-(--sheet) p-[clamp(20px,2.4vw,26px)]">
						<PlusCorners />
						<div className="flex flex-wrap items-center justify-between gap-[14px]">
							<p className="font-mono text-[11px] uppercase tracking-[0.12em] text-(--accent-ink)">
								One record
							</p>
							<p className="font-mono text-[11px] tabular-nums tracking-[0.06em] text-(--ink-3)">
								Typed once · 08:14
							</p>
						</div>
						<p className="text-[clamp(18px,1.9vw,22px)] font-medium leading-[1.3] tracking-[-0.02em]">
							Whitfield Property Group
							<br />
							<span className="text-(--ink-2)">412 Ashfield Court</span>
						</p>
						<ul className="flex flex-wrap gap-[7px]">
							{RECORD_CHIPS.map((chip, i) => (
								<li
									key={chip}
									className={
										i === RECORD_CHIPS.length - 1
											? "rounded-full border border-(--rule-2) px-[11px] py-[5px] font-mono text-[10.5px] uppercase tracking-[0.08em] text-(--accent-ink)"
											: "rounded-full border border-(--rule-2) px-[11px] py-[5px] font-mono text-[10.5px] uppercase tracking-[0.08em] text-(--ink-2)"
									}
								>
									{chip}
								</li>
							))}
						</ul>
						<p className="border-t border-(--rule) pt-3 text-[14.5px] leading-[1.55] text-(--ink-2) text-pretty">
							Everything after the first entry reads off this. Nothing gets retyped, so
							nothing gets out of date.
						</p>
					</div>
				</div>
			</div>
		</Section>
	);
}
