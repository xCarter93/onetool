/**
 * V2 flow / state scenes — automations, quote approval, access, error.
 *
 * Same staging recipe as the other V2 tiers: iso solids on the ground, one
 * floating knockout plate carrying the real content, one accent moment, the
 * OneTool beacon, cast shadows, a few motes. AppError is the one exception —
 * it drops the accent hue and the beacon for a destructive-tinted warning.
 */
import { isoGrid } from "../iso";
import { OneToolMark } from "../mark";
import { Beacon } from "./celebration";

type Grid = ReturnType<typeof isoGrid>;

/* ---------------------------------------------------------------- helpers */

/** Small ground cube — a pipeline node. Accent variant carries the bolt. */
function NodeCube({
	g,
	a,
	b,
	size,
	ht,
	accent,
}: {
	g: Grid;
	a: number;
	b: number;
	size: number;
	ht: number;
	accent?: boolean;
}) {
	const cube = g.box(a, b, 0, size, size, ht);
	return (
		<>
			<path
				d={g.ground(a - 0.28, b - 0.28, 0, size + 0.56, size + 0.56)}
				className="illo-cast"
			/>
			<path
				d={cube.top}
				className={accent ? "illo-accent" : "illo-face-top"}
			/>
			<path
				d={cube.left}
				className={accent ? "illo-accent-shade" : "illo-face-left"}
			/>
			<path
				d={cube.right}
				className={accent ? "illo-accent-shade" : "illo-face-right"}
			/>
			<path d={cube.top} className="illo-outline" />
			<path d={cube.outline} className="illo-outline" />
		</>
	);
}

/** Knockout lightning bolt, laid flat into a top face. */
function TopBolt({ g, a, b, h }: { g: Grid; a: number; b: number; h: number }) {
	return (
		<g transform={g.topMatrix(a, b, h)}>
			<path
				d="M 0.12 -0.46 L -0.3 0.07 L -0.03 0.07 L -0.13 0.46 L 0.3 -0.08 L 0.03 -0.08 Z"
				className="illo-fill-knock"
			/>
		</g>
	);
}

/** Standing accent disc with a knockout check — the "approved" chip. */
function ApprovePuck({
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
			<g transform={g.rightMatrix(a - 0.55, b, h)}>
				<circle cx="0" cy="0" r={r} className="illo-accent-shade" />
				<circle
					cx="0"
					cy="0"
					r={r}
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
			</g>
			<g transform={g.rightMatrix(a, b, h)}>
				<circle cx="0" cy="0" r={r} className="illo-accent" />
				<circle
					cx="0"
					cy="0"
					r={r}
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				<path
					d={`M ${-r * 0.42} 0 l ${r * 0.32} ${r * 0.36} l ${r * 0.62} ${-r * 0.72}`}
					className="illo-on-accent"
					vectorEffect="non-scaling-stroke"
				/>
			</g>
		</>
	);
}

/* -------------------------------------------------------------- automations */

