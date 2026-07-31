/**
 * V2 browse/filter empties — scenes for surfaces you land on before any data
 * has been chosen or matched.
 *
 * Language: the same isometric staging as the record scenes, but the story is
 * "nothing to look at yet" rather than "nothing exists" — a trail with an
 * empty next step, a lens over records that faded away, a chart whose bars
 * never reach the target, a detail pane waiting for a pick.
 */
import { isoGrid } from "../iso";
import { Beacon } from "./celebration";

type G = ReturnType<typeof isoGrid>;

/* ---------------------------------------------------------------- helpers */

/** Low ground slab, placed by its centre. */
function Slab({
	g,
	ca,
	cb,
	ht,
	w = 2.8,
	d = 2.4,
	cast = true,
}: {
	g: G;
	ca: number;
	cb: number;
	ht: number;
	w?: number;
	d?: number;
	cast?: boolean;
}) {
	const box = g.box(ca - w / 2, cb - d / 2, 0, w, d, ht);
	return (
		<>
			{cast && (
				<path
					d={g.ground(ca - w / 2 - 0.3, cb - d / 2 - 0.3, 0, w + 0.6, d + 0.6)}
					className="illo-cast"
				/>
			)}
			<path d={box.top} className="illo-face-top" />
			<path d={box.left} className="illo-face-left" />
			<path d={box.right} className="illo-face-right" />
			<path d={box.top} className="illo-outline" />
			<path d={box.outline} className="illo-outline" />
		</>
	);
}

/** Puck lying in the top plane, with a stepped back copy for thickness. */
function NodePuck({
	g,
	ca,
	cb,
	h,
	r,
	accent,
	bar,
}: {
	g: G;
	ca: number;
	cb: number;
	h: number;
	r: number;
	accent?: boolean;
	bar?: number;
}) {
	return (
		<>
			<g transform={g.topMatrix(ca, cb, h - 2)}>
				<circle
					r={r}
					className={accent ? "illo-accent-shade" : "illo-face-right"}
				/>
				<circle
					r={r}
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
			</g>
			<g transform={g.topMatrix(ca, cb, h)}>
				<circle r={r} className={accent ? "illo-accent" : "illo-knock"} />
				<circle
					r={r}
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				{bar ? (
					<rect
						x={r + 0.24}
						y={-0.16}
						width={bar}
						height="0.32"
						rx="0.16"
						className={accent ? "illo-accent-soft" : "illo-mote"}
					/>
				) : null}
			</g>
		</>
	);
}

/** Screen-space polyline through iso points — the trail on the ground plane.
 *  Drawn before the slabs so only the gaps between them show. */
function trailPath(
	g: G,
	points: ReadonlyArray<readonly [number, number]>,
): string {
	return points
		.map(([a, b], i) => {
			const [x, y] = g.pt(a, b, 0);
			return `${i === 0 ? "M" : "L"}${x} ${y}`;
		})
		.join(" ");
}

/* --------------------------------------------------------- activity trail */

