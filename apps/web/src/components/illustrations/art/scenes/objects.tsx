/**
 * V2 object empties — a physical prop stands in for the records that will land:
 * a property, a document tray, a card terminal, a conversation.
 *
 * Same recipe as the other V2 scenes: one hero solid on the iso grid, floating
 * knockout plates carrying the real content, exactly one OneTool mark, cast
 * shadows, a few motes. Accent hue only (celebrate is reserved for wins).
 */
import { isoGrid, ISO_T } from "../iso";
import { OneToolMark } from "../mark";
import { Beacon } from "./celebration";

type Grid = ReturnType<typeof isoGrid>;

/* ---------------------------------------------------------------- helpers */

/** Lays 1:1 screen-px artwork flat into the iso top plane (unit-scale
 *  topMatrix), so strokes keep their px width instead of scaling by `unit`. */
const FLAT = `matrix(1 ${ISO_T} -1 ${ISO_T} 0 0)`;
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

/* ----------------------------------------------------------- community page */

/** Satellite disc in the top plane — one arriving visitor. */
function LeadPuck({
	g,
	a,
	b,
	h,
	r,
}: {
	g: Grid;
	a: number;
	b: number;
	h: number;
	r: number;
}) {
	return (
		<>
			<g transform={g.topMatrix(a, b, h - 2)}>
				<circle r={r} className="illo-face-right" />
				<circle
					r={r}
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
			</g>
			<g transform={g.topMatrix(a, b, h)}>
				<circle r={r} className="illo-knock" />
				<circle
					r={r}
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
			</g>
		</>
	);
}

/**
 * The public page itself: an upright knockout card standing on the plinth,
 * drawn in the lower-left-facing plane. `w`/`ht` are iso units; every row is
 * derived from `ht` so the same card composes on the sm canvas.
 */
function PagePlate({
	g,
	a,
	b,
	h,
	w,
	ht,
	detail,
}: {
	g: Grid;
	a: number;
	b: number;
	h: number;
	w: number;
	ht: number;
	/** sm drops the header dots and the two footer rows — they'd render as mush. */
	detail: boolean;
}) {
	const hw = w / 2;
	const headH = ht * 0.16;
	const rowH = ht * 0.075;
	const contentTop = -ht + headH + 0.52;
	const thumbH = ht * 0.3;
	const thumbW = w * 0.32;
	const rowX = -hw + 0.3 + thumbW + 0.26;
	const rowMax = hw - 0.3 - rowX;
	const footY = contentTop + thumbH + ht * 0.12;
	return (
		<>
			{/* stepped back copy — the card reads as a slab, not a decal */}
			<g transform={g.leftMatrix(a, b - 0.18, h)}>
				<rect
					x={-hw}
					y={-ht}
					width={w}
					height={ht}
					rx="0.28"
					className="illo-face-right"
				/>
				<rect
					x={-hw}
					y={-ht}
					width={w}
					height={ht}
					rx="0.28"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
			</g>

			<g transform={g.leftMatrix(a, b, h)}>
				<rect
					x={-hw}
					y={-ht}
					width={w}
					height={ht}
					rx="0.28"
					className="illo-knock"
				/>
				<rect
					x={-hw}
					y={-ht}
					width={w}
					height={ht}
					rx="0.28"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>

				{/* header bar — the scene's only accent */}
				<rect
					x={-hw + 0.14}
					y={-ht + 0.14}
					width={w - 0.28}
					height={headH}
					rx={headH / 2}
					className="illo-accent"
				/>
				{detail &&
					[0, 1, 2].map((i) => (
						<circle
							key={i}
							cx={-hw + 0.42 + i * 0.26}
							cy={-ht + 0.14 + headH / 2}
							r={headH * 0.24}
							className="illo-knock"
						/>
					))}
				<line
					x1={-hw}
					y1={-ht + headH + 0.28}
					x2={hw}
					y2={-ht + headH + 0.28}
					className="illo-hair"
					vectorEffect="non-scaling-stroke"
				/>

				{/* page preview: a hero block and copy rows */}
				<rect
					x={-hw + 0.3}
					y={contentTop}
					width={thumbW}
					height={thumbH}
					rx="0.14"
					className="illo-mote"
				/>
				{[0.92, 0.6, 0.78].map((f, i) => (
					<rect
						key={f}
						x={rowX}
						y={contentTop + 0.04 + i * ht * 0.125}
						width={rowMax * f}
						height={rowH}
						rx={rowH / 2}
						className="illo-mote"
					/>
				))}
				{detail && (
					<>
						<rect
							x={-hw + 0.3}
							y={footY}
							width={w - 0.6}
							height={rowH}
							rx={rowH / 2}
							className="illo-mote"
						/>
						<rect
							x={-hw + 0.3}
							y={footY + ht * 0.14}
							width={(w - 0.6) * 0.62}
							height={rowH}
							rx={rowH / 2}
							className="illo-mote"
						/>
					</>
				)}
			</g>
		</>
	);
}

