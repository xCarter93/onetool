import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DraftedShape } from "../blueprint/drafted-shape";
import { VertexTicks } from "../blueprint/vertex-ticks";
import {
	BRACKET_CORNERS,
	BRACKET_H,
	BRACKET_OFFSET,
	BRACKET_W,
	CARD_BRACKET,
	CARD_H,
	CARD_W,
	LIVE_CORNER,
	T,
} from "./hero-data";

/**
 * A faithful OneTool card miniature, drafted.
 *
 * Two inks in one object: the card itself is the workspace's real recipe —
 * `rounded-xl bg-card ring-1 ring-foreground/10`, ring never shadow, which is
 * the app's signature — and the hairline box floating 5px outside it is the
 * drafted construction extent. Semantic colour appears ONLY in the status chip,
 * using the product's own StatusBadge soft-variant classes verbatim.
 */

/* Verbatim from components/reui/badge.tsx — the soft variants StatusBadge uses
   for `sent`/`scheduled` (info) and `approved`/`paid` (success). Copied rather
   than imported because Badge is a client component and this card is not. */
const CHIP_TONE = {
	info: "border-info/15 bg-info/10 text-info-foreground dark:border-info/25 dark:bg-info/15 dark:text-info",
	success:
		"border-success/15 bg-success/10 text-success-foreground dark:border-success/25 dark:bg-success/15 dark:text-success",
} as const;

/** Fixed box so the terminal chip covers the initial one exactly when it flips. */
const CHIP_BASE =
	"flex h-[18px] w-[68px] items-center justify-center rounded-full border text-[9px] font-medium leading-none";

type Tone = keyof typeof CHIP_TONE;

/**
 * A status chip that flips to its terminal state.
 *
 * Deliberately CSS, not state: the terminal chip sits stacked over the initial
 * one and fades in on `.bp-fade-in`. That means the reduced-motion override and
 * the <noscript> floor in globals.css both land it on the TERMINAL state with
 * no JavaScript and no hydration flash — a useState/useEffect flip would paint
 * the server's answer first and then visibly jump backwards.
 *
 * The initial chip is aria-hidden: a screen reader should hear the outcome, not
 * a superseded state. The transition itself is narrated in the scene's sr-only
 * summary.
 */
export function StatusChip({
	from,
	to,
	fromTone = "info",
	toTone = "success",
	delay,
}: {
	from: string;
	to: string;
	fromTone?: Tone;
	toTone?: Tone;
	delay: number;
}) {
	return (
		<span className="grid">
			<span
				aria-hidden="true"
				className={cn("col-start-1 row-start-1", CHIP_BASE, CHIP_TONE[fromTone])}
			>
				{from}
			</span>
			<span
				className="bp-fade-in col-start-1 row-start-1 rounded-full bg-card"
				style={{ "--bp-delay": `${delay}s` } as CSSProperties}
			>
				<span className={cn(CHIP_BASE, CHIP_TONE[toTone])}>{to}</span>
			</span>
		</span>
	);
}

/** A chip with no transition — the state was true from the start. */
export function StaticChip({
	children,
	tone = "info",
}: {
	children: ReactNode;
	tone?: Tone;
}) {
	return <span className={cn(CHIP_BASE, CHIP_TONE[tone])}>{children}</span>;
}

export function JourneyCard({
	eyebrow,
	icon: Icon,
	title,
	subtitle,
	footLabel,
	footValue,
	chip,
	step,
	className,
}: {
	eyebrow: string;
	icon: LucideIcon;
	title: string;
	subtitle: string;
	footLabel: string;
	footValue: string;
	chip: ReactNode;
	/** Index into the scene's choreography table. */
	step: 0 | 1 | 2;
	className?: string;
}) {
	const bracketDelay = T.bracket[step];
	const bodyDelay = T.body[step];

	return (
		<div
			className={cn("relative shrink-0", className)}
			style={{ width: CARD_W, height: CARD_H }}
		>
			{/* Construction extents. overflow-visible so the corner ticks, which are
			    centred on the bracket, are not clipped by the svg box. */}
			<svg
				aria-hidden="true"
				focusable="false"
				width={BRACKET_W}
				height={BRACKET_H}
				className="pointer-events-none absolute overflow-visible"
				style={{ left: BRACKET_OFFSET, top: BRACKET_OFFSET }}
			>
				<DraftedShape
					d={CARD_BRACKET}
					tone="line"
					weight="thin"
					draw
					delay={bracketDelay}
				/>
				<VertexTicks
					points={BRACKET_CORNERS}
					live={LIVE_CORNER}
					delayChildren={bracketDelay + T.ticksAfterBracket}
				/>
			</svg>

			<div
				className="bp-rise relative flex h-full flex-col rounded-xl bg-card p-3 ring-1 ring-foreground/10"
				style={{ "--bp-delay": `${bodyDelay}s` } as CSSProperties}
			>
				<div className="flex items-center gap-2">
					<span className="flex size-5 items-center justify-center rounded-md bg-muted text-muted-foreground">
						<Icon className="size-3" aria-hidden="true" />
					</span>
					<span className="text-[9px] font-semibold uppercase leading-none tracking-[0.12em] text-muted-foreground">
						{eyebrow}
					</span>
					<span className="ml-auto">{chip}</span>
				</div>

				<p className="mt-3 text-[13px] font-semibold leading-none tracking-[-0.01em] tabular-nums text-foreground">
					{title}
				</p>
				<p className="mt-1.5 truncate text-[11px] leading-none text-muted-foreground">
					{subtitle}
				</p>

				<div className="mt-auto flex items-baseline justify-between border-t border-border pt-2">
					<span className="text-[10px] uppercase leading-none tracking-[0.1em] text-muted-foreground">
						{footLabel}
					</span>
					<span className="text-[12px] font-semibold leading-none tabular-nums text-foreground">
						{footValue}
					</span>
				</div>
			</div>
		</div>
	);
}