function AutomationsNoneScene({ hero }: { hero: boolean }) {
	const s = hero ? 1.6 : 1;
	const g = isoGrid(70 * s, 42 * s, 8 * s);
	const size = 1.5;
	const ht = 12 * s;
	// Three cubes on one screen-horizontal run: +a and −b in equal steps.
	const nodes = [
		{ a: -3.5, b: 2.0 },
		{ a: -0.75, b: -0.75 },
		{ a: 2.0, b: -3.5 },
	];
	const link = (i: number) => {
		const from = nodes[i];
		const to = nodes[i + 1];
		const [x1, y1] = g.pt(from.a + size, from.b, ht * 0.5);
		const [x2, y2] = g.pt(to.a, to.b + size, ht * 0.5);
		return `M${x1} ${y1} Q ${(x1 + x2) / 2} ${(y1 + y2) / 2 + 7 * s} ${x2} ${y2}`;
	};
	const last = nodes[2];
	const [bx, by] = g.pt(last.a + size, last.b, ht * 0.5);
	const tr = 8 * s;
	const t1 = [162 * s, 18 * s];
	const t2 = [158 * s, 72 * s];
	// Shared stem out of the last node, then the fork.
	const stem = `M${bx} ${by} L ${bx + 8 * s} ${by}`;

	return (
		<>
			{/* dashed pipeline, drawn under the solids */}
			<path
				d={link(0)}
				fill="none"
				className="illo-dash"
				vectorEffect="non-scaling-stroke"
			/>
			<path
				d={link(1)}
				fill="none"
				className="illo-dash"
				vectorEffect="non-scaling-stroke"
			/>
			{/* the branch: one run out of the last node, two destinations */}
			<path
				d={`${stem} C ${bx + 17 * s} ${by}, ${t1[0] - tr - 9 * s} ${t1[1]}, ${t1[0] - tr - 1.5 * s} ${t1[1]}`}
				fill="none"
				className="illo-dash"
				vectorEffect="non-scaling-stroke"
			/>
			<path
				d={`${stem} C ${bx + 15 * s} ${by}, ${t2[0] - tr - 9 * s} ${t2[1]}, ${t2[0] - tr - 1.5 * s} ${t2[1]}`}
				fill="none"
				className="illo-dash"
				vectorEffect="non-scaling-stroke"
			/>
			<circle
				cx={t1[0]}
				cy={t1[1]}
				r={tr}
				fill="none"
				className="illo-dash"
				vectorEffect="non-scaling-stroke"
			/>
			<circle
				cx={t2[0]}
				cy={t2[1]}
				r={tr}
				fill="none"
				className="illo-dash"
				vectorEffect="non-scaling-stroke"
			/>

			{/* nodes, back to front */}
			<NodeCube g={g} a={nodes[2].a} b={nodes[2].b} size={size} ht={ht} />
			<NodeCube g={g} a={nodes[1].a} b={nodes[1].b} size={size} ht={ht} accent />
			<TopBolt g={g} a={0} b={0} h={ht} />
			<NodeCube g={g} a={nodes[0].a} b={nodes[0].b} size={size} ht={ht} />

			{/* OneTool beacon, front-left */}
			<Beacon g={g} a={3.1} b={6.85} markSize={15 * s} />

			{/* motes */}
			<circle cx={22 * s} cy={64 * s} r={1.8 * s} className="illo-mote" />
			<circle cx={94 * s} cy={12 * s} r={2 * s} className="illo-accent-soft" />
			<circle cx={188 * s} cy={46 * s} r={1.6 * s} className="illo-mote" />
			<circle cx={104 * s} cy={104 * s} r={1.9 * s} className="illo-mote" />
			{hero && (
				<>
					<circle cx={296} cy={62} r={2.6} className="illo-mote" />
					<rect
						x={118}
						y={168}
						width={5}
						height={5}
						rx={1}
						transform="rotate(-16 120 170)"
						className="illo-accent-soft"
					/>
					<rect
						x={286}
						y={150}
						width={5}
						height={5}
						rx={1}
						transform="rotate(22 288 152)"
						className="illo-mote"
					/>
				</>
			)}
		</>
	);
}

export function AutomationsNone() {
	return <AutomationsNoneScene hero={false} />;
}

export function AutomationsNoneHero() {
	return <AutomationsNoneScene hero />;
}

export function AutomationsNoneSm() {
	const g = isoGrid(40, 30, 4.6);
	const size = 1.5;
	const ht = 8;
	const n1 = { a: -2.25, b: 0.75 };
	const n2 = { a: 0.75, b: -2.25 };
	const [x1, y1] = g.pt(n1.a + size, n1.b, ht * 0.5);
	const [x2, y2] = g.pt(n2.a, n2.b + size, ht * 0.5);
	return (
		<>
			<path
				d={`M${x1} ${y1} Q ${(x1 + x2) / 2} ${(y1 + y2) / 2 + 4.5} ${x2} ${y2}`}
				fill="none"
				className="illo-dash"
				vectorEffect="non-scaling-stroke"
			/>
			<NodeCube g={g} a={n2.a} b={n2.b} size={size} ht={ht} accent />
			<TopBolt g={g} a={n2.a + size / 2} b={n2.b + size / 2} h={ht} />
			<NodeCube g={g} a={n1.a} b={n1.b} size={size} ht={ht} />
		</>
	);
}

/* ---------------------------------------------------------- quote approval */