function CommunityPageScene({ hero }: { hero: boolean }) {
	const s = hero ? 1.6 : 1;
	const g = isoGrid(100 * s, 78 * s, 8 * s);
	const plinth = g.box(-2.9, -2.1, 0, 5.8, 4.2, 8 * s);
	// Satellites share one depth line (a + b = 0), so only their screen offset
	// and float height vary — the fan stays legible at every tier.
	const leads: ReadonlyArray<{ a: number; b: number; h: number; r: number }> = [
		{ a: -4, b: 4, h: 48 * s, r: 0.5 },
		{ a: -4.75, b: 4.75, h: 26 * s, r: 0.44 },
		{ a: 4.25, b: -4.25, h: 44 * s, r: 0.44 },
	];
	return (
		<>
			{/* inbound traffic — drawn first so each run threads under the card */}
			<path
				d={`M${44 * s} ${33 * s} Q${64 * s} ${26 * s} ${88 * s} ${38 * s}`}
				className="illo-dash"
			/>
			<path
				d={`M${30 * s} ${54 * s} Q${56 * s} ${46 * s} ${88 * s} ${44 * s}`}
				className="illo-dash"
			/>
			<path
				d={`M${160 * s} ${37 * s} Q${140 * s} ${33 * s} ${118 * s} ${56 * s}`}
				className="illo-dash"
			/>

			{/* plinth */}
			<path d={g.ground(-3.5, -2.7, 0, 7, 5.4)} className="illo-cast" />
			<path d={plinth.top} className="illo-face-top" />
			<path d={plinth.left} className="illo-face-left" />
			<path d={plinth.right} className="illo-face-right" />
			<path d={plinth.top} className="illo-outline" />
			<path d={plinth.outline} className="illo-outline" />

			{/* the live public page */}
			<PagePlate g={g} a={0} b={-0.5} h={8 * s} w={4.2} ht={3.3} detail />

			{/* the leads that arrived */}
			{leads.map((l) => (
				<LeadPuck key={l.a} g={g} a={l.a} b={l.b} h={l.h} r={l.r} />
			))}

			{/* OneTool beacon, front-left */}
			<Beacon g={g} a={-3.4} b={3.4} markSize={15 * s} />

			{/* motes */}
			<circle cx={72 * s} cy={16 * s} r={2 * s} className="illo-mote" />
			<circle cx={176 * s} cy={86 * s} r={2.2 * s} className="illo-accent-soft" />
			<circle cx={148 * s} cy={104 * s} r={1.6 * s} className="illo-mote" />
			{hero && (
				<>
					<circle cx={292} cy={40} r={2.6} className="illo-mote" />
					<circle cx={268} cy={158} r={2.4} className="illo-accent-soft" />
					<rect
						x={44}
						y={168}
						width={5}
						height={5}
						rx={1}
						transform="rotate(-18 46 170)"
						className="illo-accent-soft"
					/>
				</>
			)}
		</>
	);
}

export function CommunityPage() {
	return <CommunityPageScene hero={false} />;
}

export function CommunityPageHero() {
	return <CommunityPageScene hero />;
}

export function CommunityPageSm() {
	const g = isoGrid(46, 30, 5.2);
	const plinth = g.box(-1.9, -1.4, 0, 3.8, 2.8, 5);
	return (
		<>
			<path d="M18 15 Q29 9 41 15" className="illo-dash" />
			<path d={g.ground(-2.3, -1.8, 0, 4.6, 3.6)} className="illo-cast" />
			<path d={plinth.top} className="illo-face-top" />
			<path d={plinth.left} className="illo-face-left" />
			<path d={plinth.right} className="illo-face-right" />
			<path d={plinth.top} className="illo-outline" />
			<path d={plinth.outline} className="illo-outline" />
			<PagePlate g={g} a={0} b={-0.4} h={5} w={3} ht={2} detail={false} />
			<LeadPuck g={g} a={-3.1} b={3.1} h={16} r={0.6} />
		</>
	);
}

