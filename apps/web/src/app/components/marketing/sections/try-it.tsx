"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Clock, Pause, Play, RotateCcw } from "lucide-react";
import { StatusBadge } from "@/components/domain/status-badge";
import { Iphone } from "@/components/ui/iphone";
import { formatCurrency, roundCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { LP_SECONDARY } from "../buttons";
import { useMotionPaused } from "../motion-pause";
import { JOB } from "../hero/job";
import { Scaled } from "../hero/scaled";
import { usePrefersReducedMotion } from "../use-reduced-motion";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ClientPhone, PRESSABLE, SCREEN_H, SCREEN_W, type PhoneScreen } from "./try-it-phone";
import { DemoCursor } from "./demo-cursor";

const ITEMS = JOB.lines;

// Every line is in from the start; the Win chapter already shows the quote being built.
const OPENING: Record<string, boolean> = Object.fromEntries(ITEMS.map((it) => [it.id, true]));

const TAX_RATE = JOB.taxRate;

function totals(picked: Record<string, boolean>) {
	const subtotal = ITEMS.reduce((sum, it) => sum + (picked[it.id] ? it.price : 0), 0);
	const tax = roundCents(subtotal * TAX_RATE);
	return { subtotal, tax, total: roundCents(subtotal + tax) };
}

const FINAL_TOTAL = totals(OPENING).total;

type Step = {
	label: string;
	title: string;
	status: string;
	badge: string;
	action: string | null;
	hint?: string;
	event?: { title: string; body: string };
};

const STEPS: Step[] = [
	{
		label: "Quote",
		title: "Quote Q-001042",
		status: "draft",
		badge: "Draft",
		action: "Send quote",
		hint: "Dana sends Rachel the fall cleanup quote.",
	},
	{
		label: "Sent",
		title: "Quote Q-001042",
		status: "sent",
		badge: "Sent",
		action: "Waiting for signature",
		hint: "It’s on Rachel’s phone now. Watch the client.",
	},
	{
		label: "Signed",
		title: "Quote Q-001042",
		status: "approved",
		badge: "Signed",
		action: "Convert to invoice",
		event: { title: "Rachel Whitfield signed Quote Q-001042", body: "E-signature saved to the quote." },
	},
	{
		label: "Invoice",
		title: "Invoice INV-002094",
		status: "sent",
		badge: "Payment requested",
		action: "Waiting for payment",
		hint: "The pay link is on her phone.",
	},
	{
		label: "Paid",
		title: "Invoice INV-002094",
		status: "paid",
		badge: "Paid",
		action: null,
		event: {
			title: `Paid ${formatCurrency(FINAL_TOTAL)} by card`,
			body: "Payment recorded on Invoice INV-002094.",
		},
	},
];

const SCREENS: PhoneScreen[] = ["home", "quote", "approved", "invoice", "paid"];

const PHONE_SAYS = [
	"Rachel’s phone shows her client portal with nothing new yet.",
	"Quote Q-001042 is open on Rachel’s phone, ready to approve.",
	"Rachel approved and signed Quote Q-001042.",
	"Invoice INV-002094 is open on Rachel’s phone with a Pay button.",
	"Invoice INV-002094 shows paid in full on Rachel’s phone.",
];

const SENT = 1;
const SIGNED = 2;
const INVOICED = 3;
const PAID = 4;

const IDENTITY = {
	office: { name: "Dana · Office", color: "var(--accent-ink)" },
	client: { name: "Rachel · Client", color: "var(--paid)" },
} as const;

type Cue = { at: number; run: () => void };

type Beat = {
	target: string;
	who: keyof typeof IDENTITY;
	step: number;
	hold?: number;
};

const SIGN_MS = 900;

/** The whole job, one press per beat. */
const BEATS: Beat[] = [
	{ target: "action", who: "office", step: SENT },
	{ target: "approve", who: "client", step: SIGNED, hold: SIGN_MS },
	{ target: "action", who: "office", step: INVOICED },
	{ target: "pay", who: "client", step: PAID },
];

const LEAD_MS = 400;
const GLIDE_MS = 700;
const SETTLE_MS = 350;
const PRESS_MS = 160;
const GAP_MS = 500;
const SCRIPTED_MS = 2400;
// Where the arrow's tip sits inside DemoCursor's 26px, -14° glyph.
const TIP = { x: 4, y: 6 };

