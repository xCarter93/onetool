/**
 * V2 object empties — a physical prop stands in for the records that will land:
 * a property, a document tray, a card terminal, a conversation.
 *
 * Same recipe as the other V2 scenes: one hero solid on the iso grid, floating
 * knockout plates carrying the real content, exactly one OneTool mark, cast
 * shadows, a few motes. Accent hue only (celebrate is reserved for wins).
 */
import { isoGrid } from "../iso";
import { OneToolMark } from "../mark";
import { Beacon } from "./celebration";

type Grid = ReturnType<typeof isoGrid>;

/* ---------------------------------------------------------------- helpers */

/** Lays 1:1 screen-px artwork flat into the iso top plane (unit-scale
 *  topMatrix), so strokes keep their px width instead of scaling by `unit`. */
const FLAT = "matrix(1 0.57735 -1 0.57735 0 0)";
function flatAt(g: Grid, a: number, b: number, h: number): string {
	const [x, y] = g.pt(a, b, h);
	return `translate(${x} ${y}) ${FLAT}`;
}

/** Screen-space map pin: circle bowl tapering to a tip, over a soft halo. */
function MapPin({ cx, cy, r }: { cx: number; cy: number; r: number }) {
	const d =
		`M ${cx} ${cy + r * 2.55}` +
		` L ${cx - r * 0.76} ${cy + r * 0.64}` +
		` A ${r} ${r} 0 1 1 ${cx + r * 0.76} ${cy + r * 0.64} Z`;
	return (
		<>
			<circle
				cx={cx}
				cy={cy + r * 0.3}
				r={r * 1.55}
				className="illo-accent-soft"
			/>
			<path d={d} className="illo-accent" />
			<path d={d} className="illo-outline" />
			<circle cx={cx} cy={cy} r={r * 0.36} className="illo-knock" />
		</>
	);
}

/**
 * Iso house: walls box + hipped (pyramid) roof. The rise must clear
 * 2·half·unit·tan30 or the far roof planes peek above the ridge, so only the
 * lower-left and lower-right slopes are ever drawn.
 */
function IsoHouse({
	g,
	unit,
	base,
	half,
	wall,
	over,
	rise,
	detail,
}: {
	g: Grid;
	unit: number;
	/** height (px) of the surface the house stands on */
	base: number;
	/** wall half-span in iso units */
	half: number;
	/** wall height in px */
	wall: number;
	/** eave overhang in iso units */
	over: number;
	/** roof rise in px above the eave */
	rise: number;
	detail: boolean;
}) {
	const body = g.box(-half, -half, base, half * 2, half * 2, wall);
	const eaveH = base + wall;
	const apexH = eaveH + rise;
	const e = half + over;
	const slopeFront = g.poly([
		[-e, e, eaveH],
		[e, e, eaveH],
		[0, 0, apexH],
	]);
	const slopeRight = g.poly([
		[e, e, eaveH],
		[e, -e, eaveH],
		[0, 0, apexH],
	]);
	const faceH = wall / unit;
	return (
		<>
			<path d={body.top} className="illo-face-top" />
			<path d={body.left} className="illo-face-left" />
			<path d={body.right} className="illo-face-right" />
			<path d={body.outline} className="illo-outline" />

			{/* door + windows knocked out of the lower-left wall */}
			{detail && (
				<g transform={g.leftMatrix(-half, half, eaveH)}>
					<rect
						x={half * 0.72}
						y={faceH * 0.36}
						width={half * 0.46}
						height={faceH * 0.64}
						rx="0.08"
						className="illo-knock"
					/>
					<rect
						x={half * 0.72}
						y={faceH * 0.36}
						width={half * 0.46}
						height={faceH * 0.64}
						rx="0.08"
						className="illo-outline"
						vectorEffect="non-scaling-stroke"
					/>
					<circle
						cx={half * 1.11}
						cy={faceH * 0.72}
						r="0.07"
						className="illo-mote"
					/>
					<rect
						x={half * 0.2}
						y={faceH * 0.24}
						width={half * 0.34}
						height={faceH * 0.3}
						rx="0.07"
						className="illo-knock"
					/>
					<rect
						x={half * 0.2}
						y={faceH * 0.24}
						width={half * 0.34}
						height={faceH * 0.3}
						rx="0.07"
						className="illo-outline"
						vectorEffect="non-scaling-stroke"
					/>
				</g>
			)}

			{/* window on the lower-right wall */}
			{detail && (
				<g transform={g.rightMatrix(half, half, eaveH)}>
					<rect
						x={half * 0.5}
						y={faceH * 0.26}
						width={half * 0.62}
						height={faceH * 0.36}
						rx="0.08"
						className="illo-knock"
					/>
					<rect
						x={half * 0.5}
						y={faceH * 0.26}
						width={half * 0.62}
						height={faceH * 0.36}
						rx="0.08"
						className="illo-outline"
						vectorEffect="non-scaling-stroke"
					/>
					<line
						x1={half * 0.81}
						y1={faceH * 0.26}
						x2={half * 0.81}
						y2={faceH * 0.62}
						className="illo-hair"
						vectorEffect="non-scaling-stroke"
					/>
				</g>
			)}

			<path d={slopeFront} className="illo-face-left" />
			<path d={slopeRight} className="illo-face-right" />
			<path d={slopeFront} className="illo-outline" />
			<path d={slopeRight} className="illo-outline" />
		</>
	);
}