function QuoteApprovalNoneScene({ hero }: { hero: boolean }) {
	const s = hero ? 1.6 : 1;
	const g = isoGrid(92 * s, 66 * s, 8 * s);
	const plinth = g.box(-3, -2.9, 0, 6, 5.8, 9 * s);
	const rows: [number, number][] = [
		[-1.35, 3.0],
		[-0.73, 2.4],
		[-0.11, 1.7],
		[0.51, 1.5],
	];
	return (
		<>
			{/* ground + plinth */}
			<path d={g.ground(-3.5, -3.4, 0, 7.0, 6.8)} className="illo-cast" />
			<path d={plinth.top} className="illo-face-top" />
			<path d={plinth.left} className="illo-face-left" />
			<path d={plinth.right} className="illo-face-right" />
			<path d={plinth.top} className="illo-outline" />
			<path d={plinth.outline} className="illo-outline" />

			{/* the plate's shadow on the plinth top */}
			<path
				d={g.ground(-2.0, -2.6, 9 * s + 0.5, 4.0, 5.2)}
				className="illo-cast"
			/>

			{/* the quote itself, floating */}
			<g transform={g.topMatrix(0, 0, 28 * s)}>
				<rect
					x="-2.2"
					y="-2.8"
					width="4.4"
					height="5.6"
					rx="0.4"
					className="illo-knock"
				/>
				<rect
					x="-2.2"
					y="-2.8"
					width="4.4"
					height="5.6"
					rx="0.4"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				{/* header: title bar + rule */}
				<rect
					x="-1.75"
					y="-2.35"
					width="2.3"
					height="0.36"
					rx="0.18"
					className="illo-accent-soft"
				/>
				<line
					x1="-1.9"
					y1="-1.8"
					x2="1.9"
					y2="-1.8"
					className="illo-hair"
					vectorEffect="non-scaling-stroke"
				/>
				{/* line items */}
				{rows.map(([y, w], i) => (
					<rect
						key={i}
						x="-1.75"
						y={y}
						width={w}
						height="0.3"
						rx="0.15"
						className="illo-mote"
					/>
				))}
				{/* where the seal will land */}
				<circle
					cx="1.2"
					cy="0.5"
					r="0.72"
					fill="none"
					className="illo-dash"
					vectorEffect="non-scaling-stroke"
				/>
				{/* signature: squiggle over a hair rule */}
				<path
					d="M -1.6 2.02 c 0.26 -0.5 0.48 0.34 0.74 -0.1 c 0.22 -0.36 0.44 0.3 0.68 -0.06"
					fill="none"
					className="illo-hair"
					vectorEffect="non-scaling-stroke"
				/>
				<line
					x1="-1.75"
					y1="2.24"
					x2="0.55"
					y2="2.24"
					className="illo-hair"
					vectorEffect="non-scaling-stroke"
				/>
			</g>

			{/* accent approval chip at the plate's lower-right corner */}
			<ApprovePuck g={g} a={2.6} b={-0.5} h={30 * s} r={1.45} />

			{/* OneTool beacon, front-left */}
			<Beacon g={g} a={-0.2} b={6.6} markSize={15 * s} />

			{/* motes */}
			<circle cx={24 * s} cy={34 * s} r={1.8 * s} className="illo-mote" />
			<circle
				cx={168 * s}
				cy={24 * s}
				r={2 * s}
				className="illo-accent-soft"
			/>
			<circle cx={176 * s} cy={82 * s} r={1.6 * s} className="illo-mote" />
			{hero && (
				<>
					<circle cx={292} cy={132} r={2.6} className="illo-mote" />
					<rect
						x={44}
						y={40}
						width={5}
						height={5}
						rx={1}
						transform="rotate(20 46 42)"
						className="illo-accent-soft"
					/>
					<rect
						x={276}
						y={62}
						width={5}
						height={5}
						rx={1}
						transform="rotate(-14 278 64)"
						className="illo-mote"
					/>
				</>
			)}
		</>
	);
}

export function QuoteApprovalNone() {
	return <QuoteApprovalNoneScene hero={false} />;
}

export function QuoteApprovalNoneHero() {
	return <QuoteApprovalNoneScene hero />;
}

export function QuoteApprovalNoneSm() {
	const g = isoGrid(32, 24, 5);
	return (
		<>
			<path d={g.ground(-1.8, -2.3, 0, 3.6, 4.6)} className="illo-cast" />
			<g transform={g.topMatrix(0, 0, 8)}>
				<rect
					x="-1.8"
					y="-2.3"
					width="3.6"
					height="4.6"
					rx="0.35"
					className="illo-knock"
				/>
				<rect
					x="-1.8"
					y="-2.3"
					width="3.6"
					height="4.6"
					rx="0.35"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				<rect
					x="-1.4"
					y="-1.9"
					width="1.9"
					height="0.34"
					rx="0.17"
					className="illo-mote"
				/>
				<rect
					x="-1.4"
					y="-0.9"
					width="2.5"
					height="0.3"
					rx="0.15"
					className="illo-mote"
				/>
				<rect
					x="-1.4"
					y="-0.2"
					width="1.8"
					height="0.3"
					rx="0.15"
					className="illo-mote"
				/>
				<line
					x1="-1.4"
					y1="1.7"
					x2="0.5"
					y2="1.7"
					className="illo-hair"
					vectorEffect="non-scaling-stroke"
				/>
			</g>
			<ApprovePuck g={g} a={4.85} b={-0.35} h={9} r={1.7} />
		</>
	);
}

