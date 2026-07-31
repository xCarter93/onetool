/**
 * V2 record-list empties — the artwork previews the records about to land.
 *
 * Language: a terraced cascade of isometric row-cards (the coming records),
 * front card crisp with the accent avatar, a dashed incoming card floating
 * above, the OneTool beacon, cast shadow, motes. Projects swaps the cascade
 * for hovering kanban columns, invoices adds amount chips + a coin stack,
 * tasks puts a checklist plate over a plinth. Accent hue only — the celebrate
 * green stays in celebration.tsx.
 */
import { isoGrid } from "../iso";
import { Beacon } from "./celebration";

/** One client row-card in the top plane. */
function RowCard({
	g,
	a,
	b,
	h,
	accent,
	quiet,
}: {
	g: ReturnType<typeof isoGrid>;
	a: number;
	b: number;
	h: number;
	accent?: boolean;
	quiet?: boolean;
}) {
	return (
		<g transform={g.topMatrix(a, b, h)}>
			<rect
				x="-3.2"
				y="-0.85"
				width="6.4"
				height="1.7"
				rx="0.35"
				className="illo-knock"
			/>
			<rect
				x="-3.2"
				y="-0.85"
				width="6.4"
				height="1.7"
				rx="0.35"
				className="illo-outline"
				vectorEffect="non-scaling-stroke"
				opacity={quiet ? 0.55 : undefined}
			/>
			<circle
				cx="-2.45"
				cy="0"
				r="0.42"
				className={accent ? "illo-accent" : "illo-mote"}
			/>
			<rect
				x="-1.75"
				y="-0.32"
				width={accent ? 2.7 : 2.2}
				height="0.36"
				rx="0.18"
				className={accent ? "illo-accent-soft" : "illo-mote"}
			/>
			<rect
				x="1.75"
				y="-0.28"
				width="1.15"
				height="0.56"
				rx="0.28"
				className="illo-mote"
			/>
		</g>
	);
}

function ClientsNoneScene({ hero }: { hero: boolean }) {
	const s = hero ? 1.6 : 1;
	const g = isoGrid(88 * s, 70 * s, 8 * s);
	return (
		<>
			{/* cast shadow under the cascade */}
			<path d={g.ground(-1.6, -1.7, 0, 5.6, 3.4)} className="illo-cast" />

			{/* dashed incoming card, floating highest */}
			<g transform={g.topMatrix(-1.7, 0, 37 * s)}>
				<rect
					x="-3.2"
					y="-0.85"
					width="6.4"
					height="1.7"
					rx="0.35"
					className="illo-dash"
					vectorEffect="non-scaling-stroke"
				/>
			</g>

			{/* terraced records, back to front */}
			<RowCard g={g} a={-2.2} b={0} h={32 * s} quiet />
			<RowCard g={g} a={0} b={0} h={22 * s} quiet />
			<RowCard g={g} a={2.2} b={0} h={12 * s} accent />

			{/* OneTool beacon, front-left */}
			<Beacon g={g} a={-3.4} b={3.2} markSize={15 * s} />

			{/* motes */}
			<circle cx={30 * s} cy={26 * s} r={1.8 * s} className="illo-mote" />
			<circle cx={172 * s} cy={30 * s} r={2 * s} className="illo-accent-soft" />
			<circle cx={178 * s} cy={92 * s} r={1.6 * s} className="illo-mote" />
			{hero && (
				<>
					<circle cx={288} cy={64} r={2.6} className="illo-mote" />
					<rect
						x={252}
						y={140}
						width={5}
						height={5}
						rx={1}
						transform="rotate(20 254 142)"
						className="illo-accent-soft"
					/>
				</>
			)}
		</>
	);
}

export function ClientsNone() {
	return <ClientsNoneScene hero={false} />;
}

export function ClientsNoneHero() {
	return <ClientsNoneScene hero />;
}

export function ClientsNoneSm() {
	const g = isoGrid(38, 24, 4.6);
	return (
		<>
			<path d={g.ground(0.2, -1, 0, 5.6, 3.4)} className="illo-cast" />
			<RowCard g={g} a={-0.8} b={0} h={5} quiet />
			<RowCard g={g} a={0.9} b={0} h={0} accent />
		</>
	);
}

/* ------------------------------------------------------------- projects none */

/** One hovering kanban column: a compact knockout board, column title under a
 *  rule, then two stacked cards filling the lane. */