/* ------------------------------------------------------- client properties */

function ClientPropertiesScene({ hero }: { hero: boolean }) {
	const s = hero ? 1.6 : 1;
	const u = 8 * s;
	const g = isoGrid(104 * s, 78 * s, u);
	const tile = g.box(-2.3, -2.3, 0, 4.6, 4.6, 2.2 * s);
	return (
		<>
			<path d={g.ground(-2.7, -2.7, 0, 5.4, 5.4)} className="illo-cast" />
			<path d={tile.top} className="illo-face-top" />
			<path d={tile.left} className="illo-face-left" />
			<path d={tile.right} className="illo-face-right" />
			<path d={tile.top} className="illo-outline" />
			<path d={tile.outline} className="illo-outline" />

			<IsoHouse
				g={g}
				unit={u}
				base={2.2 * s}
				half={1.55}
				wall={16 * s}
				over={0.28}
				rise={22 * s}
				detail
			/>

			<MapPin cx={114 * s} cy={22 * s} r={6.5 * s} />

			<Beacon g={g} a={-3.6} b={3.4} markSize={15 * s} />

			{/* motes */}
			<circle cx={40 * s} cy={30 * s} r={1.8 * s} className="illo-mote" />
			<circle cx={172 * s} cy={44 * s} r={2 * s} className="illo-accent-soft" />
			<circle cx={166 * s} cy={94 * s} r={1.6 * s} className="illo-mote" />
			{hero && (
				<>
					<circle cx={296} cy={70} r={2.6} className="illo-mote" />
					<circle cx={62} cy={150} r={2.2} className="illo-accent-soft" />
					<rect
						x={266}
						y={140}
						width={5}
						height={5}
						rx={1}
						transform="rotate(22 268 142)"
						className="illo-accent-soft"
					/>
					<rect
						x={44}
						y={58}
						width={5}
						height={5}
						rx={1}
						transform="rotate(-16 46 60)"
						className="illo-mote"
					/>
				</>
			)}
		</>
	);
}

export function ClientPropertiesNone() {
	return <ClientPropertiesScene hero={false} />;
}

export function ClientPropertiesNoneHero() {
	return <ClientPropertiesScene hero />;
}

export function ClientPropertiesNoneSm() {
	const u = 5;
	const g = isoGrid(28, 33, u);
	return (
		<>
			<path d={g.ground(-1.5, -1.5, 0, 3.0, 3.0)} className="illo-cast" />
			<IsoHouse
				g={g}
				unit={u}
				base={0}
				half={1.15}
				wall={9}
				over={0.25}
				rise={12}
				detail
			/>
			<MapPin cx={60} cy={15} r={5} />
		</>
	);
}