/* -------------------------------------------------------- access restricted */

function AccessRestrictedScene({ hero }: { hero: boolean }) {
	const s = hero ? 1.6 : 1;
	const g = isoGrid(104 * s, 60 * s, 8 * s);
	const plinth = g.box(-2.1, -1.6, 0, 4.2, 3.2, 9 * s);
	const body = g.box(-0.6, -1.25, 9 * s, 1.2, 2.5, 22 * s);
	const shackle = "M -1 0.2 L -1 -1.2 A 1 1 0 0 1 1 -1.2 L 1 0.2";
	return (
		<>
			{/* ground + plinth */}
			<path d={g.ground(-2.7, -2.1, 0, 5.4, 4.2)} className="illo-cast" />
			<path d={plinth.top} className="illo-face-top" />
			<path d={plinth.left} className="illo-face-left" />
			<path d={plinth.right} className="illo-face-right" />
			<path d={plinth.top} className="illo-outline" />
			<path d={plinth.outline} className="illo-outline" />

			{/* the padlock's own shadow on the plinth top */}
			<path
				d={g.ground(-0.95, -1.6, 9 * s + 0.5, 1.9, 3.2)}
				className="illo-cast"
			/>

			{/* shackle first — the body's top face buries the leg ends */}
			<g transform={g.rightMatrix(0, 0, 31 * s)}>
				<path
					d={shackle}
					fill="none"
					className="illo-outline"
					style={{ strokeWidth: 4.6 }}
					vectorEffect="non-scaling-stroke"
				/>
				<path
					d={shackle}
					fill="none"
					className="illo-accent-line"
					style={{ strokeWidth: 2.9 }}
					vectorEffect="non-scaling-stroke"
				/>
			</g>

			{/* lock body */}
			<path d={body.top} className="illo-accent" />
			<path d={body.left} className="illo-accent-shade" />
			<path d={body.right} className="illo-accent-shade" />
			<path d={body.top} className="illo-outline" />
			<path d={body.outline} className="illo-outline" />

			{/* keyhole, knocked out of the lower-right face */}
			<g transform={g.rightMatrix(0.6, 0, 21 * s)}>
				<circle cx="0" cy="0" r="0.33" className="illo-fill-knock" />
				<path
					d="M -0.11 0.18 L 0.11 0.18 L 0.19 0.66 L -0.19 0.66 Z"
					className="illo-fill-knock"
				/>
			</g>

			{/* OneTool beacon, front-left */}
			<Beacon g={g} a={-0.13} b={6.63} markSize={15 * s} />

			{/* motes */}
			<circle cx={30 * s} cy={28 * s} r={1.8 * s} className="illo-mote" />
			<circle
				cx={166 * s}
				cy={38 * s}
				r={2 * s}
				className="illo-accent-soft"
			/>
			<circle cx={172 * s} cy={94 * s} r={1.6 * s} className="illo-mote" />
			{hero && (
				<>
					<circle cx={298} cy={72} r={2.6} className="illo-mote" />
					<rect
						x={62}
						y={112}
						width={5}
						height={5}
						rx={1}
						transform="rotate(18 64 114)"
						className="illo-accent-soft"
					/>
					<rect
						x={286}
						y={148}
						width={5}
						height={5}
						rx={1}
						transform="rotate(-20 288 150)"
						className="illo-mote"
					/>
				</>
			)}
		</>
	);
}

export function AccessRestricted() {
	return <AccessRestrictedScene hero={false} />;
}

export function AccessRestrictedHero() {
	return <AccessRestrictedScene hero />;
}