function KanbanColumn({
	g,
	a,
	b,
	h,
	accent,
	quiet,
}: {
	g: ReturnType<typeof isoGrid>;
	a: number;
	b: number;
	h: number;
	/** Highlight the lane's top card. */
	accent?: boolean;
	quiet?: boolean;
}) {
	return (
		<g transform={g.topMatrix(a, b, h)}>
			<rect
				x="-1.05"
				y="-1.5"
				width="2.1"
				height="3"
				rx="0.3"
				className="illo-knock"
			/>
			<rect
				x="-0.78"
				y="-1.3"
				width="1"
				height="0.28"
				rx="0.14"
				className="illo-mote"
			/>
			<line
				x1="-1.05"
				y1="-0.85"
				x2="1.05"
				y2="-0.85"
				className="illo-hair"
				vectorEffect="non-scaling-stroke"
			/>
			{[-0.66, 0.36].map((y, i) => (
				<g key={y}>
					<rect
						x="-0.8"
						y={y}
						width="1.6"
						height="0.8"
						rx="0.2"
						className={accent && i === 0 ? "illo-accent" : "illo-mote"}
					/>
					<rect
						x="-0.56"
						y={y + 0.3}
						width={i === 0 ? 0.86 : 0.66}
						height="0.2"
						rx="0.1"
						className="illo-knock"
					/>
					<rect
						x="-0.8"
						y={y}
						width="1.6"
						height="0.8"
						rx="0.2"
						className="illo-outline"
						vectorEffect="non-scaling-stroke"
						style={{ strokeWidth: 1.15 }}
						opacity={quiet ? 0.5 : 0.85}
					/>
				</g>
			))}
			<rect
				x="-1.05"
				y="-1.5"
				width="2.1"
				height="3"
				rx="0.3"
				className="illo-outline"
				vectorEffect="non-scaling-stroke"
				opacity={quiet ? 0.55 : undefined}
			/>
		</g>
	);
}

function ProjectsNoneScene({ hero }: { hero: boolean }) {
	const s = hero ? 1.6 : 1;
	const g = isoGrid(100 * s, 73 * s, 7.6 * s);
	// Columns step along (+a, −b): that axis pair reads dead-horizontal on
	// screen, so the boards line up side by side instead of cascading.
	const cols = [
		{ a: -3.15, b: 3.15, h: 28 * s, quiet: true, accent: false },
		{ a: 3.15, b: -3.15, h: 24 * s, quiet: true, accent: false },
		{ a: 0, b: 0, h: 19 * s, quiet: false, accent: true },
	];
	return (
		<>
			{/* hover shadow under each board */}
			{cols.map((c) => (
				<path
					key={`sh${c.a}`}
					d={g.ground(c.a - 0.55, c.b - 0.8, 0, 1.1, 1.6)}
					className="illo-cast"
				/>
			))}

			{/* dashed incoming card, dropping into the centre column */}
			<g transform={g.topMatrix(0, 0, 40 * s)}>
				<rect
					x="-0.8"
					y="-0.42"
					width="1.6"
					height="0.84"
					rx="0.2"
					className="illo-dash"
					vectorEffect="non-scaling-stroke"
				/>
			</g>

			{cols.map((c) => (
				<KanbanColumn
					key={c.a}
					g={g}
					a={c.a}
					b={c.b}
					h={c.h}
					quiet={c.quiet}
					accent={c.accent}
				/>
			))}

			{/* OneTool beacon, front-left */}
			<Beacon g={g} a={-2.8} b={6} markSize={15 * s} />

			{/* motes */}
			<circle cx={22 * s} cy={36 * s} r={1.8 * s} className="illo-mote" />
			<circle cx={182 * s} cy={30 * s} r={2 * s} className="illo-accent-soft" />
			<circle cx={172 * s} cy={98 * s} r={1.6 * s} className="illo-mote" />
			{hero && (
				<>
					{/* a card still in transit, above the left column */}
					<g transform={g.topMatrix(-4.6, 2.6, 40 * s)}>
						<rect
							x="-0.8"
							y="-0.42"
							width="1.6"
							height="0.84"
							rx="0.2"
							className="illo-knock"
						/>
						<rect
							x="-0.52"
							y="-0.15"
							width="1"
							height="0.3"
							rx="0.15"
							className="illo-mote"
						/>
						<rect
							x="-0.8"
							y="-0.42"
							width="1.6"
							height="0.84"
							rx="0.2"
							className="illo-outline"
							vectorEffect="non-scaling-stroke"
						/>
					</g>
					<circle cx={300} cy={130} r={2.6} className="illo-mote" />
					<rect
						x={262}
						y={152}
						width={5}
						height={5}
						rx={1}
						transform="rotate(22 264 154)"
						className="illo-accent-soft"
					/>
				</>
			)}
		</>
	);
}

