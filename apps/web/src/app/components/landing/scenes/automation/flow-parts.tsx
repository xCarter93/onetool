import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	CARD_H,
	CARD_W,
	FLOW_DASH,
	FLOW_EDGE,
	PLUS_R,
	type AccentKey,
} from "./automation-data";

/**
 * The pieces of the automation-editor miniature. Server components, zero JS:
 * every beat is a CSS `--bp-delay` fired by the scene's single <DrawIn>.
 *
 * These are PRODUCT marks, not blueprint marks. They use the product's own
 * tokens (--muted-foreground, --border, the node hue families, the StatusBadge
 * success palette) rather than --bp-*, because the whole point of a faithful
 * miniature is that it is the app, drawn small. The blueprint ink stays outside
 * the canvas plate.
 */

/* ---------------------------------------------------------------------------
 * Node identity — action-meta.ts / trigger-node-rf.tsx / condition-node-rf.tsx
 * ------------------------------------------------------------------------- */

const ACCENT: Record<AccentKey, { bar: string; chip: string }> = {
	amber: {
		bar: "border-l-amber-500 dark:border-l-amber-400",
		chip: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
	},
	violet: {
		bar: "border-l-violet-500 dark:border-l-violet-400",
		chip: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
	},
	sky: {
		bar: "border-l-sky-500 dark:border-l-sky-400",
		chip: "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
	},
	green: {
		bar: "border-l-green-500 dark:border-l-green-400",
		chip: "bg-green-100 text-green-700 dark:bg-green-400/15 dark:text-green-300",
	},
};

/**
 * Verbatim from components/reui/badge.tsx — the `success-light` soft variant
 * StatusBadge uses for approved/paid/completed. Copied rather than imported
 * because Badge is a client component and every part of this scene is not.
 */
export const CHIP_SUCCESS =
	"border-success/15 bg-success/10 text-success-foreground dark:border-success/25 dark:bg-success/15 dark:text-success";

/* ---------------------------------------------------------------------------
 * Edges
 * ------------------------------------------------------------------------- */

/**
 * One edge of the flow.
 *
 * Solid edges draw on with the CSS `.bp-draw` technique. Dashed edges never do:
 * the draw-on owns strokeDasharray, so animating it would destroy the `5 4`
 * rhythm that carries the "not built yet" meaning (playbook failure mode #1).
 * They reveal with opacity instead.
 */
export function FlowEdge({
	d,
	dash = false,
	delay = 0,
}: {
	d: string;
	dash?: boolean;
	delay?: number;
}) {
	return (
		<path
			d={d}
			fill="none"
			className={dash ? "bp-fade-in" : "bp-draw"}
			pathLength={dash ? undefined : 1}
			strokeDasharray={dash ? FLOW_DASH : undefined}
			strokeLinecap="butt"
			strokeLinejoin="round"
			style={
				{
					stroke: FLOW_EDGE,
					strokeWidth: 1.5,
					"--bp-delay": `${delay}s`,
				} as CSSProperties
			}
		/>
	);
}

/* ---------------------------------------------------------------------------
 * Node card
 * ------------------------------------------------------------------------- */

/**
 * A step card. The product's recipe at miniature scale: `rounded-md border
 * border-border shadow-sm` on `bg-card`, a 4px left accent bar carrying the node
 * type's identity, a square icon chip, title over description, and the category
 * pill on the right.
 *
 * The run's success ring and the chip flip are both CSS-only stacked overlays
 * rather than state. That means the reduced-motion override and the <noscript>
 * floor in globals.css both land the card on its TERMINAL state — ring on, chip
 * flipped — with no JavaScript and no hydration flash. A useState flip would
 * paint the server's answer and then visibly jump.
 */