/* ---------------------------------------------------------------- documents */

/** A sheet lying in the top plane. */
function DocPlate({
	g,
	a,
	b,
	h,
	hx = 1.45,
	hy = 1.9,
	quiet,
}: {
	g: Grid;
	a: number;
	b: number;
	h: number;
	hx?: number;
	hy?: number;
	quiet?: boolean;
}) {
	return (
		<g transform={g.topMatrix(a, b, h)}>
			<rect
				x={-hx}
				y={-hy}
				width={hx * 2}
				height={hy * 2}
				rx="0.2"
				className="illo-knock"
			/>
			<rect
				x={-hx}
				y={-hy}
				width={hx * 2}
				height={hy * 2}
				rx="0.2"
				className="illo-outline"
				vectorEffect="non-scaling-stroke"
				opacity={quiet ? 0.6 : undefined}
			/>
			{quiet && (
				<>
					<rect
						x={-hx + 0.3}
						y={hy - 0.72}
						width={hx * 1.3}
						height="0.2"
						rx="0.1"
						className="illo-mote"
					/>
					<rect
						x={-hx + 0.3}
						y={hy - 0.36}
						width={hx * 0.9}
						height="0.2"
						rx="0.1"
						className="illo-mote"
					/>
				</>
			)}
		</g>
	);
}

function DocumentsScene({ hero }: { hero: boolean }) {
	const s = hero ? 1.6 : 1;
	const g = isoGrid(100 * s, 72 * s, 8 * s);
	const rim = 5 * s;
	const floorH = 2.6 * s;
	const tray = g.box(-3.2, -2.4, 0, 6.4, 4.8, rim);
	const markSize = 12 * s;
	return (
		<>
			<path d={g.ground(-3.7, -2.9, 0, 7.4, 5.8)} className="illo-cast" />
			<path d={tray.top} className="illo-face-top" />
			<path d={tray.left} className="illo-face-left" />
			<path d={tray.right} className="illo-face-right" />

			{/* recessed well: far inner walls, then the sunken floor */}
			<path
				d={g.poly([
					[-2.85, -2.05, rim],
					[2.85, -2.05, rim],
					[2.85, -2.05, floorH],
					[-2.85, -2.05, floorH],
				])}
				className="illo-face-right"
			/>
			<path
				d={g.poly([
					[-2.85, -2.05, rim],
					[-2.85, 2.05, rim],
					[-2.85, 2.05, floorH],
					[-2.85, -2.05, floorH],
				])}
				className="illo-face-right"
			/>
			<path d={g.ground(-2.85, -2.05, floorH, 5.7, 4.1)} className="illo-knock" />
			<path
				d={g.ground(-2.85, -2.05, floorH, 5.7, 4.1)}
				className="illo-outline"
			/>
			<path d={g.ground(-2.85, -2.05, rim, 5.7, 4.1)} className="illo-outline" />
			<path d={tray.outline} className="illo-outline" />

			{/* shadow of the stack on the well floor */}
			<path
				d={g.ground(-0.7, -1.35, floorH + 0.01, 2.9, 3.3)}
				className="illo-cast"
			/>

			{/* stack, back to front */}
			<DocPlate g={g} a={0.75} b={0.55} h={6 * s} quiet />
			<DocPlate g={g} a={0.2} b={0.15} h={10.5 * s} quiet />
			<DocPlate g={g} a={-0.35} b={-0.25} h={15 * s} />

			{/* top sheet content */}
			<g transform={g.topMatrix(-0.35, -0.25, 15 * s)}>
				<rect
					x="0.45"
					y="-1.18"
					width="0.66"
					height="0.22"
					rx="0.11"
					className="illo-mote"
				/>
				<rect
					x="0.45"
					y="-0.8"
					width="0.44"
					height="0.18"
					rx="0.09"
					className="illo-mote"
				/>
				<line
					x1="-1.15"
					y1="0"
					x2="1.15"
					y2="0"
					className="illo-hair"
					vectorEffect="non-scaling-stroke"
				/>
				{[0, 1, 2].map((i) => (
					<rect
						key={i}
						x="-1.15"
						y={0.25 + i * 0.38}
						width={[2.24, 1.82, 2.05][i]}
						height="0.2"
						rx="0.1"
						className="illo-mote"
					/>
				))}
				<path
					d="M -1.05 1.52 c 0.26 -0.54 0.44 0.46 0.72 -0.06 c 0.22 -0.4 0.36 0.44 0.64 0.02 c 0.2 -0.28 0.34 0.18 0.56 -0.14"
					className="illo-accent-line"
					vectorEffect="non-scaling-stroke"
				/>
				<line
					x1="-1.1"
					y1="1.74"
					x2="1.0"
					y2="1.74"
					className="illo-hair"
					vectorEffect="non-scaling-stroke"
				/>
			</g>
			{/* letterhead — the one OneTool mark in this scene */}
			<OneToolMark
				x={0}
				y={0}
				size={markSize}
				variant="outline"
				transform={flatAt(g, -0.35 - 1.2, -0.25 - 1.75, 15 * s)}
			/>

			{/* dashed incoming sheet */}
			<g transform={g.topMatrix(-1.15, -1.05, 29 * s)}>
				<rect
					x="-1.25"
					y="-1.65"
					width="2.5"
					height="3.3"
					rx="0.2"
					className="illo-dash"
					vectorEffect="non-scaling-stroke"
				/>
			</g>

			{/* motes */}
			<circle cx={34 * s} cy={34 * s} r={1.8 * s} className="illo-mote" />
			<circle cx={170 * s} cy={46 * s} r={2 * s} className="illo-accent-soft" />
			<circle cx={162 * s} cy={96 * s} r={1.6 * s} className="illo-mote" />
			{hero && (
				<>
					<circle cx={44} cy={128} r={2.4} className="illo-accent-soft" />
					<circle cx={292} cy={116} r={2.6} className="illo-mote" />
					<rect
						x={272}
						y={44}
						width={5}
						height={5}
						rx={1}
						transform="rotate(24 274 46)"
						className="illo-accent-soft"
					/>
					<rect
						x={40}
						y={62}
						width={5}
						height={5}
						rx={1}
						transform="rotate(-18 42 64)"
						className="illo-mote"
					/>
				</>
			)}
		</>
	);
}