/* --------------------------------------------------------------- route none */

/**
 * Standing map pin with slab thickness — the MapPin teardrop plus a stepped
 * back copy, so it reads as a milled marker rather than a flat glyph. Unlike
 * MapPin it carries no halo: the accent zone painted on the map face below is
 * what grounds it.
 */
function RoutePin({
	cx,
	cy,
	r,
	accent,
}: {
	cx: number;
	cy: number;
	r: number;
	accent?: boolean;
}) {
	// Offset toward −b (up-right on screen) so the thickness turns the way
	// every other solid in the grammar does.
	const teardrop = (ox: number, oy: number) =>
		`M ${cx + ox} ${cy + oy + r * 2.55}` +
		` L ${cx + ox - r * 0.76} ${cy + oy + r * 0.64}` +
		` A ${r} ${r} 0 1 1 ${cx + ox + r * 0.76} ${cy + oy + r * 0.64} Z`;
	const back = teardrop(r * 0.22, -r * 0.13);
	const front = teardrop(0, 0);
	return (
		<>
			<path
				d={back}
				className={accent ? "illo-accent-shade" : "illo-face-left"}
			/>
			<path d={back} className="illo-outline" />
			<path d={front} className={accent ? "illo-accent" : "illo-knock"} />
			<path d={front} className="illo-outline" />
			<ellipse
				cx={cx}
				cy={cy}
				rx={r * 0.42}
				ry={r * 0.36}
				className={accent ? "illo-accent-shade" : "illo-face-right"}
			/>
			<ellipse
				cx={cx}
				cy={cy}
				rx={r * 0.42}
				ry={r * 0.36}
				className="illo-outline"
			/>
		</>
	);
}

/** Screen-space polyline through iso points on the map face. */
function routePath(
	g: Grid,
	h: number,
	points: ReadonlyArray<readonly [number, number]>,
): string {
	return points
		.map(([a, b], i) => {
			const [x, y] = g.pt(a, b, h);
			return `${i === 0 ? "M" : "L"}${x} ${y}`;
		})
		.join(" ");
}

function RouteNoneScene({ hero }: { hero: boolean }) {
	const s = hero ? 1.6 : 1;
	const g = isoGrid(100 * s, 70 * s, 8 * s);
	const top = 7 * s;
	const slab = g.box(-4.6, -3.4, 0, 9.2, 6.8, top);
	// Turns land on iso axes so the run reads as streets, not a freehand squiggle.
	const stops: ReadonlyArray<readonly [number, number]> = [
		[-3.8, 2.0],
		[-2.45, 2.0],
		[-2.45, -1.4],
		[2.35, -1.4],
		[2.35, 1.4],
	];
	const [ax, ay] = g.pt(-2.45, -1.4, top);
	const [bx, by] = g.pt(2.35, 1.4, top);
	const pinR = 8 * s;
	return (
		<>
			{/* the map slab */}
			<path d={g.ground(-5.2, -4, 0, 10.4, 8)} className="illo-cast" />
			<path d={slab.top} className="illo-face-top" />
			<path d={slab.left} className="illo-face-left" />
			<path d={slab.right} className="illo-face-right" />
			<path d={slab.top} className="illo-outline" />
			<path d={slab.outline} className="illo-outline" />

			{/* fold creases — three panels, the cheapest way to say "map" */}
			{[-1.6, 1.6].map((a) => (
				<path
					key={a}
					d={routePath(g, top, [
						[a, -3.4],
						[a, 3.4],
					])}
					className="illo-hair"
				/>
			))}

			{/* the two zones the pins drop onto */}
			<path
				d={g.ground(-3.4, -2.2, top, 1.9, 1.6)}
				className="illo-accent-soft"
			/>
			<path
				d={g.ground(1.4, 0.6, top, 1.9, 1.6)}
				className="illo-accent-soft"
			/>

			{/* the planned run */}
			<path d={routePath(g, top, stops)} className="illo-dash" />

			{/* start marker, flat on the face */}
			<g transform={g.topMatrix(-3.8, 2, top)}>
				<circle r="0.44" className="illo-knock" />
				<circle
					r="0.44"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				<circle r="0.17" className="illo-mote" />
			</g>

			{/* pins, back to front — only the destination is accented */}
			<RoutePin cx={ax} cy={ay - pinR * 2.55} r={pinR} />
			<RoutePin cx={bx} cy={by - pinR * 2.55} r={pinR} accent />

			{/* OneTool beacon, front-left */}
			<Beacon g={g} a={-4.4} b={4.6} markSize={15 * s} />

			{/* motes */}
			<circle cx={168 * s} cy={24 * s} r={2 * s} className="illo-mote" />
			<circle cx={44 * s} cy={22 * s} r={1.7 * s} className="illo-accent-soft" />
			<circle cx={176 * s} cy={96 * s} r={1.6 * s} className="illo-mote" />
			{hero && (
				<>
					<circle cx={296} cy={44} r={2.6} className="illo-mote" />
					<circle cx={272} cy={150} r={2.4} className="illo-accent-soft" />
					<rect
						x={64}
						y={166}
						width={5}
						height={5}
						rx={1}
						transform="rotate(-18 66 168)"
						className="illo-accent-soft"
					/>
				</>
			)}
		</>
	);
}