export function ProjectsNone() {
	return <ProjectsNoneScene hero={false} />;
}

export function ProjectsNoneHero() {
	return <ProjectsNoneScene hero />;
}

export function ProjectsNoneSm() {
	const g = isoGrid(40, 30, 8);
	return (
		<>
			<path d={g.ground(-0.6, -0.85, 0, 1.2, 1.7)} className="illo-cast" />
			<g transform={g.topMatrix(0, 0, 8)}>
				<rect
					x="-1.15"
					y="-1.65"
					width="2.3"
					height="3.3"
					rx="0.32"
					className="illo-knock"
				/>
				<rect
					x="-0.85"
					y="-1.45"
					width="1.1"
					height="0.32"
					rx="0.16"
					className="illo-mote"
				/>
				<line
					x1="-1.15"
					y1="-0.95"
					x2="1.15"
					y2="-0.95"
					className="illo-hair"
					vectorEffect="non-scaling-stroke"
				/>
				{[-0.72, 0.42].map((y, i) => (
					<g key={y}>
						<rect
							x="-0.88"
							y={y}
							width="1.76"
							height="0.94"
							rx="0.24"
							className={i === 0 ? "illo-accent" : "illo-mote"}
						/>
						<rect
							x="-0.88"
							y={y}
							width="1.76"
							height="0.94"
							rx="0.24"
							className="illo-outline"
							vectorEffect="non-scaling-stroke"
						/>
					</g>
				))}
				<rect
					x="-1.15"
					y="-1.65"
					width="2.3"
					height="3.3"
					rx="0.32"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
			</g>
		</>
	);
}

/* ------------------------------------------------------------- invoices none */

/** A record row that carries money: label bars left, amount chip right. */
function AmountRow({
	g,
	a,
	b,
	h,
	accent,
	quiet,
}: {
	g: ReturnType<typeof isoGrid>;
	a: number;
	b: number;
	h: number;
	accent?: boolean;
	quiet?: boolean;
}) {
	return (
		<g transform={g.topMatrix(a, b, h)}>
			<rect
				x="-3"
				y="-0.85"
				width="6"
				height="1.7"
				rx="0.33"
				className="illo-knock"
			/>
			<rect
				x="-3"
				y="-0.85"
				width="6"
				height="1.7"
				rx="0.33"
				className="illo-outline"
				vectorEffect="non-scaling-stroke"
				opacity={quiet ? 0.55 : undefined}
			/>
			{/* left label bars */}
			<rect
				x="-2.68"
				y="-0.5"
				width={accent ? 2.35 : 2}
				height="0.32"
				rx="0.16"
				className="illo-mote"
			/>
			<rect
				x="-2.68"
				y="0.16"
				width="1.4"
				height="0.24"
				rx="0.12"
				className="illo-mote"
			/>
			{/* right amount chip */}
			<rect
				x="1"
				y="-0.36"
				width="1.85"
				height="0.72"
				rx="0.36"
				className={accent ? "illo-accent" : "illo-mote"}
			/>
			{accent && (
				<line
					x1="1.42"
					y1="0"
					x2="2.42"
					y2="0"
					className="illo-on-accent"
					vectorEffect="non-scaling-stroke"
				/>
			)}
		</g>
	);
}

/** Squat stack of extruded discs, laid flat in the top plane. Each disc's
 *  side ring is a neutral ellipse; only the crowning face takes the accent. */
function CoinStack({
	g,
	a,
	b,
	r,
	t,
	count,
}: {
	g: ReturnType<typeof isoGrid>;
	a: number;
	b: number;
	r: number;
	/** Disc thickness in px of screen rise. */
	t: number;
	count: number;
}) {
	return (
		<>
			<path d={g.ground(a - r, b - r, 0, r * 2, r * 2)} className="illo-cast" />
			{Array.from({ length: count + 1 }, (_, i) => (
				<g key={i} transform={g.topMatrix(a, b, i * t)}>
					<circle
						cx="0"
						cy="0"
						r={r}
						className={i === count ? "illo-accent" : "illo-face-right"}
					/>
					<circle
						cx="0"
						cy="0"
						r={r}
						className="illo-outline"
						vectorEffect="non-scaling-stroke"
					/>
				</g>
			))}
		</>
	);
}