export function AccessRestrictedSm() {
	const g = isoGrid(40, 32, 6);
	const tile = g.box(-1.4, -1.15, 0, 2.8, 2.3, 5);
	const body = g.box(-0.45, -1.0, 5, 0.9, 2.0, 12);
	const shackle = "M -0.75 0.2 L -0.75 -0.85 A 0.75 0.75 0 0 1 0.75 -0.85 L 0.75 0.2";
	return (
		<>
			<path d={g.ground(-1.7, -1.4, 0, 3.4, 2.8)} className="illo-cast" />
			<path d={tile.top} className="illo-face-top" />
			<path d={tile.left} className="illo-face-left" />
			<path d={tile.right} className="illo-face-right" />
			<path d={tile.top} className="illo-outline" />
			<path d={tile.outline} className="illo-outline" />
			<g transform={g.rightMatrix(0, 0, 17)}>
				<path
					d={shackle}
					fill="none"
					className="illo-outline"
					style={{ strokeWidth: 3.4 }}
					vectorEffect="non-scaling-stroke"
				/>
				<path
					d={shackle}
					fill="none"
					className="illo-accent-line"
					style={{ strokeWidth: 2.1 }}
					vectorEffect="non-scaling-stroke"
				/>
			</g>
			<path d={body.top} className="illo-accent" />
			<path d={body.left} className="illo-accent-shade" />
			<path d={body.right} className="illo-accent-shade" />
			<path d={body.top} className="illo-outline" />
			<path d={body.outline} className="illo-outline" />
			<g transform={g.rightMatrix(0.45, 0, 11)}>
				<circle cx="0" cy="0" r="0.32" className="illo-fill-knock" />
				<path
					d="M -0.11 0.17 L 0.11 0.17 L 0.19 0.64 L -0.19 0.64 Z"
					className="illo-fill-knock"
				/>
			</g>
		</>
	);
}

/* ---------------------------------------------------------------- app error */

/**
 * The tear, left→right in the plate's local coords. Both fragments share it so
 * the torn edges stay congruent when the lower half drops away.
 */
const TEAR = "L -1.45 0.33 L -0.85 0.77 L -0.2 0.25 L 0.45 0.7 L 1.1 0.27 L 1.65 0.65 L 2.1 0.3";
const TEAR_BACK =
	"L 1.65 0.65 L 1.1 0.27 L 0.45 0.7 L -0.2 0.25 L -0.85 0.77 L -1.45 0.33 L -2.1 0.75";

/** Upper fragment: rounded top corners, torn bottom edge. */
const UPPER_PLATE = `M -2.1 -2.15 Q -2.1 -2.5 -1.75 -2.5 L 1.75 -2.5 Q 2.1 -2.5 2.1 -2.15 L 2.1 0.3 ${TEAR_BACK} Z`;

/** Lower fragment: torn top edge, rounded bottom corners. */
const LOWER_PLATE = `M -2.1 0.75 ${TEAR} L 2.1 2.15 Q 2.1 2.5 1.75 2.5 L -1.75 2.5 Q -2.1 2.5 -2.1 2.15 Z`;

