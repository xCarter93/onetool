/**
 * Line-art miniatures for the capability plates. Schematic, not screenshot: the
 * whole set is hairlines and token fills, so a card track reads as one drawing
 * rather than nine product shots.
 *
 * Server module, zero dependencies — inline SVG and divs only. Every stroke and
 * fill is a semantic token (`border`, `muted-foreground`, `primary`); nothing
 * here carries a literal color, so the set flips with the theme AND inside a
 * locally re-scoped `.dark` band.
 *
 * Purely decorative: hosts render these behind `aria-hidden`, and the card copy
 * carries the meaning.
 */

/** A client record: identity header, then the linked activity beneath it. */
function ClientsMiniature() {
	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center gap-2.5">
				<div className="size-7 shrink-0 rounded-full border border-primary/40 bg-primary/10" />
				<div className="flex flex-col gap-1.5">
					<div className="h-1.5 w-24 rounded-full bg-muted-foreground/50" />
					<div className="h-1.5 w-14 rounded-full bg-muted-foreground/25" />
				</div>
			</div>
			<div className="mt-auto flex flex-col gap-2 border-t border-bp-line pt-3">
				{["w-28", "w-20", "w-24"].map((width) => (
					<div key={width} className="flex items-center gap-2">
						<div className="size-1 shrink-0 rounded-full bg-primary/60" />
						<div
							className={`h-1.5 rounded-full bg-muted-foreground/30 ${width}`}
						/>
						<div className="ml-auto h-1.5 w-6 rounded-full bg-muted-foreground/20" />
					</div>
				))}
			</div>
		</div>
	);
}

/** A quote sheet: priced lines, then a signature laid across the rule. */
function QuotesMiniature() {
	return (
		<div className="flex h-full flex-col">
			<div className="flex flex-col gap-2">
				{["w-24", "w-32", "w-20"].map((width) => (
					<div key={width} className="flex items-center gap-2">
						<div
							className={`h-1.5 rounded-full bg-muted-foreground/30 ${width}`}
						/>
						<div className="ml-auto h-1.5 w-7 rounded-full bg-muted-foreground/20" />
					</div>
				))}
			</div>
			<div className="mt-auto">
				<svg
					viewBox="0 0 132 18"
					fill="none"
					strokeWidth={1.5}
					strokeLinecap="round"
					className="-mb-1 h-5 w-32 stroke-primary/70"
				>
					<path d="M2 14c5 0 6-10 9-10s0 12 3 12 5-13 8-13 1 12 4 12 5-8 8-8 3 6 6 6 5-4 8-4 5 3 8 3 6-2 9-2" />
				</svg>
				<div className="h-px w-full bg-bp-line" />
			</div>
		</div>
	);
}

/** A day's route: stops threaded across a faint map grid. */
function RoutingMiniature() {
	return (
		<svg viewBox="0 0 200 80" fill="none" className="h-full w-full">
			<path
				d="M0 20H200M0 40H200M0 60H200M50 0V80M100 0V80M150 0V80"
				strokeWidth={1}
				strokeDasharray="2 5"
				className="stroke-bp-line"
			/>
			<path
				d="M18 62 58 30 104 46 146 18 184 34"
				strokeWidth={1.75}
				strokeLinecap="round"
				strokeLinejoin="round"
				className="stroke-primary/70"
			/>
			{[
				[18, 62],
				[58, 30],
				[104, 46],
				[146, 18],
				[184, 34],
			].map(([cx, cy], index) => (
				<circle
					key={`${cx}-${cy}`}
					cx={cx}
					cy={cy}
					r={4}
					strokeWidth={1.5}
					className={
						index === 0 || index === 4
							? "fill-primary/40 stroke-primary"
							: "fill-bp-paper stroke-primary/60"
					}
				/>
			))}
		</svg>
	);
}