function InvoicesNoneScene({ hero }: { hero: boolean }) {
	const s = hero ? 1.6 : 1;
	const g = isoGrid(86 * s, 74 * s, 8 * s);
	return (
		<>
			{/* cast shadow under the cascade */}
			<path d={g.ground(-1.8, -1.4, 0, 4.4, 2.8)} className="illo-cast" />

			{/* dashed incoming row, floating highest */}
			<g transform={g.topMatrix(-2, 0, 41 * s)}>
				<rect
					x="-3"
					y="-0.85"
					width="6"
					height="1.7"
					rx="0.33"
					className="illo-dash"
					vectorEffect="non-scaling-stroke"
				/>
			</g>

			{/* terraced ledger rows, back to front */}
			<AmountRow g={g} a={-2} b={0} h={29 * s} quiet />
			<AmountRow g={g} a={0} b={0} h={20 * s} quiet />
			<AmountRow g={g} a={2} b={0} h={11 * s} accent />

			{/* the money itself, grounded in front of the cascade */}
			<CoinStack g={g} a={4.6} b={1.4} r={1.05} t={3 * s} count={3} />

			{/* OneTool beacon, front-left */}
			<Beacon g={g} a={-2.6} b={3.4} markSize={15 * s} />

			{/* motes */}
			<circle cx={28 * s} cy={30 * s} r={1.8 * s} className="illo-mote" />
			<circle cx={172 * s} cy={26 * s} r={2 * s} className="illo-accent-soft" />
			<circle cx={178 * s} cy={88 * s} r={1.6 * s} className="illo-mote" />
			{hero && (
				<>
					<circle cx={296} cy={62} r={2.6} className="illo-mote" />
					<rect
						x={256}
						y={150}
						width={5}
						height={5}
						rx={1}
						transform="rotate(20 258 152)"
						className="illo-accent-soft"
					/>
				</>
			)}
		</>
	);
}

export function InvoicesNone() {
	return <InvoicesNoneScene hero={false} />;
}

export function InvoicesNoneHero() {
	return <InvoicesNoneScene hero />;
}

export function InvoicesNoneSm() {
	const g = isoGrid(40, 26, 4.6);
	return (
		<>
			<path d={g.ground(-1.6, -1.4, 0, 4.8, 2.8)} className="illo-cast" />
			<AmountRow g={g} a={0} b={0} h={8} accent />
		</>
	);
}

/* ---------------------------------------------------------------- tasks none */