function AppErrorScene({ hero }: { hero: boolean }) {
	const s = hero ? 1.6 : 1;
	const g = isoGrid(96 * s, 60 * s, 8 * s);
	const upperH = 26 * s;
	const [mx, my] = g.pt(-0.95, -1.62, upperH);
	const mark = 10 * s;
	const dx = 164 * s;
	const dy = 36 * s;
	const dr = 14 * s;
	return (
		<>
			{/* one soft shadow spanning both fragments */}
			<path d={g.ground(-1.85, -1.8, 0, 3.9, 4.4)} className="illo-cast" />

			{/* lower fragment — dropped and tilted in-plane */}
			<g transform={`${g.topMatrix(0.2, 0.45, 17 * s)} rotate(4)`}>
				<path d={LOWER_PLATE} className="illo-knock" />
				<path
					d={LOWER_PLATE}
					fill="none"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				<rect
					x="-1.4"
					y="1.12"
					width="1.05"
					height="0.3"
					rx="0.15"
					className="illo-mote"
				/>
				<rect
					x="-0.1"
					y="1.12"
					width="1.7"
					height="0.3"
					rx="0.15"
					className="illo-mote"
				/>
				<rect
					x="-1.75"
					y="1.66"
					width="3.0"
					height="0.3"
					rx="0.15"
					className="illo-mote"
				/>
				<rect
					x="-1.75"
					y="2.1"
					width="2.1"
					height="0.3"
					rx="0.15"
					className="illo-mote"
				/>
			</g>

			{/* upper fragment — still hovering where the doc was */}
			<g transform={g.topMatrix(0, 0, upperH)}>
				<path d={UPPER_PLATE} className="illo-knock" />
				<path
					d={UPPER_PLATE}
					fill="none"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				<rect
					x="0.05"
					y="-1.72"
					width="1.45"
					height="0.3"
					rx="0.15"
					className="illo-mote"
				/>
				<line
					x1="-1.85"
					y1="-1.05"
					x2="1.85"
					y2="-1.05"
					className="illo-hair"
					vectorEffect="non-scaling-stroke"
				/>
				<rect
					x="-1.75"
					y="-0.75"
					width="3.2"
					height="0.32"
					rx="0.16"
					className="illo-mote"
				/>
				<rect
					x="-1.75"
					y="-0.2"
					width="1.9"
					height="0.32"
					rx="0.16"
					className="illo-mote"
				/>
				<rect
					x="0.4"
					y="-0.2"
					width="0.7"
					height="0.32"
					rx="0.16"
					className="illo-mote"
				/>
			</g>

			{/* the mark, quietly etched on the surviving header */}
			<OneToolMark
				x={mx - mark / 2}
				y={my - mark / 2}
				size={mark}
				variant="outline"
				opacity={0.6}
			/>

			{/* warning — the one scene allowed the destructive hue */}
			<circle cx={dx} cy={dy} r={dr} fill="var(--destructive)" opacity={0.14} />
			<line
				x1={dx}
				y1={dy - dr * 0.42}
				x2={dx}
				y2={dy + dr * 0.08}
				stroke="var(--destructive)"
				strokeWidth={2.4 * s}
				strokeLinecap="round"
			/>
			<line
				x1={dx}
				y1={dy + dr * 0.42}
				x2={dx}
				y2={dy + dr * 0.43}
				stroke="var(--destructive)"
				strokeWidth={2.4 * s}
				strokeLinecap="round"
			/>

			{/* motes — neutral only in this scene */}
			<circle cx={34 * s} cy={26 * s} r={1.9 * s} className="illo-mote" />
			<circle cx={44 * s} cy={98 * s} r={1.6 * s} className="illo-mote" />
			<circle cx={178 * s} cy={96 * s} r={2 * s} className="illo-mote" />
			{hero && (
				<>
					<circle cx={300} cy={128} r={2.4} className="illo-mote" />
					<rect
						x={40}
						y={148}
						width={5}
						height={5}
						rx={1}
						transform="rotate(-18 42 150)"
						className="illo-mote"
					/>
				</>
			)}
		</>
	);
}

export function AppError() {
	return <AppErrorScene hero={false} />;
}

export function AppErrorHero() {
	return <AppErrorScene hero />;
}

export function AppErrorSm() {
	const g = isoGrid(32, 24, 5);
	return (
		<>
			<path d={g.ground(-1.8, -2.0, 0, 3.6, 4.2)} className="illo-cast" />
			<g transform={`${g.topMatrix(0.15, 0.35, 5)} rotate(4) scale(0.81)`}>
				<path d={LOWER_PLATE} className="illo-knock" />
				<path
					d={LOWER_PLATE}
					fill="none"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				<rect
					x="-1.5"
					y="1.35"
					width="2.4"
					height="0.34"
					rx="0.17"
					className="illo-mote"
				/>
			</g>
			<g transform={`${g.topMatrix(0, 0, 10)} scale(0.81)`}>
				<path d={UPPER_PLATE} className="illo-knock" />
				<path
					d={UPPER_PLATE}
					fill="none"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				<rect
					x="-1.5"
					y="-1.75"
					width="2.4"
					height="0.34"
					rx="0.17"
					className="illo-mote"
				/>
				<rect
					x="-1.5"
					y="-0.9"
					width="1.8"
					height="0.34"
					rx="0.17"
					className="illo-mote"
				/>
			</g>
			<circle cx={64} cy={33} r={9} fill="var(--destructive)" opacity={0.16} />
			<line
				x1={64}
				y1={29.4}
				x2={64}
				y2={33.9}
				stroke="var(--destructive)"
				strokeWidth={1.7}
				strokeLinecap="round"
			/>
			<line
				x1={64}
				y1={36.6}
				x2={64}
				y2={36.7}
				stroke="var(--destructive)"
				strokeWidth={1.7}
				strokeLinecap="round"
			/>
		</>
	);
}