export function DocumentsNone() {
	return <DocumentsScene hero={false} />;
}

export function DocumentsNoneHero() {
	return <DocumentsScene hero />;
}

export function DocumentsNoneSm() {
	const g = isoGrid(40, 28, 6.2);
	return (
		<>
			<path d={g.ground(-1.5, -1.9, 0, 3.0, 3.8)} className="illo-cast" />
			<g transform={g.topMatrix(0, 0, 8)}>
				{/* sheet with a dog-eared corner */}
				<path
					d="M -1.5 -1.9 H 0.72 L 1.5 -1.12 V 1.9 H -1.5 Z"
					className="illo-knock"
				/>
				<path
					d="M -1.5 -1.9 H 0.72 L 1.5 -1.12 V 1.9 H -1.5 Z"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				<path d="M 0.72 -1.9 L 1.5 -1.12 H 0.72 Z" className="illo-face-left" />
				<path
					d="M 0.72 -1.9 L 1.5 -1.12 H 0.72 Z"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				<rect
					x="-1.1"
					y="-0.5"
					width="2.1"
					height="0.28"
					rx="0.14"
					className="illo-mote"
				/>
				<rect
					x="-1.1"
					y="0.05"
					width="1.5"
					height="0.28"
					rx="0.14"
					className="illo-mote"
				/>
				<path
					d="M -1.05 1.28 c 0.3 -0.6 0.5 0.5 0.82 -0.08 c 0.26 -0.46 0.44 0.48 0.76 0.02"
					className="illo-accent-line"
					vectorEffect="non-scaling-stroke"
				/>
			</g>
		</>
	);
}

