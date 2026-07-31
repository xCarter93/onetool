/**
 * V2 celebration scenes — full isometric staging, the marquee tier.
 *
 * Recipe (from the reference-pack study): hero object centre-left, one
 * floating knockout plate carrying real content, a celebrate element, the
 * OneTool beacon prop, cast-shadow silhouettes, a few motes. No ground line.
 */
import { isoGrid, ISO_T } from "../iso";
import { OneToolMark } from "../mark";

/* ---------------------------------------------------------------- helpers */

/** Standing celebrate "badge" puck in the right-facing plane, with a stepped
 *  back copy for thickness and a knockout check on the face. */
function CelebratePuck({
	g,
	a,
	b,
	h,
	r,
}: {
	g: ReturnType<typeof isoGrid>;
	a: number;
	b: number;
	h: number;
	r: number;
}) {
	return (
		<>
			<g transform={g.rightMatrix(a - 0.55, b, h)}>
				<circle cx="0" cy="0" r={r} className="illo-celebrate-shade" />
				<circle
					cx="0"
					cy="0"
					r={r}
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
			</g>
			<g transform={g.rightMatrix(a, b, h)}>
				<circle cx="0" cy="0" r={r} className="illo-celebrate" />
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

/** The OneTool beacon — brand mark hovering over a small accent pedestal.
 *  Our recurring signature prop (the reference pack's "glow post" slot). */
export function Beacon({
	g,
	a,
	b,
	markSize,
}: {
	g: ReturnType<typeof isoGrid>;
	a: number;
	b: number;
	markSize: number;
}) {
	const cube = g.box(a, b, 0, 1.6, 1.6, 5);
	const [tx, ty] = g.pt(a + 0.8, b + 0.8, 5);
	return (
		<>
			<path d={g.ground(a - 0.4, b - 0.4, 0, 2.4, 2.4)} className="illo-cast" />
			<path d={cube.top} className="illo-accent" />
			<path d={cube.left} className="illo-accent-shade" />
			<path d={cube.right} className="illo-accent-shade" />
			<path d={cube.outline} className="illo-outline" />
			<circle
				cx={tx}
				cy={ty - markSize * 0.62 - 6}
				r={markSize * 0.78}
				className="illo-accent-soft"
			/>
			<OneToolMark
				x={tx - markSize / 2}
				y={ty - markSize * 1.12 - 6}
				size={markSize}
			/>
		</>
	);
}

/* ------------------------------------------------------------- all caught up */

function AllCaughtUpScene({ hero }: { hero: boolean }) {
	const s = hero ? 1.6 : 1;
	const g = isoGrid(94 * s, 88 * s, 8 * s);
	const plinth = g.box(-3, -2.25, 0, 6, 4.5, 10 * s);
	return (
		<>
			{/* ground + plinth */}
			<path d={g.ground(-3.6, -2.7, 0, 7.2, 5.4)} className="illo-cast" />
			<path d={plinth.top} className="illo-face-top" />
			<path d={plinth.left} className="illo-face-left" />
			<path d={plinth.right} className="illo-face-right" />
			<path d={plinth.top} className="illo-outline" />
			<path d={plinth.outline} className="illo-outline" />

			{/* hover shadow of the plate on the plinth top */}
			<path
				d={g.ground(-2.2, -1.7, 10 * s + 0.5, 4.4, 3.4)}
				className="illo-cast"
			/>

			{/* floating task plate — every row checked */}
			<g transform={g.topMatrix(0, 0, 36 * s)}>
				<rect
					x="-3.1"
					y="-2.3"
					width="6.2"
					height="4.6"
					rx="0.5"
					className="illo-knock"
				/>
				<rect
					x="-3.1"
					y="-2.3"
					width="6.2"
					height="4.6"
					rx="0.5"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				{/* header rule + window dots */}
				<circle cx="-2.55" cy="-1.85" r="0.14" className="illo-mote" />
				<circle cx="-2.1" cy="-1.85" r="0.14" className="illo-mote" />
				<line
					x1="-3.1"
					y1="-1.45"
					x2="3.1"
					y2="-1.45"
					className="illo-hair"
					vectorEffect="non-scaling-stroke"
				/>
				{[0, 1, 2].map((i) => (
					<g key={i}>
						<circle
							cx="-2.35"
							cy={-0.7 + i}
							r="0.34"
							className="illo-celebrate"
						/>
						<path
							d={`M -2.5 ${-0.7 + i} l 0.11 0.13 l 0.24 -0.28`}
							className="illo-on-accent"
							vectorEffect="non-scaling-stroke"
						/>
						<rect
							x="-1.7"
							y={-0.87 + i}
							width={[2.9, 2.2, 3.3][i]}
							height="0.34"
							rx="0.17"
							className="illo-mote"
						/>
					</g>
				))}
			</g>

			{/* celebrate badge, upper right */}
			<CelebratePuck g={g} a={2.4} b={-4.6} h={40 * s} r={1.5} />

			{/* OneTool beacon, in front of the plinth's lower-left edge */}
			<Beacon g={g} a={-1.6} b={2.6} markSize={16 * s} />

			{/* motes */}
			<circle cx={56 * s} cy={22 * s} r={2 * s} className="illo-celebrate-soft" />
			<circle cx={36 * s} cy={54 * s} r={1.8 * s} className="illo-mote" />
			<circle cx={176 * s} cy={52 * s} r={1.6 * s} className="illo-mote" />
			<circle cx={168 * s} cy={96 * s} r={2.2 * s} className="illo-accent-soft" />
			{hero && (
				<>
					{/* hero-only: drifting confetti + a second, smaller plate behind */}
					<g transform={g.topMatrix(-4.6, 1.6, 46 * s)}>
						<rect
							x="-1.5"
							y="-1"
							width="3"
							height="2"
							rx="0.35"
							className="illo-knock"
						/>
						<rect
							x="-1.5"
							y="-1"
							width="3"
							height="2"
							rx="0.35"
							className="illo-outline"
							vectorEffect="non-scaling-stroke"
						/>
						<circle cx="-0.9" cy="-0.35" r="0.28" className="illo-celebrate" />
						<rect
							x="-0.3"
							y="-0.5"
							width="1.5"
							height="0.3"
							rx="0.15"
							className="illo-mote"
						/>
						<rect
							x="-0.9"
							y="0.25"
							width="1.9"
							height="0.3"
							rx="0.15"
							className="illo-mote"
						/>
					</g>
					<rect
						x={244}
						y={40}
						width={5}
						height={5}
						rx={1}
						transform="rotate(24 246 42)"
						className="illo-celebrate-soft"
					/>
					<rect
						x={70}
						y={140}
						width={5}
						height={5}
						rx={1}
						transform="rotate(-18 72 142)"
						className="illo-accent-soft"
					/>
					<circle cx={288} cy={130} r={2.6} className="illo-mote" />
				</>
			)}
		</>
	);
}

export function AllCaughtUp() {
	return <AllCaughtUpScene hero={false} />;
}

export function AllCaughtUpHero() {
	return <AllCaughtUpScene hero />;
}

export function AllCaughtUpSm() {
	const g = isoGrid(34, 30, 4.4);
	const plinth = g.box(-2.4, -1.8, 0, 4.8, 3.6, 7);
	return (
		<>
			<path d={g.ground(-2.9, -2.2, 0, 5.8, 4.4)} className="illo-cast" />
			<path d={plinth.top} className="illo-face-top" />
			<path d={plinth.left} className="illo-face-left" />
			<path d={plinth.right} className="illo-face-right" />
			<path d={plinth.top} className="illo-outline" />
			<path d={plinth.outline} className="illo-outline" />
			<CelebratePuck g={g} a={0.2} b={-0.4} h={17} r={2.2} />
			<circle cx="63" cy="12" r="2" className="illo-celebrate-soft" />
			<circle cx="12" cy="14" r="1.6" className="illo-mote" />
		</>
	);
}

/* --------------------------------------------------------------- quote signed */

/** Cursive signature flourish, drawn in a plate's local (iso-unit) space. */
const SIGNATURE_D =
	"M-1.96 2.08 C-1.72 0.72, -1.1 0.54, -0.88 1.4 C-0.7 2.14, -1.24 2.28, -1.22 1.56 C-1.2 0.78, -0.44 0.62, -0.1 1.44 C0.17 2.08, -0.17 2.26, -0.2 1.64 C-0.23 0.94, 0.5 0.7, 0.86 1.44 C1.07 1.9, 0.98 2.16, 1.03 1.7 C1.1 1.04, 1.52 1.32, 1.94 0.8";

function QuoteSignedScene({ hero }: { hero: boolean }) {
	const s = hero ? 1.6 : 1;
	const g = isoGrid(96 * s, 88 * s, 7.5 * s);
	const plinth = g.box(-2.6, -2, 0, 5.2, 4, 9 * s);
	return (
		<>
			{/* ground + plinth */}
			<path d={g.ground(-3.1, -2.5, 0, 6.2, 5)} className="illo-cast" />
			<path d={plinth.top} className="illo-face-top" />
			<path d={plinth.left} className="illo-face-left" />
			<path d={plinth.right} className="illo-face-right" />
			<path d={plinth.top} className="illo-outline" />
			<path d={plinth.outline} className="illo-outline" />

			{/* hover shadow of the quote on the plinth top */}
			<path
				d={g.ground(-1.9, -1.5, 9 * s + 0.4, 3.8, 3)}
				className="illo-cast"
			/>

			{/* the signed quote itself */}
			<g transform={g.topMatrix(0.1, 0.1, 40 * s)}>
				<rect
					x="-2.3"
					y="-3.1"
					width="4.6"
					height="6.2"
					rx="0.4"
					className="illo-knock"
				/>
				<rect
					x="-2.3"
					y="-3.1"
					width="4.6"
					height="6.2"
					rx="0.4"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				{/* header: title bar + rule */}
				<rect
					x="-1.85"
					y="-2.62"
					width="2.5"
					height="0.4"
					rx="0.2"
					className="illo-accent-soft"
				/>
				<rect
					x="1"
					y="-2.66"
					width="0.9"
					height="0.48"
					rx="0.24"
					className="illo-mote"
				/>
				<line
					x1="-2.3"
					y1="-1.98"
					x2="2.3"
					y2="-1.98"
					className="illo-hair"
					vectorEffect="non-scaling-stroke"
				/>
				{/* body copy */}
				{[
					[-1.55, 3.5],
					[-1.02, 2.9],
					[-0.49, 3.75],
					[0.04, 2.3],
				].map(([y, w]) => (
					<rect
						key={y}
						x="-1.85"
						y={y}
						width={w}
						height="0.32"
						rx="0.16"
						className="illo-mote"
					/>
				))}
				{/* total row */}
				<rect
					x="-1.85"
					y="0.72"
					width="1.4"
					height="0.32"
					rx="0.16"
					className="illo-mote"
				/>
				<rect
					x="0.65"
					y="0.6"
					width="1.25"
					height="0.56"
					rx="0.28"
					className="illo-celebrate-soft"
				/>
				{/* the signature */}
				<path
					d={SIGNATURE_D}
					className="illo-celebrate-line"
					vectorEffect="non-scaling-stroke"
					style={{ strokeWidth: 2 }}
				/>
				<line
					x1="-2"
					y1="2.44"
					x2="2"
					y2="2.44"
					className="illo-hair"
					vectorEffect="non-scaling-stroke"
				/>
				<rect
					x="-2"
					y="2.62"
					width="1.6"
					height="0.28"
					rx="0.14"
					className="illo-mote"
				/>
			</g>

			{/* seal stamped over the quote's lower-right edge */}
			<CelebratePuck g={g} a={2.6} b={1.6} h={40 * s} r={1.2} />

			{/* OneTool beacon, front-left */}
			<Beacon g={g} a={-3.4} b={2.6} markSize={15 * s} />

			{/* confetti + motes */}
			<rect
				x={148 * s}
				y={26 * s}
				width={5 * s}
				height={5 * s}
				rx={1 * s}
				transform={`rotate(24 ${150.5 * s} ${28.5 * s})`}
				className="illo-celebrate-soft"
			/>
			<rect
				x={38 * s}
				y={44 * s}
				width={5 * s}
				height={5 * s}
				rx={1 * s}
				transform={`rotate(-18 ${40.5 * s} ${46.5 * s})`}
				className="illo-accent-soft"
			/>
			<circle cx={34 * s} cy={24 * s} r={2 * s} className="illo-mote" />
			<circle cx={166 * s} cy={60 * s} r={2.2 * s} className="illo-accent-soft" />
			<circle cx={172 * s} cy={98 * s} r={1.8 * s} className="illo-mote" />
			{hero && (
				<>
					<rect
						x={252}
						y={148}
						width={5}
						height={5}
						rx={1}
						transform="rotate(14 254.5 150.5)"
						className="illo-celebrate-soft"
					/>
					<circle
						cx={292}
						cy={62}
						r={2.6}
						className="illo-celebrate-soft"
					/>
					<circle cx={44} cy={158} r={2.2} className="illo-mote" />
				</>
			)}
		</>
	);
}

export function QuoteSigned() {
	return <QuoteSignedScene hero={false} />;
}

export function QuoteSignedHero() {
	return <QuoteSignedScene hero />;
}

export function QuoteSignedSm() {
	const g = isoGrid(40, 27, 4.6);
	return (
		<>
			<path d={g.ground(-1.2, -1.4, 0, 2.4, 2.8)} className="illo-cast" />
			<g transform={g.topMatrix(0, 0, 5)}>
				<rect
					x="-2"
					y="-2.3"
					width="4"
					height="4.6"
					rx="0.34"
					className="illo-knock"
				/>
				<rect
					x="-2"
					y="-2.3"
					width="4"
					height="4.6"
					rx="0.34"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				<line
					x1="-2"
					y1="-1.25"
					x2="2"
					y2="-1.25"
					className="illo-hair"
					vectorEffect="non-scaling-stroke"
				/>
				{[
					[-0.78, 3],
					[0.02, 2.3],
				].map(([y, w]) => (
					<rect
						key={y}
						x="-1.55"
						y={y}
						width={w}
						height="0.52"
						rx="0.26"
						className="illo-mote"
					/>
				))}
				<line
					x1="-1.55"
					y1="1.5"
					x2="1.55"
					y2="1.5"
					className="illo-hair"
					vectorEffect="non-scaling-stroke"
				/>
			</g>
			<CelebratePuck g={g} a={2.2} b={0.9} h={5} r={1.9} />
		</>
	);
}

/* --------------------------------------------------------------- invoice paid */

/** Flat extruded iso coin: bottom rim disc, the straight wall between rims, and
 *  the lit top face. `h` is the coin's base height, `t` its thickness in px. */
function Coin({
	g,
	unit,
	a,
	b,
	h,
	r,
	t,
	celebrate,
}: {
	g: ReturnType<typeof isoGrid>;
	unit: number;
	a: number;
	b: number;
	h: number;
	r: number;
	t: number;
	celebrate?: boolean;
}) {
	const [cx, cy] = g.pt(a, b, h);
	// The disc's screen-widest points sit at local ±45°, level with its centre.
	const half = r * unit * Math.SQRT2;
	const q = r * Math.SQRT1_2;
	const band = celebrate ? "illo-celebrate-shade" : "illo-face-right";
	const face = celebrate ? "illo-celebrate" : "illo-face-top";
	return (
		<>
			<g transform={g.topMatrix(a, b, h)}>
				<circle cx="0" cy="0" r={r} className={band} />
			</g>
			<rect
				x={cx - half}
				y={cy - t}
				width={half * 2}
				height={t}
				className={band}
			/>
			<g transform={g.topMatrix(a, b, h)}>
				<path
					d={`M${q} ${-q} A${r} ${r} 0 0 1 ${-q} ${q}`}
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
			</g>
			<line
				x1={cx - half}
				y1={cy - t}
				x2={cx - half}
				y2={cy}
				className="illo-outline"
			/>
			<line
				x1={cx + half}
				y1={cy - t}
				x2={cx + half}
				y2={cy}
				className="illo-outline"
			/>
			<g transform={g.topMatrix(a, b, h + t)}>
				<circle cx="0" cy="0" r={r} className={face} />
				<circle
					cx="0"
					cy="0"
					r={r}
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				{celebrate && (
					<>
						<path
							d={`M${0.33 * r} ${-0.3 * r} C${-0.06 * r} ${-0.58 * r} ${-0.5 * r} ${-0.16 * r} ${-0.04 * r} ${0.02 * r} C${0.42 * r} ${0.2 * r} ${0.02 * r} ${0.6 * r} ${-0.34 * r} ${0.34 * r}`}
							className="illo-on-accent"
							vectorEffect="non-scaling-stroke"
						/>
						<path
							d={`M${-0.02 * r} ${-0.56 * r} L${-0.02 * r} ${0.58 * r}`}
							className="illo-on-accent"
							vectorEffect="non-scaling-stroke"
						/>
					</>
				)}
			</g>
		</>
	);
}

function InvoicePaidScene({ hero }: { hero: boolean }) {
	const s = hero ? 1.6 : 1;
	const u = 8 * s;
	const g = isoGrid(96 * s, 80 * s, u);
	const t = 6 * s;
	return (
		<>
			{/* cast shadow under the stack */}
			<path d={g.ground(-3, 1.4, 0, 3.2, 3.2)} className="illo-cast" />

			{/* three struck coins, bottom to top */}
			<Coin g={g} unit={u} a={-1.4} b={3} h={0} r={1.75} t={t} />
			<Coin g={g} unit={u} a={-1.26} b={2.88} h={t} r={1.75} t={t} />
			<Coin
				g={g}
				unit={u}
				a={-1.48}
				b={3.08}
				h={t * 2}
				r={1.75}
				t={t}
				celebrate
			/>

			{/* the settled invoice, floating right */}
			<g transform={g.topMatrix(1.6, -0.8, 42 * s)}>
				<rect
					x="-1.9"
					y="-2.5"
					width="3.8"
					height="5"
					rx="0.35"
					className="illo-knock"
				/>
				<rect
					x="-1.9"
					y="-2.5"
					width="3.8"
					height="5"
					rx="0.35"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				<rect
					x="-1.55"
					y="-2.18"
					width="1.9"
					height="0.4"
					rx="0.2"
					className="illo-accent-soft"
				/>
				<rect
					x="0.72"
					y="-2.2"
					width="0.85"
					height="0.44"
					rx="0.22"
					className="illo-mote"
				/>
				<line
					x1="-1.6"
					y1="-1.62"
					x2="1.6"
					y2="-1.62"
					className="illo-hair"
					vectorEffect="non-scaling-stroke"
				/>
				{[
					[-1.24, 1.9],
					[-0.64, 1.5],
					[-0.04, 2.1],
				].map(([y, w]) => (
					<g key={y}>
						<rect
							x="-1.55"
							y={y}
							width={w}
							height="0.3"
							rx="0.15"
							className="illo-mote"
						/>
						<rect
							x="1.05"
							y={y}
							width="0.5"
							height="0.3"
							rx="0.15"
							className="illo-mote"
						/>
					</g>
				))}
				<line
					x1="-1.6"
					y1="0.62"
					x2="1.6"
					y2="0.62"
					className="illo-hair"
					vectorEffect="non-scaling-stroke"
				/>
				{/* total row — settled */}
				<rect
					x="-1.55"
					y="1"
					width="1"
					height="0.32"
					rx="0.16"
					className="illo-mote"
				/>
				<rect
					x="0.33"
					y="0.86"
					width="1.24"
					height="0.6"
					rx="0.3"
					className="illo-celebrate"
				/>
				<rect
					x="0.62"
					y="1.07"
					width="0.66"
					height="0.18"
					rx="0.09"
					className="illo-fill-knock"
				/>
				<rect
					x="-1.55"
					y="1.85"
					width="1.35"
					height="0.26"
					rx="0.13"
					className="illo-mote"
				/>
			</g>

			{/* paid badge, floating over the stack */}
			<CelebratePuck g={g} a={-0.9} b={3.5} h={58 * s} r={1.4} />

			{/* OneTool beacon, front-right */}
			<Beacon g={g} a={3.2} b={-0.6} markSize={15 * s} />

			{/* confetti + motes */}
			<rect
				x={162 * s}
				y={62 * s}
				width={5 * s}
				height={5 * s}
				rx={1 * s}
				transform={`rotate(22 ${164.5 * s} ${64.5 * s})`}
				className="illo-celebrate-soft"
			/>
			<rect
				x={34 * s}
				y={56 * s}
				width={5 * s}
				height={5 * s}
				rx={1 * s}
				transform={`rotate(-16 ${36.5 * s} ${58.5 * s})`}
				className="illo-accent-soft"
			/>
			<circle cx={38 * s} cy={26 * s} r={2 * s} className="illo-mote" />
			<circle
				cx={176 * s}
				cy={24 * s}
				r={2.2 * s}
				className="illo-celebrate-soft"
			/>
			<circle cx={172 * s} cy={104 * s} r={1.8 * s} className="illo-mote" />
			{hero && (
				<>
					<rect
						x={62}
						y={30}
						width={5}
						height={5}
						rx={1}
						transform="rotate(16 64.5 32.5)"
						className="illo-celebrate-soft"
					/>
					<circle cx={296} cy={120} r={2.6} className="illo-accent-soft" />
					<circle cx={40} cy={166} r={2.2} className="illo-mote" />
				</>
			)}
		</>
	);
}

export function InvoicePaid() {
	return <InvoicePaidScene hero={false} />;
}

export function InvoicePaidHero() {
	return <InvoicePaidScene hero />;
}

export function InvoicePaidSm() {
	const u = 5;
	const g = isoGrid(40, 28, u);
	return (
		<>
			<path d={g.ground(-2.4, -2.4, 0, 4.8, 4.8)} className="illo-cast" />
			<Coin g={g} unit={u} a={0} b={0} h={0} r={2.6} t={4} />
			<Coin g={g} unit={u} a={0.12} b={-0.1} h={4} r={2.6} t={4} />
			<Coin g={g} unit={u} a={-0.08} b={0.06} h={8} r={2.6} t={4} celebrate />
		</>
	);
}

/* ---------------------------------------------------------- first client added */

/**
 * Five-point star, point-up, for the right-facing plane. A disc survives that
 * plane's 30° shear (it just becomes an ellipse) but a star does not — its
 * points splay — so the local y is pre-sheared by +tan(30°)·x, which the plane
 * matrix then cancels. The star lands upright while still being placed, sized
 * and depth-offset in iso units like every other solid.
 */
function starPath(r: number): string {
	const pts: string[] = [];
	for (let i = 0; i < 10; i++) {
		const rad = ((-90 + i * 36) * Math.PI) / 180;
		const rr = i % 2 === 0 ? r : r * 0.45;
		const x = Math.cos(rad) * rr;
		const y = Math.sin(rad) * rr;
		pts.push(`${x.toFixed(3)} ${(y + ISO_T * x).toFixed(3)}`);
	}
	return `M${pts.join(" L")} Z`;
}

/** Standing celebrate star in the right-facing plane — the CelebratePuck
 *  technique with a star silhouette instead of a disc. */
function CelebrateStar({
	g,
	a,
	b,
	h,
	r,
}: {
	g: ReturnType<typeof isoGrid>;
	a: number;
	b: number;
	h: number;
	r: number;
}) {
	const d = starPath(r);
	return (
		<>
			<g transform={g.rightMatrix(a - 0.3, b, h)}>
				<path d={d} className="illo-celebrate-shade" />
				<path
					d={d}
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
			</g>
			<g transform={g.rightMatrix(a, b, h)}>
				<path d={d} className="illo-celebrate" />
				<path
					d={d}
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
			</g>
		</>
	);
}

/** One client row-card in the top plane. */
function ClientCard({
	g,
	a,
	b,
	h,
}: {
	g: ReturnType<typeof isoGrid>;
	a: number;
	b: number;
	h: number;
}) {
	return (
		<g transform={g.topMatrix(a, b, h)}>
			<rect
				x="-3.1"
				y="-1.1"
				width="6.2"
				height="2.2"
				rx="0.4"
				className="illo-knock"
			/>
			<rect
				x="-3.1"
				y="-1.1"
				width="6.2"
				height="2.2"
				rx="0.4"
				className="illo-outline"
				vectorEffect="non-scaling-stroke"
			/>
			<circle cx="-2.3" cy="0" r="0.58" className="illo-celebrate" />
			<rect
				x="-1.45"
				y="-0.54"
				width="2.8"
				height="0.42"
				rx="0.21"
				className="illo-accent-soft"
			/>
			<rect
				x="-1.45"
				y="0.14"
				width="1.9"
				height="0.3"
				rx="0.15"
				className="illo-mote"
			/>
			<rect
				x="1.68"
				y="-0.34"
				width="1.32"
				height="0.68"
				rx="0.34"
				className="illo-celebrate-soft"
			/>
		</g>
	);
}

function FirstClientAddedScene({ hero }: { hero: boolean }) {
	const s = hero ? 1.6 : 1;
	const u = 8 * s;
	const g = isoGrid(96 * s, 86 * s, u);
	const plinth = g.box(-2.8, -1.5, 0, 5.6, 3, 9 * s);
	const [starX, starY] = g.pt(0.9, -1.6, 52 * s);
	return (
		<>
			{/* ground + plinth */}
			<path d={g.ground(-3.3, -2, 0, 6.6, 4)} className="illo-cast" />
			<path d={plinth.top} className="illo-face-top" />
			<path d={plinth.left} className="illo-face-left" />
			<path d={plinth.right} className="illo-face-right" />
			<path d={plinth.top} className="illo-outline" />
			<path d={plinth.outline} className="illo-outline" />

			{/* hover shadow of the card on the plinth top */}
			<path
				d={g.ground(-2.2, -0.9, 9 * s + 0.4, 4.4, 2)}
				className="illo-cast"
			/>

			{/* the very first client */}
			<ClientCard g={g} a={0} b={0.1} h={28 * s} />

			{/* the star it earns */}
			<circle
				cx={starX}
				cy={starY}
				r={2.45 * u}
				className="illo-celebrate-soft"
			/>
			<CelebrateStar g={g} a={0.9} b={-1.6} h={52 * s} r={2} />

			{/* OneTool beacon, front-left */}
			<Beacon g={g} a={-3.6} b={2.8} markSize={15 * s} />

			{/* confetti + motes */}
			<rect
				x={150 * s}
				y={24 * s}
				width={5 * s}
				height={5 * s}
				rx={1 * s}
				transform={`rotate(22 ${152.5 * s} ${26.5 * s})`}
				className="illo-celebrate-soft"
			/>
			<rect
				x={150 * s}
				y={98 * s}
				width={5 * s}
				height={5 * s}
				rx={1 * s}
				transform={`rotate(-14 ${152.5 * s} ${100.5 * s})`}
				className="illo-accent-soft"
			/>
			<circle cx={44 * s} cy={28 * s} r={2 * s} className="illo-mote" />
			<circle cx={172 * s} cy={52 * s} r={2.2 * s} className="illo-accent-soft" />
			<circle cx={28 * s} cy={62 * s} r={1.6 * s} className="illo-mote" />
			{hero && (
				<>
					<rect
						x={58}
						y={150}
						width={5}
						height={5}
						rx={1}
						transform="rotate(18 60.5 152.5)"
						className="illo-celebrate-soft"
					/>
					<circle cx={294} cy={132} r={2.6} className="illo-mote" />
					<circle cx={38} cy={106} r={2.2} className="illo-celebrate-soft" />
				</>
			)}
		</>
	);
}

export function FirstClientAdded() {
	return <FirstClientAddedScene hero={false} />;
}

export function FirstClientAddedHero() {
	return <FirstClientAddedScene hero />;
}

export function FirstClientAddedSm() {
	const g = isoGrid(40, 32, 4.4);
	return (
		<>
			<path d={g.ground(-1.4, -0.8, 0, 2.8, 1.6)} className="illo-cast" />
			<g transform={g.topMatrix(0, 0, 8)}>
				<rect
					x="-2.5"
					y="-1"
					width="5"
					height="2"
					rx="0.36"
					className="illo-knock"
				/>
				<rect
					x="-2.5"
					y="-1"
					width="5"
					height="2"
					rx="0.36"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				<circle cx="-1.85" cy="0" r="0.5" className="illo-mote" />
				<rect
					x="-1.05"
					y="-0.28"
					width="2.1"
					height="0.46"
					rx="0.23"
					className="illo-mote"
				/>
			</g>
			<CelebrateStar g={g} a={0.4} b={-0.9} h={19} r={1.8} />
		</>
	);
}