/** An invoice: line items, a total, and the collected share filling in. */
function InvoicesMiniature() {
	return (
		<div className="flex h-full flex-col">
			<div className="flex flex-col gap-2">
				{["w-28", "w-20"].map((width) => (
					<div key={width} className="flex items-center gap-2">
						<div
							className={`h-1.5 rounded-full bg-muted-foreground/30 ${width}`}
						/>
						<div className="ml-auto h-1.5 w-7 rounded-full bg-muted-foreground/20" />
					</div>
				))}
			</div>
			<div className="mt-3 flex items-center gap-2 border-t border-bp-line pt-3">
				<div className="h-2 w-12 rounded-full bg-muted-foreground/50" />
				<div className="ml-auto h-2 w-10 rounded-full bg-primary/60" />
			</div>
			<div className="mt-auto h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/15">
				<div className="h-full w-2/3 rounded-full bg-primary/50" />
			</div>
		</div>
	);
}

/** A rule that fires: trigger, branch, two actions, and the switch left on. */
function AutomationsMiniature() {
	return (
		<svg viewBox="0 0 200 80" fill="none" className="h-full w-full">
			<rect
				x={3}
				y={28}
				width={48}
				height={24}
				rx={6}
				strokeWidth={1.25}
				className="fill-primary/10 stroke-primary/50"
			/>
			<path
				d="M51 40H74M74 40V16H110M74 40V64H110"
				strokeWidth={1.25}
				strokeLinecap="round"
				className="stroke-bp-line"
			/>
			{[4, 52].map((y) => (
				<rect
					key={y}
					x={110}
					y={y}
					width={50}
					height={24}
					rx={6}
					strokeWidth={1.25}
					className="fill-muted stroke-bp-line"
				/>
			))}
			<rect
				x={172}
				y={33}
				width={25}
				height={14}
				rx={7}
				strokeWidth={1.25}
				className="fill-primary/20 stroke-primary/50"
			/>
			<circle cx={190} cy={40} r={4} className="fill-primary" />
		</svg>
	);
}

/** A question typed in plain English, and the chart it comes back as. */
function AssistantMiniature() {
	return (
		<div className="flex h-full flex-col justify-between">
			<div className="flex items-center gap-2 rounded-md border border-bp-line bg-bp-paper px-2.5 py-2">
				<div className="size-1.5 shrink-0 rounded-full bg-primary" />
				<div className="h-1.5 w-20 rounded-full bg-muted-foreground/35" />
			</div>
			<div className="flex h-10 items-end gap-1.5">
				{[
					["h-3", "bg-muted-foreground/25"],
					["h-5", "bg-muted-foreground/25"],
					["h-4", "bg-muted-foreground/25"],
					["h-7", "bg-muted-foreground/25"],
					["h-6", "bg-primary/35"],
					["h-9", "bg-primary/55"],
				].map(([height, tone]) => (
					<div
						key={`${height}-${tone}`}
						className={`flex-1 rounded-sm ${height} ${tone}`}
					/>
				))}
			</div>
		</div>
	);
}

/** A week of work: day columns, and today's visit inked in. */
function ScheduleMiniature() {
	return (
		<svg viewBox="0 0 200 80" fill="none" className="h-full w-full">
			{[4, 44, 84, 124, 164].map((x) => (
				<rect
					key={x}
					x={x}
					y={0}
					width={16}
					height={4}
					rx={2}
					className="fill-muted-foreground/35"
				/>
			))}
			<path d="M0 14H200" strokeWidth={1} className="stroke-bp-line" />
			<path
				d="M40 14V80M80 14V80M120 14V80M160 14V80"
				strokeWidth={1}
				strokeDasharray="2 5"
				className="stroke-bp-line"
			/>
			{[
				[5, 24],
				[45, 40],
				[125, 30],
				[165, 50],
			].map(([x, y]) => (
				<rect
					key={`${x}-${y}`}
					x={x}
					y={y}
					width={30}
					height={13}
					rx={3}
					className="fill-muted-foreground/20"
				/>
			))}
			<rect
				x={85}
				y={22}
				width={30}
				height={13}
				rx={3}
				strokeWidth={1.25}
				className="fill-primary/20 stroke-primary/60"
			/>
			<rect
				x={85}
				y={52}
				width={30}
				height={13}
				rx={3}
				className="fill-muted-foreground/20"
			/>
		</svg>
	);
}