export function ClientDemo() {
	const [step, setStep] = useState(0);
	const [pressed, setPressed] = useState<string | null>(null);
	const [who, setWho] = useState<keyof typeof IDENTITY>("office");
	const [running, setRunning] = useState(false);
	const reduced = usePrefersReducedMotion();
	// Below lg the office card sits under the phone, so a cursor would press targets off screen; the states advance on timers instead.
	const narrow = useMediaQuery("(max-width: 1023px)") ?? false;
	const scripted = reduced || narrow;
	const paused = useMotionPaused();
	// Scrolling the phone off screen holds the script where it is, so the signature and payment are never missed.
	const [offscreen, setOffscreen] = useState(false);
	const [held, setHeld] = useState(false);

	const surfaceRef = useRef<HTMLDivElement>(null);
	const phoneRef = useRef<HTMLDivElement>(null);
	const cursorRef = useRef<HTMLDivElement>(null);
	const [cursor, setCursor] = useState({ x: 0, y: 0 });
	const timers = useRef<number[]>([]);
	const [played, setPlayed] = useState(false);
	const cues = useRef<Cue[]>([]);
	const progress = useRef({ next: 0, elapsed: 0, origin: 0 });

	const stop = useCallback(() => {
		timers.current.forEach(clearTimeout);
		timers.current = [];
	}, []);

	useEffect(() => stop, [stop]);

	const hold = useCallback(() => {
		progress.current.elapsed = performance.now() - progress.current.origin;
		timers.current.forEach(clearTimeout);
		timers.current = [];
		// The glide is a CSS transition; this pauses it mid-flight.
		cursorRef.current?.getAnimations({ subtree: true }).forEach((a) => a.pause());
	}, []);

	const resume = useCallback(() => {
		const p = progress.current;
		const from = p.next;
		p.origin = performance.now() - p.elapsed;
		cursorRef.current?.getAnimations({ subtree: true }).forEach((a) => a.play());
		cues.current.slice(from).forEach((cue, i) => {
			const run = () => {
				p.next = from + i + 1;
				cue.run();
			};
			timers.current.push(window.setTimeout(run, Math.max(0, cue.at - p.elapsed)));
		});
	}, []);

	useEffect(() => {
		const node = phoneRef.current;
		if (!node) return;
		const observer = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting), { threshold: 0.1 });
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (!running || paused || offscreen || held) return;
		resume();
		return hold;
	}, [running, paused, offscreen, held, resume, hold]);

	const play = useCallback(() => {
		stop();
		setHeld(false);
		setStep(0);
		setPressed(null);
		setWho("office");

		const script: Cue[] = [];
		const after = (at: number, run: () => void) => {
			script.push({ at, run });
		};
		const start = () => {
			setPlayed(true);
			cues.current = script;
			progress.current = { next: 0, elapsed: 0, origin: 0 };
			setRunning(true);
		};
		const act = (beat: Beat) => setStep(beat.step);

		if (scripted) {
			BEATS.forEach((beat, i) => after((i + 1) * SCRIPTED_MS, () => act(beat)));
			after(BEATS.length * SCRIPTED_MS, () => setRunning(false));
			start();
			return;
		}

		const surface = surfaceRef.current;
		if (surface) {
			// Batched with the mount below, so the cursor starts here instead of gliding in.
			setCursor({ x: surface.offsetWidth * 0.3, y: surface.offsetHeight * 0.92 });
		}
		const glideTo = (target: string) => {
			const box = surfaceRef.current?.getBoundingClientRect();
			const el = surfaceRef.current?.querySelector(`[data-demo="${target}"]`);
			if (!box || !el) return;
			const r = el.getBoundingClientRect();
			setCursor({ x: r.left - box.left + r.width / 2 - TIP.x, y: r.top - box.top + r.height / 2 - TIP.y });
		};

		let t = LEAD_MS;
		for (const beat of BEATS) {
			const press = t + GLIDE_MS + SETTLE_MS;
			after(t, () => {
				setWho(beat.who);
				glideTo(beat.target);
			});
			after(press, () => setPressed(beat.target));
			after(press + PRESS_MS, () => {
				setPressed(null);
				act(beat);
			});
			t = press + PRESS_MS + GAP_MS + (beat.hold ?? 0);
		}
		after(t, () => setRunning(false));
		start();
	}, [stop, scripted]);

	// Re-observes when `play` changes (reduced motion resolves after hydration); `started` keeps it once.
	const started = useRef(false);
	useEffect(() => {
		const node = phoneRef.current;
		if (!node || started.current) return;
		// Reduced motion never autoplays; the render rests on the paid state until Replay.
		if (reduced) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				// The phone can outgrow a short viewport, so judge visibility against the smaller of the two.
				const needed = Math.min(entry.boundingClientRect.height, window.innerHeight) * 0.7;
				if (!entry.isIntersecting || entry.intersectionRect.height < needed) return;
				observer.disconnect();
				started.current = true;
				play();
			},
			{ threshold: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1] },
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, [play, reduced]);

	const picked = OPENING;
	const sums = totals(picked);
	const { tax, total } = sums;
	const lines = ITEMS.filter((it) => picked[it.id]);
	// Reduced motion rests on the paid state until Replay is pressed.
	const shown = reduced && !running && !played ? PAID : step;
	const waiting = shown === SENT || shown === INVOICED;
	const current = STEPS[shown];
	const identity = IDENTITY[who];

	return (
		<div className="lp-chapter-visual">
			<div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
				<h4 className="lp-h3 text-(--ink)">Rachel’s phone, from quote to paid.</h4>
				<p className="text-sm text-(--ink-3)">A scripted walkthrough. Replay runs it again.</p>
			</div>

			<div
				ref={surfaceRef}
				className="relative mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
			>
				{/* Below lg the card dissolves so its strip, title and event line sit above the phone. */}
				<div className="grid min-w-0 overflow-hidden rounded-2xl border border-(--rule-2) bg-(--sheet) max-lg:contents">
					<ol aria-label="Job progress" className="flex border-b border-(--rule) max-lg:order-1">
						{STEPS.map((s, i) => {
							const done = i < shown || shown === PAID;
							const active = i === shown;
							return (
								<li
									key={s.label}
									aria-current={active ? "step" : undefined}
									className={cn(
										"flex flex-1 items-center gap-2 border-r border-(--rule) px-3.5 py-3 last:border-r-0 max-sm:justify-center max-sm:px-2",
										active && "bg-(--accent-wash)",
									)}
								>
									<span
										aria-hidden="true"
										className={cn(
											"grid size-5 flex-none place-items-center rounded-full text-2xs font-bold leading-none transition-colors duration-200",
											done
												? "bg-(--paid) text-(--paper)"
												: active
													? "bg-(--accent-ink) text-(--paper)"
													: "bg-(--rule) text-(--ink-2)",
										)}
									>
										{done ? <Check aria-hidden="true" className="size-3" strokeWidth={3} /> : i + 1}
									</span>
									<span
										className={cn(
											"whitespace-nowrap text-sm font-medium",
											!active && "max-sm:sr-only",
											active ? "text-(--accent-ink)" : done ? "text-(--ink)" : "text-(--ink-3)",
										)}
									>
										{s.label}
										{done ? <span className="sr-only"> (done)</span> : null}
									</span>
								</li>
							);
						})}
					</ol>

					<div className="flex items-center justify-between gap-3 border-b border-(--rule) px-[22px] py-[18px] max-lg:order-2 max-md:hidden">
						<div className="min-w-0">
							<p className="text-lg font-semibold tracking-[-0.02em] text-(--ink)">
								{current.title}
							</p>
							<p className="text-sm text-(--ink-3)">
								Fall property cleanup · Whitfield Property Group
							</p>
						</div>
						<StatusBadge status={current.status}>{current.badge}</StatusBadge>
					</div>

					{/* Read-only: the script drives the ticks, so visitor input would fight it. */}
					{/* Phones already show the line items on the portal screen above. */}
					<fieldset disabled className="px-[22px] py-2 max-lg:hidden">
						<legend className="sr-only">Line items</legend>
						{ITEMS.map((it) => {
							const on = !!picked[it.id];
							return (
								<label
									key={it.id}
									className="flex min-h-[44px] items-center gap-3 border-b border-(--rule) py-3"
								>
									<input type="checkbox" checked={on} readOnly className="sr-only" />
									<span
										aria-hidden="true"
										data-demo={it.id}
										data-pressed={pressed === it.id}
										className={cn(
											"grid size-[18px] flex-none place-items-center rounded-sm border-[1.5px] text-xs leading-none text-(--paper) transition-[color,background-color,border-color,scale] duration-150 data-[pressed=true]:scale-[0.96]",
											on ? "border-(--accent-ink) bg-(--accent-ink)" : "border-(--rule-3)",
										)}
									>
										{on ? <Check aria-hidden="true" className="size-3" strokeWidth={3} /> : null}
									</span>
									<span
										className={cn(
											"flex-1 text-base",
											shown !== 0 && !on ? "text-(--ink-2)" : "text-(--ink)",
										)}
									>
										{it.name}
									</span>
									<span className="text-base tabular-nums text-(--ink-2)">
										{formatCurrency(it.price)}
									</span>
								</label>
							);
						})}
						<div className="flex justify-between pt-3 text-sm text-(--ink-2)">
							<span>Tax (8.25%)</span>
							<span className="tabular-nums">{formatCurrency(tax)}</span>
						</div>
						<div className="flex justify-between pb-2.5 pt-2 text-lg font-semibold text-(--ink)">
							<span>Total</span>
							<span className="tabular-nums">{formatCurrency(total)}</span>
						</div>
					</fieldset>

					<div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-(--rule) bg-[color-mix(in_srgb,var(--paper)_60%,var(--sheet))] px-[22px] py-4 max-lg:order-2 max-lg:border-t-0">
						<div className="flex min-h-11 items-center">
							{current.event ? (
								<div className="flex items-start gap-2.5 transition-[opacity,translate] duration-240 ease-(--lp-ease) starting:translate-y-1.5 starting:opacity-0">
									<span
										aria-hidden="true"
										className="mt-px grid size-[19px] flex-none place-items-center rounded-full bg-(--paid-wash) text-(--paid)"
									>
										<Check className="size-3" strokeWidth={3} />
									</span>
									<div className="min-w-0">
										<p className="text-sm font-semibold leading-[1.35] tracking-[-0.01em] text-(--ink)">
											{current.event.title}
										</p>
										<p className="mt-0.5 text-sm leading-[1.45] text-(--ink-2)">{current.event.body}</p>
									</div>
								</div>
							) : (
								<p className="text-sm text-(--ink-3)">{current.hint}</p>
							)}
						</div>
						{running ? (
							<button
								type="button"
								onClick={() => setHeld((h) => !h)}
								aria-pressed={held}
								className={cn(LP_SECONDARY, "mr-2 min-h-11 gap-1.5 rounded-lg px-3 text-sm")}
							>
								{held ? <Play aria-hidden="true" className="size-4" /> : <Pause aria-hidden="true" className="size-4" />}
								{held ? "Resume" : "Pause"}
							</button>
						) : null}
						{current.action ? (
							<span
								data-demo="action"
								data-pressed={pressed === "action"}
								className={cn(
									"inline-flex h-8 cursor-default items-center gap-1.5 rounded-full px-3 text-sm font-medium",
									PRESSABLE,
									waiting ? "bg-(--paper) text-(--ink-2)" : "bg-(--accent-wash) text-(--accent-ink)",
								)}
							>
								{waiting ? (
									<Clock aria-hidden="true" className="size-3.5" />
								) : (
									<ArrowRight aria-hidden="true" className="size-3.5" />
								)}
								{current.action}
							</span>
						) : (
							<button
								type="button"
								onClick={play}
								disabled={running}
								className={cn(LP_SECONDARY, "min-h-11 gap-2 rounded-lg px-4 text-sm disabled:opacity-60")}
							>
								<RotateCcw aria-hidden="true" className="size-4" />
								Replay
							</button>
						)}
					</div>
				</div>

				<div ref={phoneRef} className="mx-auto w-[min(320px,100%)] max-lg:order-3 max-md:w-[min(264px,100%)]">
					<Iphone aria-hidden="true">
						<Scaled width={SCREEN_W} height={SCREEN_H}>
							<ClientPhone screen={SCREENS[shown]} lines={lines} totals={sums} pressed={pressed} />
						</Scaled>
					</Iphone>
					<p aria-live="polite" className="sr-only">
						{PHONE_SAYS[shown]}
					</p>
				</div>

				{running && !scripted ? (
					<DemoCursor
						ref={cursorRef}
						at={cursor}
						name={identity.name}
						color={identity.color}
						textColor="var(--paper)"
					/>
				) : null}
			</div>
		</div>
	);
}
