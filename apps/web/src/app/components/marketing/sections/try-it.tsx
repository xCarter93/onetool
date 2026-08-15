"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { useMotionValue } from "motion/react";
import { formatCurrency, roundCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ThinkingDots } from "@/components/react-bits/thinking-dots";
import UserCursor from "@/components/react-bits/user-cursor";
import { AmbientLayer } from "../ambient";
import {
	CardEyebrowRow,
	DimensionLine,
	Eyebrow,
	Lede,
	PlusCorners,
	Section,
	SectionHeading,
} from "../primitives";

/* Try it — the page's hands-on moment. The visitor works the LEFT card (the
 * builder they'd use in the truck) and the RIGHT card assembles itself into the
 * document their client actually signs. Two panes, one state object.
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

/** Amounts swap rather than count. Keyed by value so the fade replays; the
 *  keyframe carries the opacity, so reduced motion lands on solid text. */
const VALUE_FADE: CSSProperties = { animation: "lp-fade 260ms var(--lp-ease) both" };

/** The 0fr↔1fr reveal. ~300ms on the page's one entrance curve. */
const revealStyle = (open: boolean): CSSProperties => ({
	gridTemplateRows: open ? "1fr" : "0fr",
	opacity: open ? 1 : 0,
	transition: "grid-template-rows 300ms var(--lp-ease), opacity 300ms var(--lp-ease)",
});

const STEP_BUTTON =
	"grid h-8 w-8 cursor-pointer place-items-center text-[15px] leading-none text-(--ink-2) transition-colors hover:text-(--ink) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent-ink) disabled:cursor-default disabled:text-(--rule-3)";

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

/* ------------------------------------------------------------ the crew layer */

/* Two teammates parked on the panes — the "your crew is in here too" beat.
 * They are static on purpose: a drifting fake cursor competes with the real one
 * for attention and ends up sitting on the controls. Each stays inside its own
 * card, over whitespace, and the layer is pointer-events-none so the builder
 * keeps working. UserCursor's own hideOnTouch drops them on coarse pointers,
 * where a fake cursor is pure noise. */

type CrewGhost = {
	name: string;
	color: string;
	/** Percentage offsets inside the card the cursor is anchored to. */
	left: string;
	top: string;
};

const MIKE: CrewGhost = {
	name: "Mike · Crew B",
	// Ink-adjacent warm grey: present, never competing with the data.
	color: "#8a8782",
	left: "54%",
	top: "76%",
};

const DANA: CrewGhost = {
	name: "Dana · Office",
	// The page's one accent, so the two read as different people.
	color: "rgb(0,166,244)",
	left: "44%",
	top: "58%",
};

/** A zero-size anchor keeps the position a plain percentage of the card while
 *  UserCursor's controlled MotionValues rest at the origin — they start where
 *  they end, so the spring never plays an entry streak. */
function StaticCursor({ ghost }: { ghost: CrewGhost }) {
	const x = useMotionValue(0);
	const y = useMotionValue(0);

	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute z-20 h-0 w-0"
			style={{ left: ghost.left, top: ghost.top }}
		>
			<UserCursor
				name={ghost.name}
				color={ghost.color}
				size={24}
				showLabel
				trigger="always"
				hideOnTouch
				positionX={x}
				positionY={y}
			/>
		</div>
	);
}