/* ----------------------------------------------------------------- payments */

/** Accent card plate lying in the top plane, with a shaded edge for thickness. */
function CardPlate({
	g,
	a,
	b,
	h,
	hx,
	hy,
	lift,
}: {
	g: Grid;
	a: number;
	b: number;
	h: number;
	hx: number;
	hy: number;
	lift: number;
}) {
	return (
		<>
			<g transform={g.topMatrix(a, b, h - lift)}>
				<rect
					x={-hx}
					y={-hy}
					width={hx * 2}
					height={hy * 2}
					rx="0.22"
					className="illo-accent-shade"
				/>
				<rect
					x={-hx}
					y={-hy}
					width={hx * 2}
					height={hy * 2}
					rx="0.22"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
			</g>
			<g transform={g.topMatrix(a, b, h)}>
				<rect
					x={-hx}
					y={-hy}
					width={hx * 2}
					height={hy * 2}
					rx="0.22"
					className="illo-accent"
				/>
				<rect
					x={-hx}
					y={-hy}
					width={hx * 2}
					height={hy * 2}
					rx="0.22"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				{/* magstripe */}
				<rect
					x={-hx + 0.14}
					y={-hy + 0.28}
					width={hx * 2 - 0.28}
					height="0.34"
					className="illo-fill-knock"
				/>
				{/* chip */}
				<rect
					x={-hx + 0.28}
					y={hy - 0.86}
					width="0.5"
					height="0.4"
					rx="0.09"
					className="illo-fill-knock"
				/>
				<line
					x1={-hx + 0.28}
					y1={hy - 0.66}
					x2={-hx + 0.78}
					y2={hy - 0.66}
					className="illo-accent-line"
					vectorEffect="non-scaling-stroke"
				/>
				{/* number strip */}
				<rect
					x={-hx + 0.28}
					y={hy - 0.36}
					width={hx * 1.1}
					height="0.2"
					rx="0.1"
					className="illo-fill-knock"
					opacity="0.7"
				/>
			</g>
		</>
	);
}