function ActivityNoneScene({ hero }: { hero: boolean }) {
	const s = hero ? 1.6 : 1;
	const g = isoGrid(90 * s, 54 * s, 8 * s);
	const ht = 5 * s;
	const stops: ReadonlyArray<readonly [number, number]> = [
		[-5.0, -1.2],
		[-0.4, -0.6],
		[4.2, 0.0],
	];
	const empty: readonly [number, number] = [8.4, 0.4];
	return (
		<>
			{/* the trail itself, threading under the tiles */}
			<path
				d={trailPath(g, [
					[stops[0][0], stops[0][1]],
					[stops[1][0], stops[1][1]],
					[stops[2][0], stops[2][1]],
					[empty[0] - 1.4, empty[1]],
				])}
				className="illo-dash"
			/>

			{/* stepped ground tiles, back to front */}
			{stops.map(([ca, cb]) => (
				<Slab key={`${ca}`} g={g} ca={ca} cb={cb} ht={ht} w={2.8} d={1.9} />
			))}

			{/* the entries themselves */}
			<NodePuck
				g={g}
				ca={stops[0][0] - 0.55}
				cb={stops[0][1]}
				h={ht}
				r={0.42}
				bar={1.1}
			/>
			<NodePuck
				g={g}
				ca={stops[1][0] - 0.55}
				cb={stops[1][1]}
				h={ht}
				r={0.42}
				bar={1.1}
			/>
			<NodePuck
				g={g}
				ca={stops[2][0] - 0.55}
				cb={stops[2][1]}
				h={ht}
				r={0.46}
				bar={1.1}
				accent
			/>

			{/* the next step: an empty dashed tile waiting on the ground */}
			<path
				d={g.ground(empty[0] - 1.4, empty[1] - 0.95, 0, 2.8, 1.9)}
				className="illo-dash"
			/>

			{/* OneTool beacon, front-left */}
			<Beacon g={g} a={-2.4} b={4.8} markSize={15 * s} />

			{/* motes */}
			<circle cx={150 * s} cy={24 * s} r={2 * s} className="illo-accent-soft" />
			<circle cx={176 * s} cy={56 * s} r={1.6 * s} className="illo-mote" />
			<circle cx={46 * s} cy={92 * s} r={2.2 * s} className="illo-mote" />
			{hero && (
				<>
					<circle cx={168} cy={34} r={2.4} className="illo-mote" />
					<circle cx={296} cy={132} r={2.6} className="illo-accent-soft" />
					<rect
						x={62}
						y={158}
						width={5}
						height={5}
						rx={1}
						transform="rotate(-18 64 160)"
						className="illo-accent-soft"
					/>
				</>
			)}
		</>
	);
}

export function ActivityNone() {
	return <ActivityNoneScene hero={false} />;
}

export function ActivityNoneHero() {
	return <ActivityNoneScene hero />;
}

export function ActivityNoneSm() {
	const g = isoGrid(37.2, 24.6, 6);
	const ht = 3;
	return (
		<>
			<path
				d={trailPath(g, [
					[-2.2, 0],
					[2.2, 0],
				])}
				className="illo-dash"
			/>
			<Slab g={g} ca={-2.2} cb={0} ht={ht} w={2} d={1.6} />
			<Slab g={g} ca={2.2} cb={0} ht={ht} w={2} d={1.6} />
			<NodePuck g={g} ca={-2.2} cb={0} h={ht} r={0.46} />
			<NodePuck g={g} ca={2.2} cb={0} h={ht} r={0.5} accent />
		</>
	);
}

/* ------------------------------------------------------------ no matches */

/** A record row that survived (or didn't) the filter. */
function FilterRow({
	g,
	a,
	b,
	h,
	w = 6,
	opacity,
}: {
	g: G;
	a: number;
	b: number;
	h: number;
	w?: number;
	opacity?: number;
}) {
	const hw = w / 2;
	return (
		<g transform={g.topMatrix(a, b, h)} opacity={opacity}>
			<rect
				x={-hw}
				y="-0.85"
				width={w}
				height="1.7"
				rx="0.35"
				className="illo-knock"
			/>
			<rect
				x={-hw}
				y="-0.85"
				width={w}
				height="1.7"
				rx="0.35"
				className="illo-outline"
				vectorEffect="non-scaling-stroke"
			/>
			<circle cx={-hw + 0.75} cy="0" r="0.4" className="illo-mote" />
			<rect
				x={-hw + 1.45}
				y="-0.32"
				width={w * 0.42}
				height="0.34"
				rx="0.17"
				className="illo-mote"
			/>
			<rect
				x={hw - 1.45}
				y="-0.28"
				width="1.15"
				height="0.56"
				rx="0.28"
				className="illo-mote"
			/>
		</g>
	);
}

/** Isometric magnifier: a standing disc with thickness plus an iso handle. */
function Magnifier({
	g,
	a,
	b,
	h,
	r,
	handleFrom,
	handleLen,
	handleBase,
	handleHt,
	handleD = 0.5,
}: {
	g: G;
	a: number;
	b: number;
	h: number;
	r: number;
	handleFrom: number;
	handleLen: number;
	handleBase: number;
	handleHt: number;
	handleD?: number;
}) {
	const handle = g.box(
		handleFrom,
		b - handleD / 2,
		handleBase,
		handleLen,
		handleD,
		handleHt,
	);
	return (
		<>
			{/* handle first — the disc hides the joint */}
			<path d={handle.top} className="illo-face-top" />
			<path d={handle.left} className="illo-face-left" />
			<path d={handle.right} className="illo-face-right" />
			<path d={handle.top} className="illo-outline" />
			<path d={handle.outline} className="illo-outline" />

			{/* lens body: back copy for thickness, then the face */}
			<g transform={g.rightMatrix(a - 0.55, b, h)}>
				<circle r={r} className="illo-face-right" />
				<circle
					r={r}
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
			</g>
			<g transform={g.rightMatrix(a, b, h)}>
				<circle r={r} className="illo-face-top" />
				<circle
					r={r}
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				<circle
					r={r * 0.86}
					className="illo-accent-line"
					vectorEffect="non-scaling-stroke"
				/>
			</g>
		</>
	);
}

