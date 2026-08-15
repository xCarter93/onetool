"use client";

import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type CSSProperties,
} from "react";
import Link from "next/link";
import { formatCurrency, roundCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { LP_PRIMARY } from "../marketing-nav";
import { StatusBadge } from "@/components/domain/status-badge";
import { AmbientLayer } from "../ambient";
import { TryItHalftoneScene } from "../section-halftone-scenes";
import { SimCursor, type Identity } from "../sim-cursor";
import { SimToastStack, useSimToasts } from "../sim-toast";
import {
	CardEyebrowRow,
	Container,
	Eyebrow,
	Lede,
	PlusCorners,
	Section,
	SectionHeading,
} from "../primitives";

/* Try it — the page's hands-on moment, and the only place the whole loop runs
 * end to end. The visitor works the LEFT card (the builder they'd use in the
 * truck), the RIGHT card assembles itself into the document their client
 * actually signs, and three clicks walk the job from a draft quote to money in
 * the bank. Two panes, one state machine.
 *
 * Only the three decisions are clicks. The client opening the quote, signing it
 * and paying arrive on timers, because that is the honest shape of the product:
 * you send it and then someone else acts.
 *
 * Motion is CSS-only: each document row is a grid whose single track walks
 * 0fr↔1fr, so heights interpolate without measuring anything. The transition
 * lives in an inline style because it names --lp-ease directly; landing.css's
 * reduced-motion block (`transition: none !important` on .dc-landing *) beats
 * inline non-important styles, so reduced motion renders the swap instantly —
 * no hook needed here.
 *
 * Every figure goes through formatCurrency: catalogue prices as whole dollars
 * (they're price tags), document amounts at exact cents (they're record-level). */

const SERVICES = [
	{ id: "furnace", name: "Furnace replacement", price: 3800 },
	{ id: "filters", name: "Quarterly filter change", price: 120 },
	{ id: "cleanup", name: "Spring cleanup", price: 340 },
	{ id: "gutters", name: "Gutter clearing", price: 180 },
	{ id: "deepclean", name: "Deep clean, 3BR", price: 260 },
	{ id: "irrigation", name: "Irrigation startup", price: 95 },
] as const;

const TAX_RATE = 0.08;
const MIN_QTY = 1;
const MAX_QTY = 9;

/** Pre-selected so the document is never blank on arrival. */
const OPENING_CART: Record<string, number> = { furnace: 1, filters: 1 };

const CLIENT = {
	property: "Whitfield residence",
	signer: "Sean Whitfield",
	email: "sean@whitfield.co",
};

/* ------------------------------------------------------------- the machine */

type Stage = "build" | "sent" | "signed" | "invoiced" | "requested" | "paid";

const STAGE_ORDER: Stage[] = [
	"build",
	"sent",
	"signed",
	"invoiced",
	"requested",
	"paid",
];

/** How long the other side takes. Long enough to read the toast, short enough
 *  that nobody scrolls away mid-story. */
const OPENED_MS = 1400;
const SIGNED_MS = 3000;
const PAID_MS = 3600;

/** The document, per stage. Statuses go through StatusBadge — the app's map,
 *  not a second one invented here. */
const DOC: Record<Stage, { title: string; status: string; label: string }> = {
	build: { title: "Quote #1042", status: "draft", label: "Draft" },
	sent: { title: "Quote #1042", status: "sent", label: "Sent" },
	signed: { title: "Quote #1042", status: "approved", label: "Signed" },
	invoiced: { title: "Invoice #1042", status: "draft", label: "Ready to send" },
	requested: {
		title: "Invoice #1042",
		status: "sent",
		label: "Payment requested",
	},
	paid: { title: "Invoice #1042", status: "paid", label: "Paid" },
};

/** Footer band copy. `settled` picks the green wash: a promise or a done deal,
 *  versus something still in flight. */
const DOC_FOOT: Record<Stage, { line: string; settled: boolean }> = {
	build: {
		line: "Sign & pay from any phone, with no app or login.",
		settled: true,
	},
	sent: {
		line: `Sent to ${CLIENT.email} · signature requested`,
		settled: false,
	},
	signed: {
		line: `Signed by ${CLIENT.signer} · e-signature on file`,
		settled: true,
	},
	invoiced: {
		line: "Due on receipt · same numbers as the approved quote",
		settled: false,
	},
	requested: {
		line: "Payment link sent · card, bank transfer or Apple Pay",
		settled: false,
	},
	paid: {
		line: "Paid by card ending 4242 · on its way to your bank",
		settled: true,
	},
};

/* The cast you stand in for. Colours are landing tokens, and every one of them
 * carries --paper text at AA in both themes. */
const OFFICE: Identity = { name: "Dana · Office", color: "var(--accent-ink)" };
const CREW: Identity = { name: "Mike · Crew B", color: "var(--ink-2)" };
const BUYER: Identity = {
	name: `${CLIENT.signer} · Client`,
	color: "var(--paid)",
};

/** Who the pointer belongs to once the job is moving. */
const STAGE_IDENTITY: Record<Stage, Identity> = {
	build: OFFICE,
	sent: BUYER,
	signed: BUYER,
	invoiced: OFFICE,
	requested: BUYER,
	paid: BUYER,
};

/** Before the first click there is no beat to hand off on, so the office side
 *  rotates on its own — otherwise a visitor who never clicks never sees the
 *  impersonation happen at all. */
const IDLE_CAST: Identity[] = [OFFICE, CREW];
const IDLE_MS = 8000;

const RAIL: { label: string; from: Stage }[] = [
	{ label: "Quote", from: "build" },
	{ label: "Signed", from: "signed" },
	{ label: "Invoice", from: "invoiced" },
	{ label: "Payment sent", from: "requested" },
	{ label: "Paid", from: "paid" },
];

/* ------------------------------------------------------------------ pieces */

/** Amounts swap rather than count. Keyed by value so the fade replays; the
 *  keyframe carries the opacity, so reduced motion lands on solid text. */
const VALUE_FADE: CSSProperties = {
	animation: "lp-fade 260ms var(--lp-ease) both",
};

/** The 0fr↔1fr reveal. ~300ms on the page's one entrance curve. */
const revealStyle = (open: boolean): CSSProperties => ({
	gridTemplateRows: open ? "1fr" : "0fr",
	opacity: open ? 1 : 0,
	transition:
		"grid-template-rows 300ms var(--lp-ease), opacity 300ms var(--lp-ease)",
});

const STEP_BUTTON =
	"grid h-8 w-8 cursor-pointer place-items-center text-[15px] leading-none text-(--ink-2) transition-colors hover:text-(--ink) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent-ink) disabled:cursor-default disabled:text-(--rule-3)";

/** The page's primary treatment, as a real <button> rather than a link. */
const INK_ACTION = cn(
	LP_PRIMARY,
	"h-[46px] px-[22px] text-[15.5px] disabled:cursor-default disabled:opacity-40",
);

function Stepper({
	label,
	value,
	onChange,
}: {
	label: string;
	value: number;
	onChange: (next: number) => void;
}) {
	return (
		<div className="inline-flex items-center rounded-[9px] border border-(--rule-2) bg-(--sheet)">
			<button
				type="button"
				onClick={() => onChange(value - 1)}
				disabled={value <= MIN_QTY}
				aria-label={`Decrease quantity for ${label}`}
				className={STEP_BUTTON}
			>
				<span aria-hidden="true">&minus;</span>
			</button>
			<span className="w-7 text-center text-[14px] font-medium tabular-nums text-(--ink)">
				{value}
			</span>
			<button
				type="button"
				onClick={() => onChange(value + 1)}
				disabled={value >= MAX_QTY}
				aria-label={`Increase quantity for ${label}`}
				className={STEP_BUTTON}
			>
				<span aria-hidden="true">+</span>
			</button>
		</div>
	);
}

/** Where the job has got to. The band sits on the halftone scene, so the rail
 *  rides its own sheet card — on the artwork it read as stray hairlines. */
function LoopRail({ stage }: { stage: Stage }) {
	const at = STAGE_ORDER.indexOf(stage);
	const reached = RAIL.filter((s) => at >= STAGE_ORDER.indexOf(s.from)).length;

	return (
		<div className="flex justify-center">
			<ol
				aria-label="Where this job has got to"
				className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-2.5 gap-y-3 rounded-[14px] border border-(--rule-2) bg-(--sheet) px-[clamp(14px,2vw,22px)] py-[13px] shadow-(--lp-shadow)"
			>
				{RAIL.map((step, i) => {
					const done = at >= STAGE_ORDER.indexOf(step.from);
					const current = i === reached - 1;
					return (
						<li
							key={step.label}
							aria-current={current ? "step" : undefined}
							className="flex items-center gap-2.5"
						>
							<span className="flex items-center gap-[8px] whitespace-nowrap">
								{/* --accent-ink, not --accent: the darker blue is the only one
								    that carries --paper text in both themes. */}
								<span
									aria-hidden="true"
									className={cn(
										"grid size-[22px] flex-none place-items-center rounded-full border text-[11px] font-semibold leading-none tabular-nums transition-colors duration-200",
										current
											? "border-(--accent-ink) bg-(--accent-ink) text-(--paper)"
											: done
												? "border-(--accent) bg-(--accent-wash) text-(--accent-ink)"
												: "border-(--rule-3) text-(--ink-3)",
									)}
								>
									{done && !current ? "\u2713" : i + 1}
								</span>
								<span
									className={cn(
										"text-[12.5px] font-medium tracking-[-0.005em] transition-colors duration-200",
										done ? "text-(--ink)" : "text-(--ink-3)",
									)}
								>
									{step.label}
								</span>
							</span>
							{i < RAIL.length - 1 ? (
								<span
									aria-hidden="true"
									className={cn(
										"hidden h-[2px] w-6 flex-none rounded-full transition-colors duration-200 sm:block",
										done ? "bg-(--accent)" : "bg-(--rule-2)",
									)}
								/>
							) : null}
						</li>
					);
				})}
			</ol>
		</div>
	);
}

/* ----------------------------------------------------------------- section */

type SimEvent = { id: number; label: string; meta: string; at: string };

const clock = () =>
	new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function TryIt() {
	const [cart, setCart] = useState<Record<string, number>>(OPENING_CART);
	const [stage, setStage] = useState<Stage>("build");
	const [events, setEvents] = useState<SimEvent[]>([]);
	const [idle, setIdle] = useState(0);
	const { toasts, push, clear } = useSimToasts();

	const timers = useRef<number[]>([]);
	const eventSeq = useRef(0);

	const after = useCallback((ms: number, run: () => void) => {
		timers.current.push(window.setTimeout(run, ms));
	}, []);

	const stopTimers = useCallback(() => {
		timers.current.forEach(clearTimeout);
		timers.current = [];
	}, []);

	useEffect(() => stopTimers, [stopTimers]);

	// Nothing has happened yet, so the cast rotates on its own.
	useEffect(() => {
		if (stage !== "build") return;
		const tick = window.setInterval(() => setIdle((n) => n + 1), IDLE_MS);
		return () => clearInterval(tick);
	}, [stage]);

	const log = useCallback((label: string, meta: string) => {
		eventSeq.current += 1;
		setEvents((prev) => [
			...prev,
			{ id: eventSeq.current, label, meta, at: clock() },
		]);
	}, []);

	const locked = stage !== "build";

	const toggle = (id: string) =>
		setCart((prev) => {
			const next = { ...prev };
			if (next[id]) delete next[id];
			else next[id] = 1;
			return next;
		});

	const setQty = (id: string, raw: number) =>
		setCart((prev) => {
			if (!prev[id]) return prev;
			const clamped = Math.min(MAX_QTY, Math.max(MIN_QTY, raw));
			if (clamped === prev[id]) return prev;
			return { ...prev, [id]: clamped };
		});

	const chosen = SERVICES.filter((s) => cart[s.id]);
	const subtotal = roundCents(
		chosen.reduce((sum, s) => sum + s.price * (cart[s.id] ?? 0), 0),
	);
	const tax = roundCents(subtotal * TAX_RATE);
	const total = roundCents(subtotal + tax);
	const empty = chosen.length === 0;

	const sendQuote = () => {
		setStage("sent");
		log("Quote sent", CLIENT.email);
		push(
			"Quote #1042 sent",
			`${CLIENT.property} gets it by email and text, for ${formatCurrency(total)}.`,
		);
		after(OPENED_MS, () => log("Opened by the client", "on a phone"));
		after(SIGNED_MS, () => {
			setStage("signed");
			log("Signed", CLIENT.signer);
			push(
				"Quote approved",
				`${CLIENT.signer} signed it. The work is yours.`,
				"paid",
			);
		});
	};

	const convert = () => {
		setStage("invoiced");
		log("Invoice created", "from the approved quote");
		push(
			"Quote converted",
			"Invoice #1042 carries the same line items and the same totals.",
		);
	};

	const requestPayment = () => {
		setStage("requested");
		log("Payment requested", "card link sent");
		push("Payment request sent", `${CLIENT.signer} can pay from the link.`);
		after(PAID_MS, () => {
			setStage("paid");
			log("Paid", "Visa ending 4242");
			push(
				"Payment received",
				`${formatCurrency(total)} is on its way to your bank.`,
				"paid",
			);
		});
	};

	const restart = () => {
		stopTimers();
		clear();
		setStage("build");
		setEvents([]);
		setCart(OPENING_CART);
	};

	const identity =
		stage === "build"
			? IDLE_CAST[idle % IDLE_CAST.length]
			: STAGE_IDENTITY[stage];

	const doc = DOC[stage];
	const foot = DOC_FOOT[stage];

	// The section owns no padding and no column: the cursor surface has to be the
	// whole band, or the collaborator cursor snaps back to the OS one the moment
	// the pointer leaves the 1560px column. The inner Container puts the column
	// and the section rhythm back. overflow-hidden is the fullBleed ambient's
	// clipping ancestor.
	return (
		<Section
			id="try-it"
			pad="none"
			className="overflow-hidden"
			containerClassName="max-w-none px-0"
		>
			{/* Halftone scene: the property the simulated quote is written against —
			    a mailbox and a picket run on the left, the house and its blank yard
			    sign on the right. */}
			<AmbientLayer fullBleed opacity={0.7}>
				<TryItHalftoneScene />
			</AmbientLayer>

			{/* The ambient is absolutely positioned, so the content needs its own
			    stacking context to stay above it — SimCursor's root supplies it. */}
			<SimCursor identity={identity} className="relative">
				<Container className="py-[clamp(64px,8vw,120px)]">
					<Eyebrow>Try it yourself</Eyebrow>
					<SectionHeading>Run the whole job in 30 seconds.</SectionHeading>
					<Lede className="max-w-[46rem]">
						Pick a couple of line items, then send it. You play every part: the
						office, the crew and the client. The money lands without a number
						retyped.
					</Lede>

					<div className="mt-[clamp(40px,6vw,80px)] grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] items-start gap-[clamp(20px,2.6vw,36px)]">
						{/* ------------------------------------------------------ the builder */}
						<div>
							{/* overflow-hidden clips the hairline rows to the card radius, so the
						    focus indicator has to draw inside: outline, not ring. */}
							<div className="lp-lift overflow-hidden rounded-2xl border border-(--rule-2) bg-(--sheet)">
								<CardEyebrowRow
									label="Line items"
									index={locked ? "Locked · sent" : `${chosen.length} selected`}
								/>
								<ul>
									{SERVICES.map((s) => {
										const qty = cart[s.id] ?? 0;
										const on = qty > 0;
										return (
											<li
												key={s.id}
												className="border-t border-(--rule) first:border-t-0"
											>
												<div
													className={cn(
														"flex items-center gap-2 pr-3 transition-colors",
														on && "bg-(--accent-wash)",
														locked && !on && "opacity-55",
													)}
												>
													<button
														type="button"
														aria-pressed={on}
														disabled={locked}
														onClick={() => toggle(s.id)}
														className="flex min-h-[44px] flex-1 cursor-pointer items-center gap-3 py-2.5 pl-4 pr-1 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent-ink) disabled:cursor-default"
													>
														<span
															aria-hidden="true"
															className={cn(
																"grid h-4 w-4 flex-none place-items-center rounded-[4px] border text-[10px] font-bold leading-none transition-colors",
																on
																	? "border-(--accent) bg-(--sheet) text-(--accent-ink)"
																	: "border-(--rule-2) text-transparent",
															)}
														>
															&#10003;
														</span>
														<span className="min-w-0">
															<span
																className={cn(
																	"block text-[15px] leading-[1.35] tracking-[-0.01em]",
																	on
																		? "font-medium text-(--ink)"
																		: "text-(--ink-2)",
																)}
															>
																{s.name}
															</span>
															<span className="mt-[3px] block font-mono text-[11.5px] tabular-nums text-(--ink-3)">
																{formatCurrency(s.price, { whole: true })}
															</span>
														</span>
													</button>

													{/* Fixed slot: the stepper appears without shoving the row. */}
													<div className="flex w-[100px] flex-none justify-end">
														{on && !locked ? (
															<Stepper
																label={s.name}
																value={qty}
																onChange={(next) => setQty(s.id, next)}
															/>
														) : null}
													</div>
												</div>
											</li>
										);
									})}
								</ul>

								{/* Activity, in the same card the work was done in. */}
								<div
									className="grid"
									style={revealStyle(events.length > 0)}
									aria-hidden={events.length === 0}
								>
									<div className="overflow-hidden">
										<div className="border-t border-(--rule) px-[22px] py-3">
											<p className="font-mono text-[11px] uppercase tracking-[0.1em] text-(--ink-3)">
												Activity
											</p>
											<ol className="mt-1">
												{events.map((event) => (
													<li
														key={event.id}
														className="lp-fade flex items-baseline justify-between gap-3 border-t border-(--rule) py-2 first:border-t-0"
													>
														<span className="text-[13.5px] leading-[1.45] text-(--ink-2)">
															<span className="font-medium text-(--ink)">
																{event.label}
															</span>{" "}
															&middot; {event.meta}
														</span>
														<span className="flex-none font-mono text-[11.5px] tabular-nums text-(--ink-3)">
															{event.at}
														</span>
													</li>
												))}
											</ol>
										</div>
									</div>
								</div>
							</div>

							{/* --------------------------------------------------- the one action */}
							<div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
								{stage === "build" ? (
									<button
										type="button"
										onClick={sendQuote}
										disabled={empty}
										className={INK_ACTION}
									>
										Send to client
										<span aria-hidden="true" className="text-[15px]">
											→
										</span>
									</button>
								) : null}

								{stage === "sent" || stage === "requested" ? (
									<p
										role="status"
										className="inline-flex h-[46px] items-center gap-[10px] rounded-[11px] border border-(--rule-2) bg-(--sheet) px-[18px] text-[15px] text-(--ink-2)"
									>
										<span
											aria-hidden="true"
											className="h-[7px] w-[7px] animate-pulse rounded-full bg-(--accent)"
										/>
										{stage === "sent"
											? "Waiting on the client…"
											: "Waiting on the payment…"}
									</p>
								) : null}

								{stage === "signed" ? (
									<button
										type="button"
										onClick={convert}
										className={INK_ACTION}
									>
										Convert to invoice
										<span aria-hidden="true" className="text-[15px]">
											→
										</span>
									</button>
								) : null}

								{stage === "invoiced" ? (
									<button
										type="button"
										onClick={requestPayment}
										className={INK_ACTION}
									>
										Send payment request
										<span aria-hidden="true" className="text-[15px]">
											→
										</span>
									</button>
								) : null}

								{stage === "paid" ? (
									<Link href="/sign-up" className={INK_ACTION}>
										Start free
										<span aria-hidden="true" className="text-[15px]">
											→
										</span>
									</Link>
								) : null}

								{locked ? (
									<button
										type="button"
										onClick={restart}
										className="inline-flex min-h-[44px] cursor-pointer items-center rounded-sm text-[13.5px] text-(--ink-3) underline decoration-(--rule-3) underline-offset-4 transition-colors hover:text-(--ink-2) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)"
									>
										Start over
									</button>
								) : (
									<p className="text-[13px] leading-[1.5] text-(--ink-3)">
										{empty
											? "Pick a line item to send."
											: "Tap to add or remove. The document keeps up."}
									</p>
								)}
							</div>
						</div>

						{/* --------------------------------------------- what the client sees */}
						<div className="relative rounded-2xl border border-(--rule-2) bg-(--sheet)">
							<PlusCorners />

							{/* The one signature moment on this section: the stamp the whole
						    loop is aiming at. */}
							{stage === "paid" ? (
								<span
									aria-hidden="true"
									className="lp-fade pointer-events-none absolute right-[clamp(16px,4vw,34px)] top-[38%] z-[3] -rotate-[9deg] rounded-[8px] border-2 border-(--paid) px-[14px] py-[6px] font-mono text-[clamp(20px,3vw,28px)] font-bold uppercase tracking-[0.16em] text-(--paid) opacity-90"
								>
									Paid
								</span>
							) : null}

							<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 px-5 pb-4 pt-[18px]">
								<p
									key={doc.title}
									style={VALUE_FADE}
									className="text-[17px] font-semibold tracking-[-0.02em]"
								>
									{doc.title}
								</p>
								<div className="flex items-baseline gap-3">
									<p className="font-mono text-[11.5px] text-(--ink-3)">
										{CLIENT.property}
									</p>
									<StatusBadge status={doc.status}>{doc.label}</StatusBadge>
								</div>
							</div>

							<ul>
								{SERVICES.map((s) => {
									const qty = cart[s.id] ?? 0;
									const on = qty > 0;
									const amount = s.price * Math.max(qty, MIN_QTY);
									return (
										<li
											key={s.id}
											className="grid"
											style={revealStyle(on)}
											aria-hidden={!on}
										>
											<div className="overflow-hidden">
												<div className="flex items-baseline justify-between gap-4 border-t border-(--rule) px-5 py-[11px]">
													<span className="text-[14.5px] leading-[1.4] text-(--ink-2)">
														{s.name}
														{qty > 1 ? (
															<span className="ml-[6px] font-mono text-[12px] tabular-nums text-(--ink-3)">
																&times;{qty}
															</span>
														) : null}
													</span>
													<span
														key={amount}
														style={VALUE_FADE}
														className="flex-none text-[14.5px] font-medium tabular-nums text-(--ink)"
													>
														{formatCurrency(amount)}
													</span>
												</div>
											</div>
										</li>
									);
								})}

								{/* A quote with nothing on it still reads as a document, not a bug. */}
								<li
									className="grid"
									style={revealStyle(empty)}
									aria-hidden={!empty}
								>
									<div className="overflow-hidden">
										<p className="border-t border-(--rule) px-5 py-[11px] font-mono text-[12px] text-(--ink-3)">
											No line items yet. Pick one on the left.
										</p>
									</div>
								</li>
							</ul>

							<div className="border-t border-(--rule) px-5 py-4">
								<div className="flex items-baseline justify-between gap-4">
									<span className="text-[13.5px] text-(--ink-2)">Subtotal</span>
									<span
										key={`sub-${subtotal}`}
										style={VALUE_FADE}
										className="text-[14px] tabular-nums text-(--ink-2)"
									>
										{formatCurrency(subtotal)}
									</span>
								</div>
								<div className="mt-2 flex items-baseline justify-between gap-4">
									<span className="text-[13.5px] text-(--ink-2)">Tax (8%)</span>
									<span
										key={`tax-${tax}`}
										style={VALUE_FADE}
										className="text-[14px] tabular-nums text-(--ink-2)"
									>
										{formatCurrency(tax)}
									</span>
								</div>
								{/* Stable live region: keying the wrapper would stop it announcing,
							    so only the inner value re-mounts for the fade. */}
								<div
									role="status"
									className="mt-3 flex items-baseline justify-between gap-4 border-t border-(--rule) pt-3"
								>
									<span className="text-[15px] font-semibold">
										{stage === "paid" ? "Paid" : "Total"}
									</span>
									<span className="text-[19px] font-semibold tabular-nums tracking-[-0.02em]">
										<span
											key={`total-${total}`}
											style={VALUE_FADE}
											className="block"
										>
											{formatCurrency(total)}
										</span>
									</span>
								</div>
							</div>

							<div
								className={cn(
									"flex items-center gap-2 rounded-b-[15px] border-t border-(--rule) px-5 py-3",
									foot.settled ? "bg-(--paid-wash)" : "bg-(--accent-wash)",
								)}
							>
								<span
									aria-hidden="true"
									className={cn(
										"text-[13px] font-bold",
										foot.settled ? "text-(--paid)" : "text-(--accent-ink)",
									)}
								>
									&#10003;
								</span>
								<p
									key={foot.line}
									style={VALUE_FADE}
									className="text-[13.5px] leading-[1.45] text-(--ink-2)"
								>
									{foot.line}
								</p>
							</div>
						</div>
					</div>

					<div className="mt-[clamp(28px,3vw,44px)]">
						<LoopRail stage={stage} />
					</div>

					{/* Dropped once the loop has run: the paid card already carries the
				    same offer, two lines further up. */}
					{stage === "paid" ? null : (
						<p className="mt-7 text-center text-[15px] text-(--ink-2)">
							Want the real thing?{" "}
							<Link
								href="/sign-up"
								className="rounded-sm font-semibold text-(--accent-ink) underline decoration-(--rule-3) underline-offset-4 transition-colors hover:decoration-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)"
							>
								Start free <span aria-hidden="true">→</span>
							</Link>
						</p>
					)}
				</Container>
			</SimCursor>

			{/* Outside the cursor surface on purpose: the stack is fixed to the
			    viewport, not to this band. */}
			<SimToastStack toasts={toasts} />
		</Section>
	);
}