function TasksNoneScene({ hero }: { hero: boolean }) {
	const s = hero ? 1.6 : 1;
	const g = isoGrid(96 * s, 78 * s, 8 * s);
	const plinth = g.box(-3.1, -2.3, 0, 6.2, 4.6, 9 * s);
	const rows = [-0.9, 0.1, 1.1];
	return (
		<>
			{/* ground + plinth */}
			<path d={g.ground(-3.6, -2.7, 0, 7.2, 5.4)} className="illo-cast" />
			<path d={plinth.top} className="illo-face-top" />
			<path d={plinth.left} className="illo-face-left" />
			<path d={plinth.right} className="illo-face-right" />
			<path d={plinth.top} className="illo-outline" />
			<path d={plinth.outline} className="illo-outline" />

			{/* the plate's shadow, landing on the plinth top */}
			<path
				d={g.ground(-2.2, -1.7, 9 * s + 0.5, 4.4, 3.4)}
				className="illo-cast"
			/>

			{/* floating checklist plate */}
			<g transform={g.topMatrix(0, 0, 34 * s)}>
				<rect
					x="-3.1"
					y="-2.35"
					width="6.2"
					height="5.1"
					rx="0.5"
					className="illo-knock"
				/>
				<rect
					x="-3.1"
					y="-2.35"
					width="6.2"
					height="5.1"
					rx="0.5"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				{/* header dots + rule */}
				<circle cx="-2.6" cy="-2" r="0.14" className="illo-mote" />
				<circle cx="-2.18" cy="-2" r="0.14" className="illo-mote" />
				<line
					x1="-3.1"
					y1="-1.62"
					x2="3.1"
					y2="-1.62"
					className="illo-hair"
					vectorEffect="non-scaling-stroke"
				/>
				{rows.map((y, i) => (
					<g key={y}>
						<rect
							x="-2.55"
							y={y - 0.43}
							width="0.86"
							height="0.86"
							rx="0.2"
							className={i === 0 ? "illo-accent" : "illo-knock"}
						/>
						<rect
							x="-2.55"
							y={y - 0.43}
							width="0.86"
							height="0.86"
							rx="0.2"
							className="illo-outline"
							vectorEffect="non-scaling-stroke"
						/>
						{i === 0 && (
							<path
								d={`M -2.38 ${y - 0.06} l 0.22 0.24 l 0.34 -0.46`}
								className="illo-on-accent"
								vectorEffect="non-scaling-stroke"
								style={{ strokeWidth: 1.5 }}
							/>
						)}
						<rect
							x="-1.5"
							y={y - 0.17}
							width={[3.3, 2.5, 3.85][i]}
							height="0.34"
							rx="0.17"
							className="illo-mote"
						/>
					</g>
				))}
				{/* the next task, not written yet */}
				<rect
					x="-2.55"
					y="1.75"
					width="4.7"
					height="0.56"
					rx="0.22"
					className="illo-dash"
					vectorEffect="non-scaling-stroke"
				/>
			</g>

			{/* OneTool beacon, at the plinth's lower-left corner */}
			<Beacon g={g} a={-1.6} b={2.6} markSize={16 * s} />

			{/* motes */}
			<circle cx={30 * s} cy={34 * s} r={1.8 * s} className="illo-mote" />
			<circle cx={168 * s} cy={40 * s} r={2 * s} className="illo-accent-soft" />
			<circle cx={172 * s} cy={94 * s} r={1.6 * s} className="illo-mote" />
			{hero && (
				<>
					{/* a smaller list drifting in behind */}
					<g transform={g.topMatrix(-5.4, 1.2, 44 * s)}>
						<rect
							x="-1.3"
							y="-0.9"
							width="2.6"
							height="1.8"
							rx="0.35"
							className="illo-knock"
						/>
						<rect
							x="-1.3"
							y="-0.9"
							width="2.6"
							height="1.8"
							rx="0.35"
							className="illo-outline"
							vectorEffect="non-scaling-stroke"
						/>
						{[-0.45, 0.35].map((y) => (
							<g key={y}>
								<rect
									x="-1.05"
									y={y - 0.24}
									width="0.48"
									height="0.48"
									rx="0.12"
									className="illo-knock"
								/>
								<rect
									x="-1.05"
									y={y - 0.24}
									width="0.48"
									height="0.48"
									rx="0.12"
									className="illo-outline"
									vectorEffect="non-scaling-stroke"
								/>
								<rect
									x="-0.38"
									y={y - 0.14}
									width={y < 0 ? 1.35 : 1}
									height="0.28"
									rx="0.14"
									className="illo-mote"
								/>
							</g>
						))}
					</g>
					<circle cx={300} cy={132} r={2.6} className="illo-mote" />
					<rect
						x={272}
						y={54}
						width={5}
						height={5}
						rx={1}
						transform="rotate(-18 274 56)"
						className="illo-accent-soft"
					/>
				</>
			)}
		</>
	);
}

export function TasksNone() {
	return <TasksNoneScene hero={false} />;
}

export function TasksNoneHero() {
	return <TasksNoneScene hero />;
}

export function TasksNoneSm() {
	const g = isoGrid(40, 28, 5.4);
	const rows = [-0.6, 0.55];
	return (
		<>
			<path d={g.ground(-2.2, -1.7, 0, 4.4, 3.4)} className="illo-cast" />
			<g transform={g.topMatrix(0, 0, 9)}>
				<rect
					x="-2.2"
					y="-1.6"
					width="4.4"
					height="3.2"
					rx="0.4"
					className="illo-knock"
				/>
				<rect
					x="-2.2"
					y="-1.6"
					width="4.4"
					height="3.2"
					rx="0.4"
					className="illo-outline"
					vectorEffect="non-scaling-stroke"
				/>
				{rows.map((y, i) => (
					<g key={y}>
						<rect
							x="-1.8"
							y={y - 0.42}
							width="0.84"
							height="0.84"
							rx="0.18"
							className={i === 0 ? "illo-accent" : "illo-knock"}
						/>
						<rect
							x="-1.8"
							y={y - 0.42}
							width="0.84"
							height="0.84"
							rx="0.18"
							className="illo-outline"
							vectorEffect="non-scaling-stroke"
						/>
						{i === 0 && (
							<path
								d={`M -1.68 ${y - 0.13} l 0.26 0.28 l 0.38 -0.52`}
								className="illo-on-accent"
								vectorEffect="non-scaling-stroke"
							/>
						)}
						<rect
							x="-0.8"
							y={y - 0.2}
							width={i === 0 ? 2.4 : 1.8}
							height="0.4"
							rx="0.2"
							className="illo-mote"
						/>
					</g>
				))}
			</g>
		</>
	);
}
