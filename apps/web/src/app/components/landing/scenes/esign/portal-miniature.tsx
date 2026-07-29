import type { CSSProperties, ReactNode } from "react";
import { ArrowLeft, Check, CheckCircle2, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { Stamp } from "../../blueprint/stamp";
import { caveat } from "./caveat";
import {
	JOURNEY_ACCEPTED,
	JOURNEY_PENDING,
	LINE_ITEMS,
	QUOTE,
	T,
	type JourneyStep,
} from "./esign-data";

/**
 * A faithful miniature of the client portal's quote page.
 *
 * Built at FIXED type metrics on a fluid width, not at Attio's 1x/2x scaling:
 * a scaled miniature lands at 5-6px type on a phone, which is illegible rather
 * than small. Only the two-pane grid collapses.
 *
 * The whole subtree is aria-hidden from the scene shell. It imitates controls —
 * tabs, a checkbox, a submit button — and a screen reader walking a fake form
 * is worse than useless; the scene's sr-only summary carries every fact
 * instead. Nothing in here is a real <button> or <input>, so nothing is
 * focusable either.
 *
 * INK DISCIPLINE. Semantic colour appears only in the status chips (the
 * StatusBadge soft-variant vocabulary) and on the approved check glyph. The
 * receipt panel stays --card with a success ring rather than the product's
 * emerald wash — a green panel this size would be the loudest thing on a page
 * whose whole argument is two inks.
 */

/* Verbatim from components/reui/badge.tsx — the soft variants StatusBadge maps
   `sent` (info) and `approved` (success) to. Copied rather than imported
   because Badge is a client component and this miniature is not. */
const CHIP_TONE = {
	info: "border-info/15 bg-info/10 text-info-foreground dark:border-info/25 dark:bg-info/15 dark:text-info",
	success:
		"border-success/15 bg-success/10 text-success-foreground dark:border-success/25 dark:bg-success/15 dark:text-success",
} as const;

const CHIP_BASE =
	"inline-flex h-[17px] w-fit items-center justify-center rounded-full border px-2 text-[9px] font-medium leading-none whitespace-nowrap";

const EYEBROW =
	"block text-[8px] font-semibold uppercase leading-none tracking-[0.16em] text-muted-foreground";

/**
 * A state change, done as a stacked cross-fade rather than React state.
 *
 * The terminal layer sits over the initial one and fades in on `.bp-fade-in`,
 * so the reduced-motion override and the <noscript> floor in globals.css both
 * land the scene on its FINAL state with no JavaScript and no hydration flash.
 * A useState/useEffect flip would paint the server's answer and then visibly
 * jump backwards.
 *
 * Both layers occupy one grid cell, so the cell is always as tall as the taller
 * state and the flip costs no layout shift. The `to` layer needs an opaque
 * backdrop or the superseded state ghosts through — that is what `cover` is for.
 */
function Flip({
	from,
	to,
	delay,
	className,
	cover = "bg-card",
}: {
	from: ReactNode;
	to: ReactNode;
	/** Seconds. */
	delay: number;
	className?: string;
	/** Opaque backdrop + shape for the terminal layer. */
	cover?: string;
}) {
	return (
		<div className={cn("grid", className)}>
			<div className="col-start-1 row-start-1">{from}</div>
			<div
				className={cn("bp-fade-in col-start-1 row-start-1", cover)}
				style={{ "--bp-delay": `${delay}s` } as CSSProperties}
			>
				{to}
			</div>
		</div>
	);
}

/* ---------------------------------------------------------------------------
 * Portal chrome + hero card
 * ------------------------------------------------------------------------- */

function PortalChrome() {
	return (
		<div
			className="bp-rise flex items-center justify-between border-b border-border pb-2"
			style={{ "--bp-delay": `${T.chrome}s` } as CSSProperties}
		>
			<span className="flex items-center gap-1 text-[10px] leading-none text-muted-foreground">
				<ArrowLeft className="size-2.5" />
				Back
			</span>
			<span className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[10px] font-medium leading-none text-foreground">
				<Download className="size-2.5" />
				Download PDF
			</span>
		</div>
	);
}

function HeroCard() {
	return (
		<div
			className="bp-rise mt-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10"
			style={{ "--bp-delay": `${T.hero}s` } as CSSProperties}
		>
			<div className="flex items-start gap-3">
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<Flip
							cover="rounded-full bg-card"
							delay={T.badge}
							from={
								<span className={cn(CHIP_BASE, CHIP_TONE.info)}>
									Awaiting decision
								</span>
							}
							to={
								<span className={cn(CHIP_BASE, CHIP_TONE.success)}>
									Accepted
								</span>
							}
						/>
						<span className="text-[9px] leading-none text-muted-foreground">
							Sent {QUOTE.sentOn}
						</span>
					</div>
					<p className="mt-2 text-[13px] font-semibold leading-tight tracking-[-0.01em] text-foreground">
						Quote {QUOTE.number} · {QUOTE.title}
					</p>
					<p className="mt-1 text-[10px] leading-none text-muted-foreground">
						{QUOTE.business}
					</p>
				</div>

				<span aria-hidden="true" className="h-11 w-px shrink-0 bg-border" />

				<div className="shrink-0 text-right">
					<span className="block text-[8px] font-medium uppercase leading-none tracking-[0.16em] text-muted-foreground">
						Total
					</span>
					<p className="mt-1.5 text-[19px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-foreground">
						{QUOTE.total}
					</p>
					<p className="mt-1.5 text-[9px] leading-none tabular-nums text-muted-foreground">
						Valid until {QUOTE.validUntil}
					</p>
				</div>
			</div>
		</div>
	);
}

/* ---------------------------------------------------------------------------
 * Quote journey
 * ------------------------------------------------------------------------- */

const INDICATOR = {
	complete: "bg-foreground",
	current: "bg-foreground ring-2 ring-foreground/20",
	upcoming: "border-2 border-input bg-background",
} as const;

function JourneyList({ steps }: { steps: readonly JourneyStep[] }) {
	return (
		<ol className="mt-2.5">
			{steps.map((step, i) => (
				<li key={step.label} className="flex gap-2">
					<span className="flex w-2.5 shrink-0 flex-col items-center">
						<span
							className={cn(
								"mt-[3px] size-2.5 shrink-0 rounded-full",
								INDICATOR[step.state],
							)}
						/>
						{i < steps.length - 1 ? (
							<span
								className={cn(
									"w-px flex-1",
									step.state === "complete" ? "bg-foreground" : "bg-input",
								)}
							/>
						) : null}
					</span>
					<span className={cn("min-w-0", i < steps.length - 1 && "pb-3")}>
						<span
							className={cn(
								"block text-[11px] leading-none",
								step.state === "upcoming"
									? "text-muted-foreground"
									: "font-medium text-foreground",
							)}
						>
							{step.label}
						</span>
						{step.meta ? (
							<span className="mt-1 block text-[9px] leading-none text-muted-foreground">
								{step.meta}
							</span>
						) : null}
					</span>
				</li>
			))}
		</ol>
	);
}

/* ---------------------------------------------------------------------------
 * The signing block — the one deliberate glass card in the portal
 * ------------------------------------------------------------------------- */

function SigningBlock() {
	return (
		<div className="h-full rounded-xl bg-primary/5 p-2.5 ring-1 ring-primary/20 dark:bg-primary/10 dark:ring-primary/30">
			{/* sky-700/400 rather than --primary: the brand #00A6F4 measures 2.71:1
			    on light paper and cannot carry a 9px label. */}
			<span className="block text-[9px] font-semibold uppercase leading-none tracking-[0.14em] text-sky-700 dark:text-sky-400">
				Sign to accept
			</span>

			{/* Type | Draw. Plain spans — an imitation control is never a control. */}
			<div className="mt-2 grid grid-cols-2 gap-0.5 rounded-lg bg-muted p-0.5">
				<span className="rounded-[6px] bg-card py-1 text-center text-[10px] font-medium leading-none text-foreground ring-1 ring-border">
					Type
				</span>
				<span className="py-1 text-center text-[10px] leading-none text-muted-foreground">
					Draw
				</span>
			</div>

			{/* The signature. Caveat on --background inside a bordered box — the
			    portal's typed pad at miniature scale. */}
			<div className="mt-2 flex h-14 items-center overflow-hidden rounded-xl border border-border bg-background px-3">
				<span
					className={cn(
						"esign-write inline-block text-[26px] leading-none text-foreground",
						caveat.className,
					)}
					style={{ "--bp-delay": `${T.signature}s` } as CSSProperties}
				>
					{QUOTE.client}
				</span>
			</div>

			<div className="mt-2.5 flex items-start gap-1.5">
				<Flip
					className="mt-px shrink-0"
					cover="rounded-[4px]"
					delay={T.check}
					from={
						<span className="block size-3 rounded-[4px] border border-border bg-background" />
					}
					to={
						<span className="flex size-3 items-center justify-center rounded-[4px] bg-[var(--cta-solid)]">
							<Check className="size-2 text-white" strokeWidth={3} />
						</span>
					}
				/>
				<span className="text-[10px] leading-tight text-foreground">
					I accept the scope and terms above.
				</span>
			</div>

			{/*
			 * The CTA fires. Both states are the AA-verified solid sky
			 * (--cta-solid, white label 4.95:1) — the brand #00A6F4 cannot carry a
			 * white label. No spinner: a perpetual rotation would keep repainting
			 * forever behind the receipt that covers it a beat later.
			 */}
			<Flip
				className="mt-2.5"
				cover="rounded-lg"
				delay={T.approving}
				from={
					<span className="flex h-7 w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--cta-solid)] text-[11px] font-semibold leading-none text-white">
						<Check className="size-3" />
						Approve quote
					</span>
				}
				to={
					<span className="flex h-7 w-full items-center justify-center rounded-lg bg-[var(--cta-solid)] text-[11px] font-semibold leading-none text-white">
						Approving…
					</span>
				}
			/>
		</div>
	);
}

/**
 * The approved receipt. Carries the signature thumbnail the product renders, so
 * the completed handwriting survives into the terminal state — under reduced
 * motion the receipt is already showing and the pad beneath it is never seen.
 */
function ApprovalReceipt() {
	return (
		<div className="h-full rounded-xl bg-card p-2.5 ring-1 ring-success/25">
			<div className="flex items-center gap-1.5">
				<CheckCircle2 className="size-3.5 text-success" />
				<span className="text-[9px] font-semibold uppercase leading-none tracking-[0.1em] text-success-foreground dark:text-success">
					Approved
				</span>
			</div>
			<p className="mt-2 text-[13px] font-semibold leading-none text-foreground">
				Quote approved
			</p>
			<p className="mt-1.5 text-[10px] leading-none text-foreground">
				Approved by <span className="font-semibold">{QUOTE.client}</span>
			</p>
			<p className="mt-1 text-[9px] leading-none tabular-nums text-muted-foreground">
				{QUOTE.approvedAt}
			</p>
			<div className="mt-2 flex h-11 items-center overflow-hidden rounded-lg border border-border bg-card px-2.5">
				<span
					className={cn(
						"inline-block text-[20px] leading-none text-foreground",
						caveat.className,
					)}
				>
					{QUOTE.client}
				</span>
			</div>
		</div>
	);
}

/** Eyebrow + panel, as a full-height column so both flip states line up. */
function RailPane({
	eyebrow,
	children,
}: {
	eyebrow: string;
	children: ReactNode;
}) {
	return (
		<div className="flex h-full flex-col">
			<span className={EYEBROW}>{eyebrow}</span>
			<div className="mt-2 flex-1">{children}</div>
		</div>
	);
}

/* ---------------------------------------------------------------------------
 * The quote paper — and the stamp
 * ------------------------------------------------------------------------- */

const PAPER_COLS = "grid-cols-[minmax(0,1fr)_1.75rem_3.5rem]";

function QuotePaper() {
	return (
		<div
			className="bp-rise relative rounded-xl border border-border bg-card p-3.5"
			style={{ "--bp-delay": `${T.paper}s` } as CSSProperties}
		>
			<span className="block text-[9px] font-semibold uppercase leading-none tracking-[0.06em] text-muted-foreground">
				Quote {QUOTE.number}
			</span>
			<p className="mt-1.5 max-w-[68%] text-[15px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
				{QUOTE.title}
			</p>

			<div className="mt-3.5">
				{/* The 2px foreground rule under the column heads is the portal's
				    quote paper verbatim — it is what makes this read as a document
				    rather than a table widget. */}
				<div
					className={cn(
						"grid gap-2 border-b-2 border-foreground pb-1.5 text-[8px] font-semibold uppercase leading-none tracking-[0.1em] text-muted-foreground",
						PAPER_COLS,
					)}
				>
					<span>Item</span>
					<span className="text-right">Qty</span>
					<span className="text-right">Total</span>
				</div>
				{LINE_ITEMS.map((line) => (
					<div
						key={line.item}
						className={cn(
							"grid items-baseline gap-2 border-b border-border py-2",
							PAPER_COLS,
						)}
					>
						<span className="text-[10px] font-medium leading-tight text-foreground">
							{line.item}
						</span>
						<span className="text-right text-[10px] leading-none tabular-nums text-muted-foreground">
							{line.qty}
						</span>
						<span className="text-right text-[10px] leading-none tabular-nums text-foreground">
							{line.total}
						</span>
					</div>
				))}
				<div className="mt-2 flex items-baseline justify-between">
					<span className="text-[9px] font-semibold uppercase leading-none tracking-[0.1em] text-muted-foreground">
						Total
					</span>
					<span className="text-[13px] font-semibold leading-none tabular-nums text-foreground">
						{QUOTE.total}
					</span>
				</div>
			</div>

			{/*
			 * THE STAMP — the scene's one annotation device, and the page's single
			 * highest-charm moment. It lands on the document, across the quote's own
			 * rules, the way a real one would. Nothing else is annotated in this
			 * scene: no dimension strings, no leaders, no revision cloud. A real
			 * sheet is one drawing plus one note.
			 */}
			<div className="pointer-events-none absolute right-2.5 top-7">
				<Stamp appear delay={T.stamp} rotate={-8} weathered>
					Approved
				</Stamp>
			</div>
		</div>
	);
}

/* ---------------------------------------------------------------------------
 * The composed page
 * ------------------------------------------------------------------------- */

export function PortalMiniature() {
	return (
		<div className="mx-auto w-full max-w-[40rem]">
			<PortalChrome />
			<HeroCard />

			<div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,0.86fr)_minmax(0,1fr)] sm:items-start">
				{/* Left rail: journey then the signing block, exactly as the portal
				    stacks them inside one sticky card. */}
				<div
					className="bp-rise rounded-xl bg-card p-3 ring-1 ring-foreground/10"
					style={{ "--bp-delay": `${T.journey}s` } as CSSProperties}
				>
					<span className="block text-[11px] font-medium leading-none text-foreground">
						Quote journey
					</span>

					<Flip
						cover="bg-card"
						delay={T.journeyDone}
						from={<JourneyList steps={JOURNEY_PENDING} />}
						to={<JourneyList steps={JOURNEY_ACCEPTED} />}
					/>

					<div
						className="bp-rise mt-3 border-t border-border pt-3"
						style={{ "--bp-delay": `${T.sign}s` } as CSSProperties}
					>
						<Flip
							cover="h-full w-full bg-card"
							delay={T.receipt}
							from={
								<RailPane eyebrow="Next step">
									<SigningBlock />
								</RailPane>
							}
							to={
								<RailPane eyebrow="Outcome">
									<ApprovalReceipt />
								</RailPane>
							}
						/>
					</div>
				</div>

				<QuotePaper />
			</div>
		</div>
	);
}