export function TryIt() {
	const [cart, setCart] = useState<Record<string, number>>(OPENING_CART);

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
	const subtotal = roundCents(chosen.reduce((sum, s) => sum + s.price * (cart[s.id] ?? 0), 0));
	const tax = roundCents(subtotal * TAX_RATE);
	const total = roundCents(subtotal + tax);
	const empty = chosen.length === 0;

	// overflow-hidden is the fullBleed ambient's clipping ancestor.
	return (
		<Section id="try-it" className="overflow-hidden">
			{/* Paper-toned dot field across the whole band — texture, not weather. */}
			<AmbientLayer fullBleed opacity={0.1}>
				<ThinkingDots
					className="h-full w-full"
					color="#8a8782"
					accentColor="#8a8782"
					backgroundColor="transparent"
					glow={0}
					cursorInteraction={false}
				/>
			</AmbientLayer>

			{/* The ambient is absolutely positioned, so the content needs its own
			    stacking context to stay above it. */}
			<div className="relative">
				<Eyebrow>Try it yourself</Eyebrow>
				<SectionHeading>Build a quote in 20 seconds.</SectionHeading>
				<Lede className="max-w-[46rem]">
					Pick a couple of line items. This is the same motion you&rsquo;d do in the
					truck, and the page on the right is what your client gets.
				</Lede>

				<div className="mt-[clamp(40px,6vw,80px)] grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] items-start gap-[clamp(20px,2.6vw,36px)]">
					{/* ------------------------------------------------------ the builder */}
					<div className="relative">
						<StaticCursor ghost={MIKE} />

						{/* overflow-hidden clips the hairline rows to the card radius, so the
					    focus indicator has to draw inside: outline, not ring. */}
						<div className="lp-lift overflow-hidden rounded-2xl border border-(--rule-2) bg-(--sheet)">
							<CardEyebrowRow label="Line items" index={`${chosen.length} selected`} />
							<ul>
								{SERVICES.map((s) => {
									const qty = cart[s.id] ?? 0;
									const on = qty > 0;
									return (
										<li key={s.id} className="border-t border-(--rule) first:border-t-0">
											<div
												className={cn(
													"flex items-center gap-2 pr-3 transition-colors",
													on && "bg-(--accent-wash)",
												)}
											>
												<button
													type="button"
													aria-pressed={on}
													onClick={() => toggle(s.id)}
													className="flex min-h-[44px] flex-1 cursor-pointer items-center gap-3 py-2.5 pl-4 pr-1 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent-ink)"
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
																on ? "font-medium text-(--ink)" : "text-(--ink-2)",
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
													{on ? (
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
						</div>

						<p className="mt-3 text-[13px] leading-[1.5] text-(--ink-3)">
							Tap to add or remove. The document keeps up.
						</p>
					</div>

					{/* --------------------------------------------- what the client sees */}
					<div className="relative rounded-2xl border border-(--rule-2) bg-(--sheet)">
						<PlusCorners />
						<StaticCursor ghost={DANA} />

						<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pb-4 pt-[18px]">
							<p className="text-[17px] font-semibold tracking-[-0.02em]">Quote #1042</p>
							<p className="font-mono text-[11.5px] text-(--ink-3)">
								Whitfield residence &middot; today
							</p>
						</div>

						<ul>
							{SERVICES.map((s) => {
								const qty = cart[s.id] ?? 0;
								const on = qty > 0;
								const amount = s.price * Math.max(qty, MIN_QTY);
								return (
									<li key={s.id} className="grid" style={revealStyle(on)} aria-hidden={!on}>
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
							<li className="grid" style={revealStyle(empty)} aria-hidden={!empty}>
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
								<span className="text-[15px] font-semibold">Total</span>
								<span className="text-[19px] font-semibold tabular-nums tracking-[-0.02em]">
									<span key={`total-${total}`} style={VALUE_FADE} className="block">
										{formatCurrency(total)}
									</span>
								</span>
							</div>
						</div>

						<div className="flex items-center gap-2 rounded-b-[15px] border-t border-(--rule) bg-(--paid-wash) px-5 py-3">
							<span aria-hidden="true" className="text-[13px] font-bold text-(--paid)">
								&#10003;
							</span>
							<p className="text-[13.5px] leading-[1.45] text-(--ink-2)">
								Sign &amp; pay from any phone, with no app or login.
							</p>
						</div>
					</div>
				</div>

				<DimensionLine
					className="mt-[clamp(28px,3vw,44px)]"
					label="quote → signature → invoice · same numbers, never retyped"
				/>

				<p className="mt-7 text-center text-[15px] text-(--ink-2)">
					Want the real thing?{" "}
					<Link
						href="/sign-up"
						className="rounded-sm font-semibold text-(--accent-ink) underline decoration-(--rule-3) underline-offset-4 transition-colors hover:decoration-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)"
					>
						Start free <span aria-hidden="true">→</span>
					</Link>
				</p>
			</div>
		</Section>
	);
}