function PaymentsScene({ hero }: { hero: boolean }) {
	const s = hero ? 1.6 : 1;
	const u = 8 * s;
	const g = isoGrid(94 * s, 78 * s, u);
	const wall = 24 * s;
	const body = g.box(-1.6, -1.3, 0, 3.2, 2.6, wall);
	const faceH = wall / u;
	return (
		<>
			<path d={g.ground(-2.0, -1.7, 0, 4.0, 3.4)} className="illo-cast" />
			<path d={body.top} className="illo-face-top" />
			<path d={body.left} className="illo-face-left" />
			<path d={body.right} className="illo-face-right" />

			{/* screen knocked into the top face */}
			<g transform={g.topMatrix(0, 0, wall)}>
				<rect
					x="-1.15"
					y="-0.9"
					width="2.3"
					height="1.8"
					rx="0.18"
					className="illo-knock"
				/>
				<rect
					x="-1.15"
					y="-0.9"
					width="2.3"
					height="1.8"
					rx="0.18"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				<rect
					x="-0.85"
					y="-0.52"
					width="1.7"
					height="0.24"
					rx="0.12"
					className="illo-mote"
				/>
				<rect
					x="-0.85"
					y="-0.08"
					width="1.15"
					height="0.24"
					rx="0.12"
					className="illo-mote"
				/>
				<rect
					x="-0.85"
					y="0.38"
					width="0.95"
					height="0.3"
					rx="0.15"
					className="illo-accent"
				/>
			</g>

			{/* card slot + keypad on the lower-left face */}
			<g transform={g.leftMatrix(-1.6, 1.3, wall)}>
				<rect
					x="0.5"
					y={faceH * 0.15}
					width="2.2"
					height="0.16"
					rx="0.08"
					className="illo-knock"
				/>
				<rect
					x="0.5"
					y={faceH * 0.15}
					width="2.2"
					height="0.16"
					rx="0.08"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				{[0, 1, 2].map((row) =>
					[0, 1, 2].map((col) => (
						<rect
							key={`${row}-${col}`}
							x={0.65 + col * 0.7}
							y={faceH * 0.4 + row * 0.58}
							width="0.5"
							height="0.4"
							rx="0.1"
							className="illo-knock"
						/>
					)),
				)}
				{[0, 1, 2].map((row) =>
					[0, 1, 2].map((col) => (
						<rect
							key={`o${row}-${col}`}
							x={0.65 + col * 0.7}
							y={faceH * 0.4 + row * 0.58}
							width="0.5"
							height="0.4"
							rx="0.1"
							className="illo-outline"
							vectorEffect="non-scaling-stroke"
							opacity="0.75"
						/>
					)),
				)}
			</g>

			{/* receipt slot on the lower-right face */}
			<g transform={g.rightMatrix(1.6, 1.3, wall)}>
				<rect
					x="0.55"
					y={faceH * 0.62}
					width="1.5"
					height="0.18"
					rx="0.09"
					className="illo-knock"
				/>
				<rect
					x="0.55"
					y={faceH * 0.62}
					width="1.5"
					height="0.18"
					rx="0.09"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
			</g>

			<path d={body.outline} className="illo-outline" />

			<CardPlate
				g={g}
				a={3.6}
				b={-2.4}
				h={42 * s}
				hx={1.5}
				hy={0.95}
				lift={1.1 * s}
			/>

			<Beacon g={g} a={-3.6} b={2.2} markSize={15 * s} />

			{/* motes */}
			<circle cx={46 * s} cy={28 * s} r={1.8 * s} className="illo-mote" />
			<circle cx={172 * s} cy={68 * s} r={2 * s} className="illo-accent-soft" />
			<circle cx={152 * s} cy={100 * s} r={1.6 * s} className="illo-mote" />
			{hero && (
				<>
					<circle cx={296} cy={40} r={2.6} className="illo-mote" />
					<circle cx={54} cy={148} r={2.4} className="illo-accent-soft" />
					<rect
						x={60}
						y={40}
						width={5}
						height={5}
						rx={1}
						transform="rotate(-20 62 42)"
						className="illo-accent-soft"
					/>
					<rect
						x={276}
						y={152}
						width={5}
						height={5}
						rx={1}
						transform="rotate(18 278 154)"
						className="illo-mote"
					/>
				</>
			)}
		</>
	);
}

export function PaymentsNone() {
	return <PaymentsScene hero={false} />;
}

export function PaymentsNoneHero() {
	return <PaymentsScene hero />;
}

export function PaymentsNoneSm() {
	const g = isoGrid(40, 26, 8);
	return (
		<>
			<path d={g.ground(-1.0, -1.0, 0, 2.0, 2.0)} className="illo-cast" />
			<CardPlate g={g} a={0} b={0} h={13} hx={1.5} hy={0.95} lift={1.1} />
		</>
	);
}

/* ----------------------------------------------------------------- messages */

/** Rounded speech bubble in the top plane, tail hanging toward the viewer. */
function bubblePath(
	hx: number,
	hy: number,
	r: number,
	tail: "left" | "right" | "none",
): string {
	const rightEdge =
		tail === "right"
			? ` V -0.2 L ${hx + 0.72} 0.16 L ${hx} 0.52 V ${hy - r}`
			: ` V ${hy - r}`;
	const bottomEdge =
		tail === "left"
			? ` H -0.34 L ${-hx * 0.8} ${hy + 0.8} L -0.92 ${hy} H ${-hx + r}`
			: ` H ${-hx + r}`;
	return (
		`M ${-hx + r} ${-hy} H ${hx - r} A ${r} ${r} 0 0 1 ${hx} ${-hy + r}` +
		rightEdge +
		` A ${r} ${r} 0 0 1 ${hx - r} ${hy}` +
		bottomEdge +
		` A ${r} ${r} 0 0 1 ${-hx} ${hy - r} V ${-hy + r}` +
		` A ${r} ${r} 0 0 1 ${-hx + r} ${-hy} Z`
	);
}