function NoFilterMatchScene({ hero }: { hero: boolean }) {
	const s = hero ? 1.6 : 1;
	const g = isoGrid(78 * s, 70 * s, 8 * s);
	return (
		<>
			{/* ground shadow under the cascade */}
			<path d={g.ground(-1.1, -0.9, 0, 3.8, 2.6)} className="illo-cast" />

			{/* records filtered away — fading back */}
			<FilterRow g={g} a={-1.8} b={-1.0} h={28 * s} opacity={0.3} />
			<FilterRow g={g} a={-0.6} b={-0.2} h={17 * s} opacity={0.55} />
			<FilterRow g={g} a={0.6} b={0.6} h={6 * s} />

			{/* the lens, hovering over the gap where matches would be */}
			<Magnifier
				g={g}
				a={3.4}
				b={-1.0}
				h={38 * s}
				r={2.4}
				handleFrom={3.0}
				handleLen={3.4}
				handleBase={20 * s}
				handleHt={4 * s}
			/>

			{/* OneTool beacon, front-left */}
			<Beacon g={g} a={-2.8} b={3.2} markSize={15 * s} />

			{/* motes */}
			<circle cx={26 * s} cy={22 * s} r={2 * s} className="illo-mote" />
			<circle cx={168 * s} cy={90 * s} r={2.2 * s} className="illo-accent-soft" />
			<circle cx={62 * s} cy={106 * s} r={1.6 * s} className="illo-mote" />
			{hero && (
				<>
					<circle cx={280} cy={30} r={2.6} className="illo-mote" />
					<circle cx={122} cy={22} r={2} className="illo-accent-soft" />
					<rect
						x={286}
						y={150}
						width={5}
						height={5}
						rx={1}
						transform="rotate(22 288 152)"
						className="illo-accent-soft"
					/>
				</>
			)}
		</>
	);
}

export function NoFilterMatch() {
	return <NoFilterMatchScene hero={false} />;
}

export function NoFilterMatchHero() {
	return <NoFilterMatchScene hero />;
}

export function NoFilterMatchSm() {
	const g = isoGrid(34, 26, 5.6);
	return (
		<>
			<FilterRow g={g} a={-0.6} b={-0.2} h={8} w={4.6} opacity={0.6} />
			<Magnifier
				g={g}
				a={2.6}
				b={-1.2}
				h={14}
				r={1.9}
				handleFrom={2.3}
				handleLen={2.6}
				handleBase={2}
				handleHt={3}
			/>
		</>
	);
}

/* ------------------------------------------------------------- chart data */

function IsoBar({
	g,
	a,
	b,
	base,
	w,
	d,
	ht,
	accent,
}: {
	g: G;
	a: number;
	b: number;
	base: number;
	w: number;
	d: number;
	ht: number;
	accent?: boolean;
}) {
	const box = g.box(a, b, base, w, d, ht);
	return (
		<>
			<path d={box.top} className={accent ? "illo-accent" : "illo-face-top"} />
			<path
				d={box.left}
				className={accent ? "illo-accent-shade" : "illo-face-left"}
			/>
			<path
				d={box.right}
				className={accent ? "illo-accent-shade" : "illo-face-right"}
			/>
			<path d={box.top} className="illo-outline" />
			<path d={box.outline} className="illo-outline" />
		</>
	);
}