/** The client's own window: the document they were sent, and the approval. */
function PortalMiniature() {
	return (
		<div className="flex h-full flex-col border border-bp-line bg-bp-paper">
			<div className="flex items-center gap-1.5 border-b border-bp-line px-2 py-1.5">
				{["a", "b", "c"].map((dot) => (
					<div
						key={dot}
						className="size-1 shrink-0 rounded-full bg-muted-foreground/35"
					/>
				))}
				<div className="ml-1 h-1.5 flex-1 rounded-full bg-muted-foreground/15" />
			</div>
			<div className="flex flex-1 items-center gap-3 px-2.5">
				<div className="flex min-w-0 flex-1 flex-col gap-1.5">
					<div className="h-1.5 w-full rounded-full bg-muted-foreground/30" />
					<div className="h-1.5 w-4/5 rounded-full bg-muted-foreground/20" />
					<div className="h-1.5 w-3/5 rounded-full bg-muted-foreground/20" />
				</div>
				<div className="flex shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-2 py-1.5">
					<svg
						viewBox="0 0 10 10"
						fill="none"
						strokeWidth={1.5}
						strokeLinecap="round"
						strokeLinejoin="round"
						className="size-2.5 stroke-primary"
					>
						<path d="M1.5 5.2 3.9 7.6 8.5 2.4" />
					</svg>
					<div className="h-1.5 w-7 rounded-full bg-primary/60" />
				</div>
			</div>
		</div>
	);
}

/** A thread: the newest reply on top, the older messages settling under it. */
function InboxMiniature() {
	return (
		<div className="flex h-full flex-col justify-between">
			{[
				{ key: "newest", accent: true, width: "w-24" },
				{ key: "middle", accent: false, width: "w-28" },
				{ key: "oldest", accent: false, width: "w-20" },
			].map(({ key, accent, width }) => (
				<div key={key} className="flex items-center gap-2">
					<div
						className={`size-4 shrink-0 rounded-full ${
							accent
								? "border border-primary/40 bg-primary/15"
								: "bg-muted-foreground/20"
						}`}
					/>
					<div className="flex min-w-0 flex-1 flex-col gap-1">
						<div
							className={`h-1 rounded-full ${width} ${
								accent ? "bg-primary/55" : "bg-muted-foreground/40"
							}`}
						/>
						<div className="h-1 w-16 rounded-full bg-muted-foreground/20" />
					</div>
					{accent ? (
						<svg
							viewBox="0 0 14 13"
							fill="none"
							strokeWidth={1.25}
							strokeLinecap="round"
							strokeLinejoin="round"
							className="ml-auto h-3 w-3.5 shrink-0 stroke-primary/70"
						>
							<path d="M6 2 2 6l4 4M2 6h6.5A3.5 3.5 0 0 1 12 9.5V11" />
						</svg>
					) : (
						<div className="ml-auto h-1 w-5 shrink-0 rounded-full bg-muted-foreground/20" />
					)}
				</div>
			))}
		</div>
	);
}

/** The nine topics that have a drawing. Keys are stable; hosts look up by key. */
export type MiniatureKey =
	| "clients"
	| "quotes"
	| "schedule"
	| "routing"
	| "invoices"
	| "portal"
	| "automations"
	| "inbox"
	| "assistant";

export const FEATURE_MINIATURES: Record<MiniatureKey, () => React.ReactElement> =
	{
		clients: ClientsMiniature,
		quotes: QuotesMiniature,
		schedule: ScheduleMiniature,
		routing: RoutingMiniature,
		invoices: InvoicesMiniature,
		portal: PortalMiniature,
		automations: AutomationsMiniature,
		inbox: InboxMiniature,
		assistant: AssistantMiniature,
	};

/**
 * The framed plate a miniature sits on: a squat hairline panel in the sheet's
 * own vocabulary (square corners, `bp-line`, paper fill), sized so the drawing
 * stays card art and never competes with the heading.
 */
export function MiniaturePlate({ miniature }: { miniature: MiniatureKey }) {
	const Miniature = FEATURE_MINIATURES[miniature];
	return (
		<div
			aria-hidden="true"
			className="h-24 overflow-hidden border border-bp-line bg-muted/40 p-4 transition-colors duration-200 group-hover:border-primary/25 motion-reduce:transition-none"
		>
			<Miniature />
		</div>
	);
}