export function RouteNone() {
	return <RouteNoneScene hero={false} />;
}

export function RouteNoneHero() {
	return <RouteNoneScene hero />;
}

export function RouteNoneSm() {
	const g = isoGrid(40, 26, 5.2);
	const top = 4;
	const slab = g.box(-2.6, -2, 0, 5.2, 4, top);
	const [px, py] = g.pt(0.9, 0.4, top);
	const r = 5.5;
	return (
		<>
			<path d={g.ground(-3.1, -2.5, 0, 6.2, 5)} className="illo-cast" />
			<path d={slab.top} className="illo-face-top" />
			<path d={slab.left} className="illo-face-left" />
			<path d={slab.right} className="illo-face-right" />
			<path d={slab.top} className="illo-outline" />
			<path d={slab.outline} className="illo-outline" />
			<path
				d={g.ground(0.4, -0.1, top, 1, 1)}
				className="illo-accent-soft"
			/>
			<path
				d={routePath(g, top, [
					[-1.6, 1.2],
					[-1.6, 0.4],
					[0.9, 0.4],
				])}
				className="illo-dash"
			/>
			<RoutePin cx={px} cy={py - r * 2.55} r={r} accent />
		</>
	);
}

/* ------------------------------------------------------- select conversation */

/** Handset lying flat: a thin slab with a knockout screen inset on its face. */
function HandsetPlate({
	g,
	h,
	half,
	depth,
	screen,
	detail,
}: {
	g: Grid;
	/** slab thickness in px */
	h: number;
	/** body half-span along +a */
	half: number;
	/** body half-span along +b */
	depth: number;
	/** inset of the screen from the body edge, in iso units */
	screen: number;
	detail: boolean;
}) {
	const body = g.box(-half, -depth, 0, half * 2, depth * 2, h);
	// Lifted a hair off the face so the knockout never z-fights the top fill.
	const face = h + 0.4;
	const sa = half - screen;
	const sb = depth - screen;
	const glass = g.ground(-sa, -sb, face, sa * 2, sb * 2);
	return (
		<>
			<path d={body.top} className="illo-face-top" />
			<path d={body.left} className="illo-face-left" />
			<path d={body.right} className="illo-face-right" />
			<path d={body.top} className="illo-outline" />
			<path d={body.outline} className="illo-outline" />
			<path d={glass} className="illo-knock" />
			<path d={glass} className="illo-hair" />
			{detail && (
				<>
					{/* earpiece slot along the back edge, home bar along the front */}
					<g transform={g.topMatrix(0, -sb + 0.32, face)}>
						<rect
							x="-0.5"
							y="-0.08"
							width="1"
							height="0.16"
							rx="0.08"
							className="illo-mote"
						/>
					</g>
					<g transform={g.topMatrix(0, sb - 0.3, face)}>
						<rect
							x="-0.7"
							y="-0.07"
							width="1.4"
							height="0.14"
							rx="0.07"
							className="illo-mote"
						/>
					</g>
				</>
			)}
		</>
	);
}

/**
 * Open envelope standing upright in the lower-left-facing plane: the raised
 * back flap, the letter peeking out of it, then the accented front panel with
 * its V crease. Widths are fractions of `w` so the same build composes on sm.
 */