export function FlowNode({
	y,
	accent,
	icon: Icon,
	title,
	description,
	category,
	eyebrow,
	cardDelay,
	ringDelay,
}: {
	y: number;
	accent: AccentKey;
	icon: LucideIcon;
	title: string;
	description: string;
	category: string;
	eyebrow?: string;
	cardDelay: number;
	ringDelay: number;
}) {
	const tone = ACCENT[accent];

	return (
		<div
			className="bp-rise absolute"
			style={
				{
					left: 0,
					top: y,
					width: CARD_W,
					height: CARD_H,
					"--bp-delay": `${cardDelay}s`,
				} as CSSProperties
			}
		>
			{/*
			 * run-status.ts's `success` ring, drawn as a sibling so it can fade in
			 * without touching the card. The 3px outset stands in for the product's
			 * ring-offset-2: the canvas paints the gap, exactly as ring-offset does.
			 */}
			<span
				aria-hidden="true"
				className="bp-fade-in pointer-events-none absolute inset-[-3px] rounded-[12px] ring-2 ring-emerald-500/70"
				style={{ "--bp-delay": `${ringDelay}s` } as CSSProperties}
			/>

			{eyebrow ? (
				<span
					className={cn(
						"absolute left-2.5 top-[-6px] z-10 bg-background px-1.5 text-[9px] font-semibold uppercase leading-[10px] tracking-[0.12em]",
						"text-amber-700 dark:text-amber-300",
					)}
				>
					{eyebrow}
				</span>
			) : null}

			<div
				className={cn(
					"flex h-full items-center gap-2 rounded-md border border-l-4 border-border bg-card px-2.5 shadow-sm",
					tone.bar,
				)}
			>
				<span
					className={cn(
						"flex size-6 shrink-0 items-center justify-center rounded-lg",
						tone.chip,
					)}
				>
					<Icon className="size-3.5" aria-hidden="true" />
				</span>

				<span className="min-w-0 flex-1">
					<span className="block truncate text-[11px] font-semibold leading-none text-foreground">
						{title}
					</span>
					<span className="mt-1 line-clamp-2 block text-[10px] leading-[1.25] text-muted-foreground">
						{description}
					</span>
				</span>

				{/*
				 * The category pill flips to the success chip. Both live in one grid
				 * cell so the flip cannot shift the row; the terminal layer is opaque
				 * so it covers the pill outright. The pill stays in the accessibility
				 * tree (it is real product vocabulary) and the flip is aria-hidden —
				 * the run's outcome is narrated once, in the scene's sr-only summary.
				 */}
				<span className="grid shrink-0">
					<span className="col-start-1 row-start-1 rounded-full bg-muted px-1 py-px text-[9px] font-medium leading-[14px] text-muted-foreground">
						{category}
					</span>
					<span
						aria-hidden="true"
						className="bp-fade-in col-start-1 row-start-1 rounded-full bg-card"
						style={{ "--bp-delay": `${ringDelay}s` } as CSSProperties}
					>
						<span
							className={cn(
								"flex h-[16px] w-full items-center justify-center rounded-full border",
								CHIP_SUCCESS,
							)}
						>
							<Check className="size-2.5" aria-hidden="true" />
						</span>
					</span>
				</span>
			</div>
		</div>
	);
}

/* ---------------------------------------------------------------------------
 * Branch labels and stub affordances
 * ------------------------------------------------------------------------- */

/**
 * A branch label pill, sitting on the fan-out corner. Opaque, so it knocks the
 * edge out beneath it — which is what the product's own pill does.
 */
export function BranchPill({
	x,
	y,
	delay,
	children,
}: {
	x: number;
	y: number;
	delay: number;
	children: ReactNode;
}) {
	return (
		<span
			className="bp-fade-in absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-border/60 bg-muted px-1.5 py-px text-[9px] font-semibold leading-[14px] text-muted-foreground"
			style={{ left: x, top: y, "--bp-delay": `${delay}s` } as CSSProperties}
		>
			{children}
		</span>
	);
}

/**
 * The "+" at the end of an unbuilt stub. Decorative here — it is a picture of an
 * affordance, not one — so it is aria-hidden and carries no interactive role.
 */
export function StubPlus({
	x,
	y,
	delay,
}: {
	x: number;
	y: number;
	delay: number;
}) {
	return (
		<span
			aria-hidden="true"
			className="bp-fade-in absolute flex items-center justify-center rounded-full border border-border bg-background text-muted-foreground"
			style={
				{
					left: x - PLUS_R,
					top: y - PLUS_R,
					width: PLUS_R * 2,
					height: PLUS_R * 2,
					"--bp-delay": `${delay}s`,
				} as CSSProperties
			}
		>
			<Plus className="size-3" />
		</span>
	);
}