function ReportChartNoDataScene({ hero }: { hero: boolean }) {
	const s = hero ? 1.6 : 1;
	const g = isoGrid(96 * s, 80 * s, 8 * s);
	const plinth = g.box(-3, -2.2, 0, 6, 4.4, 8 * s);
	const bars: ReadonlyArray<readonly [number, number]> = [
		[-2.4, 11],
		[-1.0, 18],
		[0.4, 27],
		[1.8, 14],
	];
	const [tgx, tgy] = g.pt(2.7, -1.2, 44 * s);
	return (
		<>
			{/* plinth */}
			<path d={g.ground(-3.6, -2.8, 0, 7.2, 5.6)} className="illo-cast" />
			<path d={plinth.top} className="illo-face-top" />
			<path d={plinth.left} className="illo-face-left" />
			<path d={plinth.right} className="illo-face-right" />
			<path d={plinth.top} className="illo-outline" />
			<path d={plinth.outline} className="illo-outline" />

			{/* bars, back to front */}
			{bars.map(([a, ht], i) => (
				<IsoBar
					key={a}
					g={g}
					a={a}
					b={-1}
					base={8 * s}
					w={0.95}
					d={2}
					ht={ht * s}
					accent={i === 2}
				/>
			))}

			{/* target level the bars never reach */}
			<path
				d={g.ground(-2.5, -1.2, 44 * s, 5.2, 2.8)}
				className="illo-dash"
			/>
			<circle cx={tgx} cy={tgy} r={1.9 * s} className="illo-accent-soft" />

			{/* floating stat plate, alongside the target */}
			<g transform={g.topMatrix(4.8, -2.8, 46 * s)}>
				<rect
					x="-1.6"
					y="-1.05"
					width="3.2"
					height="2.1"
					rx="0.32"
					className="illo-knock"
				/>
				<rect
					x="-1.6"
					y="-1.05"
					width="3.2"
					height="2.1"
					rx="0.32"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				<rect
					x="-1.24"
					y="-0.7"
					width="1.6"
					height="0.26"
					rx="0.13"
					className="illo-mote"
				/>
				<rect
					x="-1.24"
					y="-0.16"
					width="1.05"
					height="0.52"
					rx="0.26"
					className="illo-accent-soft"
				/>
				<rect
					x="0.02"
					y="0.02"
					width="1.2"
					height="0.26"
					rx="0.13"
					className="illo-mote"
				/>
			</g>

			{/* OneTool beacon, front-left */}
			<Beacon g={g} a={-3.2} b={3.4} markSize={15 * s} />

			{/* motes */}
			<circle cx={40 * s} cy={26 * s} r={2 * s} className="illo-mote" />
			<circle cx={176 * s} cy={78 * s} r={2 * s} className="illo-accent-soft" />
			<circle cx={26 * s} cy={58 * s} r={1.6 * s} className="illo-mote" />
			{hero && (
				<>
					<circle cx={128} cy={22} r={2.4} className="illo-mote" />
					<rect
						x={276}
						y={44}
						width={5}
						height={5}
						rx={1}
						transform="rotate(20 278 46)"
						className="illo-accent-soft"
					/>
					<circle cx={72} cy={172} r={2.6} className="illo-mote" />
				</>
			)}
		</>
	);
}

export function ReportChartNoData() {
	return <ReportChartNoDataScene hero={false} />;
}

export function ReportChartNoDataHero() {
	return <ReportChartNoDataScene hero />;
}

export function ReportChartNoDataSm() {
	const g = isoGrid(38, 26, 6.4);
	const plinth = g.box(-2, -1.4, 0, 4, 2.8, 5);
	const bars: ReadonlyArray<readonly [number, number]> = [
		[-1.6, 7],
		[-0.3, 12],
		[1.0, 17],
	];
	return (
		<>
			<path d={g.ground(-2.4, -1.8, 0, 4.8, 3.6)} className="illo-cast" />
			<path d={plinth.top} className="illo-face-top" />
			<path d={plinth.left} className="illo-face-left" />
			<path d={plinth.right} className="illo-face-right" />
			<path d={plinth.top} className="illo-outline" />
			<path d={plinth.outline} className="illo-outline" />
			{bars.map(([a, ht], i) => (
				<IsoBar
					key={a}
					g={g}
					a={a}
					b={-0.7}
					base={5}
					w={0.65}
					d={1.4}
					ht={ht}
					accent={i === 2}
				/>
			))}
		</>
	);
}

/* ------------------------------------------------------- pick a conversation */