function EnvelopePlate({
	g,
	a,
	b,
	h,
	w,
	eh,
	detail,
}: {
	g: Grid;
	a: number;
	b: number;
	h: number;
	w: number;
	/** front-panel height in iso units */
	eh: number;
	detail: boolean;
}) {
	const hw = w / 2;
	const apex = -eh * 1.72;
	const flap = `M${-hw} ${-eh} L0 ${apex} L${hw} ${-eh} Z`;
	const silhouette = `M${-hw} 0 L${-hw} ${-eh} L0 ${apex} L${hw} ${-eh} L${hw} 0 Z`;
	// Kept inside the flap's slanted edges, so the letter never pokes through.
	const lw = hw * 0.62;
	const lTop = -eh * 1.2;
	return (
		<>
			{/* stepped back copy — the envelope reads as a solid, not a decal */}
			<g transform={g.leftMatrix(a, b - 0.22, h)}>
				<path d={silhouette} className="illo-face-right" />
				<path
					d={silhouette}
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
			</g>

			<g transform={g.leftMatrix(a, b, h)}>
				{/* back flap, standing open */}
				<path d={flap} className="illo-face-top" />
				<path
					d={flap}
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>

				{/* the letter inside */}
				<rect
					x={-lw}
					y={lTop}
					width={lw * 2}
					height={-lTop - eh * 0.2}
					rx="0.12"
					className="illo-knock"
				/>
				<rect
					x={-lw}
					y={lTop}
					width={lw * 2}
					height={-lTop - eh * 0.2}
					rx="0.12"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				{detail &&
					[0.88, 0.6, 0.74].map((f, i) => (
						<rect
							key={f}
							x={-lw + 0.18}
							y={lTop + 0.22 + i * 0.3}
							width={(lw * 2 - 0.36) * f}
							height="0.16"
							rx="0.08"
							className="illo-mote"
						/>
					))}

				{/* front panel — the scene's only accent */}
				<rect
					x={-hw}
					y={-eh}
					width={w}
					height={eh}
					rx="0.14"
					className="illo-accent"
				/>
				<rect
					x={-hw}
					y={-eh}
					width={w}
					height={eh}
					rx="0.14"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				<path
					d={`M${-hw} ${-eh} L0 ${-eh * 0.44} L${hw} ${-eh}`}
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				{detail &&
					[-1, 0, 1].map((i) => (
						<circle
							key={i}
							cx={i * 0.34}
							cy={-eh * 0.16}
							r="0.11"
							className="illo-knock"
						/>
					))}
			</g>
		</>
	);
}

function SelectConversationScene({ hero }: { hero: boolean }) {
	const s = hero ? 1.6 : 1;
	const g = isoGrid(96 * s, 72 * s, 8 * s);
	const deck = 4 * s;
	return (
		<>
			<path d={g.ground(-4, -3, 0, 8, 6)} className="illo-cast" />
			<HandsetPlate
				g={g}
				h={deck}
				half={3.4}
				depth={2.4}
				screen={0.4}
				detail
			/>
			<EnvelopePlate
				g={g}
				a={0}
				b={-0.6}
				h={deck + 0.4}
				w={3.6}
				eh={2.4}
				detail
			/>

			{/* OneTool beacon, front-left */}
			<Beacon g={g} a={-3.6} b={3.4} markSize={15 * s} />

			{/* motes */}
			<circle cx={168 * s} cy={26 * s} r={2 * s} className="illo-mote" />
			<circle cx={34 * s} cy={30 * s} r={1.7 * s} className="illo-accent-soft" />
			<circle cx={162 * s} cy={96 * s} r={1.6 * s} className="illo-mote" />
			{hero && (
				<>
					<circle cx={296} cy={40} r={2.6} className="illo-mote" />
					<circle cx={280} cy={152} r={2.4} className="illo-accent-soft" />
					<rect
						x={52}
						y={172}
						width={5}
						height={5}
						rx={1}
						transform="rotate(20 54 174)"
						className="illo-mote"
					/>
				</>
			)}
		</>
	);
}

export function SelectConversation() {
	return <SelectConversationScene hero={false} />;
}

export function SelectConversationHero() {
	return <SelectConversationScene hero />;
}

export function SelectConversationSm() {
	const g = isoGrid(40, 26, 5.4);
	return (
		<>
			<path d={g.ground(-2.7, -2.1, 0, 5.4, 4.2)} className="illo-cast" />
			<HandsetPlate
				g={g}
				h={3}
				half={2.2}
				depth={1.6}
				screen={0.3}
				detail={false}
			/>
			<EnvelopePlate
				g={g}
				a={0}
				b={-0.4}
				h={3.4}
				w={2.4}
				eh={1.7}
				detail={false}
			/>
		</>
	);
}