function Bubble({
	g,
	a,
	b,
	h,
	hx,
	hy,
	tail,
	accent,
	bars,
}: {
	g: Grid;
	a: number;
	b: number;
	h: number;
	hx: number;
	hy: number;
	tail: "left" | "right";
	accent?: boolean;
	bars: number[];
}) {
	const d = bubblePath(hx, hy, 0.32, tail);
	return (
		<g transform={g.topMatrix(a, b, h)}>
			<path d={d} className={accent ? "illo-accent" : "illo-knock"} />
			<path
				d={d}
				className="illo-outline"
				vectorEffect="non-scaling-stroke"
			/>
			{bars.map((w, i) => (
				<rect
					key={i}
					x={-hx + 0.34}
					y={-hy + 0.42 + i * 0.5}
					width={w}
					height="0.26"
					rx="0.13"
					className={accent ? "illo-fill-knock" : "illo-mote"}
				/>
			))}
		</g>
	);
}

function MessagesScene({ hero }: { hero: boolean }) {
	const s = hero ? 1.6 : 1;
	const g = isoGrid(100 * s, 78 * s, 8 * s);
	return (
		<>
			{/* only the lower bubble is close enough to the floor to cast */}
			<path d={g.ground(-2.1, 0.95, 0, 2.5, 1.4)} className="illo-cast" />

			{/* dashed reply on the way in */}
			<g transform={g.topMatrix(3.0, -2.6, 43 * s)}>
				<path
					d={bubblePath(1.4, 0.85, 0.32, "right")}
					className="illo-dash"
					vectorEffect="non-scaling-stroke"
				/>
			</g>

			<Bubble
				g={g}
				a={1.7}
				b={-1.2}
				h={21 * s}
				hx={1.5}
				hy={0.9}
				tail="right"
				accent
				bars={[2.2, 1.5]}
			/>
			<Bubble
				g={g}
				a={-0.8}
				b={1.6}
				h={11 * s}
				hx={1.7}
				hy={1.0}
				tail="left"
				bars={[2.6, 2.0]}
			/>

			<Beacon g={g} a={-4.5} b={2.9} markSize={15 * s} />

			{/* motes */}
			<circle cx={44 * s} cy={30 * s} r={1.8 * s} className="illo-mote" />
			<circle cx={178 * s} cy={86 * s} r={2 * s} className="illo-accent-soft" />
			<circle cx={168 * s} cy={26 * s} r={1.6 * s} className="illo-mote" />
			{hero && (
				<>
					<circle cx={62} cy={148} r={2.4} className="illo-accent-soft" />
					<circle cx={298} cy={112} r={2.6} className="illo-mote" />
					<rect
						x={48}
						y={92}
						width={5}
						height={5}
						rx={1}
						transform="rotate(-22 50 94)"
						className="illo-mote"
					/>
					<rect
						x={286}
						y={62}
						width={5}
						height={5}
						rx={1}
						transform="rotate(20 288 64)"
						className="illo-accent-soft"
					/>
				</>
			)}
		</>
	);
}

export function MessagesNone() {
	return <MessagesScene hero={false} />;
}

export function MessagesNoneHero() {
	return <MessagesScene hero />;
}

export function MessagesNoneSm() {
	const g = isoGrid(38, 26, 6);
	return (
		<>
			<path d={g.ground(-1.2, -0.6, 0, 2.6, 2.0)} className="illo-cast" />
			<Bubble
				g={g}
				a={1.6}
				b={-1.1}
				h={15}
				hx={1.3}
				hy={0.8}
				tail="right"
				accent
				bars={[1.9]}
			/>
			<Bubble
				g={g}
				a={-0.9}
				b={1.1}
				h={8}
				hx={1.4}
				hy={0.85}
				tail="left"
				bars={[2.1]}
			/>
		</>
	);
}