/** Knockout list plate with three rows, one of them selected. */
function ListPlate({
	g,
	a,
	b,
	h,
	w = 4,
	d = 3.2,
	selected = 1,
}: {
	g: G;
	a: number;
	b: number;
	h: number;
	w?: number;
	d?: number;
	selected?: number;
}) {
	const hw = w / 2;
	const hd = d / 2;
	return (
		<g transform={g.topMatrix(a, b, h)}>
			<rect
				x={-hw}
				y={-hd}
				width={w}
				height={d}
				rx="0.4"
				className="illo-knock"
			/>
			<rect
				x={-hw}
				y={-hd}
				width={w}
				height={d}
				rx="0.4"
				className="illo-outline"
				vectorEffect="non-scaling-stroke"
			/>
			<line
				x1={-hw}
				y1={-hd + 0.62}
				x2={hw}
				y2={-hd + 0.62}
				className="illo-hair"
				vectorEffect="non-scaling-stroke"
			/>
			<rect
				x={-hw + 0.3}
				y={-hd + 0.16}
				width={w * 0.34}
				height="0.28"
				rx="0.14"
				className="illo-mote"
			/>
			{[0, 1, 2].map((i) => {
				const cy = -hd + 1.15 + i * 0.78;
				const on = i === selected;
				return (
					<g key={i}>
						{on && (
							<rect
								x={-hw + 0.16}
								y={cy - 0.34}
								width={w - 0.32}
								height="0.68"
								rx="0.22"
								className="illo-accent-soft"
							/>
						)}
						<circle
							cx={-hw + 0.62}
							cy={cy}
							r="0.24"
							className={on ? "illo-accent" : "illo-mote"}
						/>
						<rect
							x={-hw + 1.02}
							y={cy - 0.13}
							width={[w * 0.44, w * 0.56, w * 0.38][i]}
							height="0.26"
							rx="0.13"
							className="illo-mote"
						/>
					</g>
				);
			})}
		</g>
	);
}

function SelectConversationScene({ hero }: { hero: boolean }) {
	const s = hero ? 1.6 : 1;
	const g = isoGrid(96 * s, 70 * s, 8 * s);
	return (
		<>
			{/* ground shadow under the list plate (the empty pane casts none) */}
			<path d={g.ground(-5.2, 0.2, 0, 2.4, 1.9)} className="illo-cast" />

			{/* the thread list */}
			<ListPlate g={g} a={-4} b={1.2} h={22 * s} />

			{/* the detail pane, still empty */}
			<g transform={g.topMatrix(3.6, -1.2, 42 * s)}>
				<rect
					x="-2.1"
					y="-1.7"
					width="4.2"
					height="3.4"
					rx="0.4"
					className="illo-dash"
					vectorEffect="non-scaling-stroke"
				/>
			</g>

			{/* accent arrow: pick one, it lands there */}
			<path
				d={`M${86 * s} ${39 * s} Q${94 * s} ${29 * s} ${101 * s} ${36 * s}`}
				className="illo-accent-line"
			/>
			<path
				d={`M${95.6 * s} ${34.3 * s} L${101 * s} ${36 * s} L${99.3 * s} ${30.6 * s}`}
				className="illo-accent-line"
			/>

			{/* OneTool beacon, front-centre */}
			<Beacon g={g} a={0.8} b={2.8} markSize={15 * s} />

			{/* motes */}
			<circle cx={30 * s} cy={16 * s} r={2 * s} className="illo-mote" />
			<circle cx={174 * s} cy={80 * s} r={2.2 * s} className="illo-accent-soft" />
			<circle cx={118 * s} cy={100 * s} r={1.6 * s} className="illo-mote" />
			{hero && (
				<>
					<circle cx={300} cy={26} r={2.4} className="illo-mote" />
					<circle cx={32} cy={140} r={2.6} className="illo-accent-soft" />
					<rect
						x={252}
						y={162}
						width={5}
						height={5}
						rx={1}
						transform="rotate(-16 254 164)"
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
	const g = isoGrid(35, 35, 5.4);
	return (
		<>
			<ListPlate g={g} a={-1.4} b={0.6} h={9} w={3.2} d={2.4} />
			<g transform={g.topMatrix(2.6, -1.4, 14)}>
				<rect
					x="-1.6"
					y="-1.2"
					width="3.2"
					height="2.4"
					rx="0.35"
					className="illo-dash"
					vectorEffect="non-scaling-stroke"
				/>
			</g>
		</>
	);
}
