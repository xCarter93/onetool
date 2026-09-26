"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, type AnimationPlaybackControls } from "motion/react";
import UserCursor from "@/components/react-bits/user-cursor";
import { StatusBadge } from "@/components/domain/status-badge";
import { formatCurrency, roundCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { AmbientLayer } from "../ambient";
import { LP_PRIMARY, LP_SECONDARY } from "../marketing-nav";
import { Lede, Section, SectionHeading } from "../primitives";
import { RoughMark } from "../rough-mark";
import { TryItHalftoneScene } from "../section-halftone-scenes";
import { SimToastStack, useSimToasts } from "../sim-toast";
import { usePrefersReducedMotion } from "../use-reduced-motion";

const ITEMS = [
	{ id: "cleanup", name: "Spring cleanup", price: 340 },
	{ id: "gutters", name: "Gutter clearing", price: 180 },
	{ id: "filters", name: "Quarterly filter change", price: 120 },
	{ id: "irrigation", name: "Irrigation startup", price: 95 },
	{ id: "deepclean", name: "Deep clean, 3BR", price: 260 },
] as const;

const OPENING: Record<string, boolean> = {
	cleanup: true,
	gutters: true,
	irrigation: true,
};

const TAX_RATE = 0.0825;

function totals(picked: Record<string, boolean>) {
	const subtotal = ITEMS.reduce((sum, it) => sum + (picked[it.id] ? it.price : 0), 0);
	const tax = roundCents(subtotal * TAX_RATE);
	return { tax, total: roundCents(subtotal + tax) };
}

const STEPS = [
	{
		label: "Quote",
		title: "Quote #1042",
		status: "draft",
		badge: "Draft",
		action: "Send quote",
		hint: "Dana ticks the work, then sends it.",
	},
	{
		label: "Sent",
		title: "Quote #1042",
		status: "sent",
		badge: "Sent",
		action: "Client signs",
		hint: "It's on their phone now. Watch the client.",
	},
	{
		label: "Signed",
		title: "Quote #1042",
		status: "approved",
		badge: "Signed",
		action: "Convert to invoice",
		hint: "Signed. One tap makes it an invoice.",
	},
	{
		label: "Invoice",
		title: "Invoice #1042",
		status: "sent",
		badge: "Payment requested",
		action: "Client pays by card",
		hint: "The pay link is on their phone.",
	},
	{
		label: "Paid",
		title: "Invoice #1042",
		status: "paid",
		badge: "Paid",
		action: null,
		hint: "Paid. The invoice is marked as paid.",
	},
] as const;

const SENT = 1;
const SIGNED = 2;
const INVOICED = 3;
const PAID = 4;

const IDENTITY = {
	office: { name: "Dana · Office", color: "var(--accent-ink)" },
	client: { name: "R. Whitfield · Client", color: "var(--paid)" },
} as const;

type Beat = {
	target: string;
	who: keyof typeof IDENTITY;
	step?: number;
	toast?: [title: string, body: string];
	hold?: number;
};

const SIGN_MS = 900;
const FINAL_TOTAL = totals({ ...OPENING, filters: true, deepclean: true }).total;

/** The whole job, one press per beat. A beat without `step` ticks its line item. */
const BEATS: Beat[] = [
	{ target: "filters", who: "office" },
	{ target: "deepclean", who: "office" },
	{ target: "action", who: "office", step: SENT },
	{
		target: "approve",
		who: "client",
		step: SIGNED,
		toast: ["R. Whitfield signed Quote #1042", "E-signature saved to the quote."],
		hold: SIGN_MS,
	},
	{ target: "action", who: "office", step: INVOICED },
	{
		target: "pay",
		who: "client",
		step: PAID,
		toast: [`Paid ${formatCurrency(FINAL_TOTAL)} by card`, "Payment recorded on the invoice."],
	},
];

const LEAD_MS = 400;
const GLIDE_MS = 700;
const SETTLE_MS = 350;
const PRESS_MS = 160;
const GAP_MS = 500;
const REDUCED_MS = 1200;
// sim-cursor's springs: tight arrow, softer trailing label; the glide itself is tweened.
const ARROW_SPRING = { stiffness: 900, damping: 48, mass: 0.4 };
const LABEL_SPRING = { stiffness: 260, damping: 30, mass: 0.7 };
const GLIDE_EASE = [0.23, 1, 0.32, 1] as const;
// Where the arrow's tip sits inside UserCursor's 26px, -14° glyph.
const TIP = { x: 4, y: 6 };

const SIGNATURE =
	"M8 42 C 22 12, 34 12, 38 34 S 52 52, 62 30 S 80 10, 88 32 C 94 46, 104 46, 112 34 C 122 20, 132 22, 138 36 S 160 46, 190 20";

const PRESSABLE = "transition-transform duration-150 data-[pressed=true]:scale-[0.96]";

const PHONE_BUTTON = cn(
	"rounded-[10px] p-[11px] text-center text-[14.5px] font-semibold text-(--paper)",
	PRESSABLE,
);

export function TryIt() {
	const [step, setStep] = useState(0);
	const [picked, setPicked] = useState(OPENING);
	const [pressed, setPressed] = useState<string | null>(null);
	const [who, setWho] = useState<keyof typeof IDENTITY>("office");
	const [running, setRunning] = useState(false);
	const { toasts, push, clear } = useSimToasts();
	const reduced = usePrefersReducedMotion();

	const surfaceRef = useRef<HTMLDivElement>(null);
	const cursorX = useMotionValue(0);
	const cursorY = useMotionValue(0);
	const timers = useRef<number[]>([]);
	const glides = useRef<AnimationPlaybackControls[]>([]);

	const stop = useCallback(() => {
		timers.current.forEach(clearTimeout);
		timers.current = [];
		glides.current.forEach((g) => g.stop());
		glides.current = [];
	}, []);

	useEffect(() => stop, [stop]);

	const play = useCallback(() => {
		stop();
		clear();
		setStep(0);
		setPicked(OPENING);
		setPressed(null);
		setWho("office");
		setRunning(true);

		const after = (ms: number, run: () => void) => {
			timers.current.push(window.setTimeout(run, ms));
		};
		const act = (beat: Beat) => {
			if (beat.step === undefined) {
				setPicked((prev) => ({ ...prev, [beat.target]: !prev[beat.target] }));
				return;
			}
			setStep(beat.step);
			if (beat.toast) push(...beat.toast, "paid");
		};

		if (reduced) {
			BEATS.forEach((beat, i) => after((i + 1) * REDUCED_MS, () => act(beat)));
			after(BEATS.length * REDUCED_MS, () => setRunning(false));
			return;
		}

		const surface = surfaceRef.current;
		if (surface) {
			// Set before the cursor mounts: its springs seed from these values.
			cursorX.jump(surface.offsetWidth * 0.3);
			cursorY.jump(surface.offsetHeight * 0.92);
		}
		const glideTo = (target: string) => {
			const box = surfaceRef.current?.getBoundingClientRect();
			const el = surfaceRef.current?.querySelector(`[data-demo="${target}"]`);
			if (!box || !el) return;
			const r = el.getBoundingClientRect();
			const opts = { duration: GLIDE_MS / 1000, ease: GLIDE_EASE };
			glides.current = [
				animate(cursorX, r.left - box.left + r.width / 2 - TIP.x, opts),
				animate(cursorY, r.top - box.top + r.height / 2 - TIP.y, opts),
			];
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
	}, [stop, clear, push, reduced, cursorX, cursorY]);

	// Re-observes when `play` changes (reduced motion resolves after hydration); `started` keeps it once.
	const started = useRef(false);
	useEffect(() => {
		const node = surfaceRef.current;
		if (!node || started.current) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry.isIntersecting) return;
				observer.disconnect();
				started.current = true;
				play();
			},
			{ threshold: 0.45 },
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, [play]);

	const { tax, total } = totals(picked);
	const waiting = step === SENT || step === INVOICED;
	const current = STEPS[step];
	const identity = IDENTITY[who];

	return (
		<Section id="try" className="overflow-hidden border-t border-(--rule)">
			<AmbientLayer fullBleed opacity={0.7}>
				<TryItHalftoneScene />
			</AmbientLayer>

			<div className="relative grid items-end gap-6 lg:grid-cols-2">
				<div>
					<SectionHeading className="mt-0 max-w-[16ch]">
						Run a job, quote to <RoughMark type="underline">paid</RoughMark>.
					</SectionHeading>
				</div>
				<Lede className="max-w-[30rem]">
					Watch a sample quote move from the office to a client&apos;s phone,
					then into a paid invoice.
				</Lede>
			</div>

			<div
				ref={surfaceRef}
				className="relative mt-[clamp(36px,5vw,64px)] grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
			>
				<div className="min-w-0 overflow-hidden rounded-[18px] border border-(--rule-2) bg-(--sheet) shadow-(--lp-shadow)">
					<ol aria-label="Job progress" className="flex overflow-x-auto border-b border-(--rule)">
						{STEPS.map((s, i) => {
							const done = i < step || step === PAID;
							const active = i === step;
							return (
								<li
									key={s.label}
									aria-current={active ? "step" : undefined}
									className={cn(
										"flex min-w-[92px] flex-1 items-center gap-2 border-r border-(--rule) px-3.5 py-3 last:border-r-0",
										active && "bg-(--accent-wash)",
									)}
								>
									<span
										aria-hidden="true"
										className={cn(
											"grid size-5 flex-none place-items-center rounded-full text-[11px] font-bold leading-none transition-colors duration-200",
											done
												? "bg-(--paid) text-(--paper)"
												: active
													? "bg-(--accent-ink) text-(--paper)"
													: "bg-(--rule) text-(--ink-3)",
										)}
									>
										{done ? "✓" : i + 1}
									</span>
									<span
										className={cn(
											"whitespace-nowrap text-[13.5px] font-medium",
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

					<div className="flex items-center justify-between gap-3 border-b border-(--rule) px-[22px] py-[18px]">
						<div className="min-w-0">
							<p className="text-[18px] font-semibold tracking-[-0.02em] text-(--ink)">
								{current.title}
							</p>
							<p className="text-[13.5px] text-(--ink-3)">
								Whitfield Property Group · 412 Ashfield Court
							</p>
						</div>
						<StatusBadge status={current.status}>{current.badge}</StatusBadge>
					</div>

					{/* Read-only: the script drives the ticks, so visitor input would fight it. */}
					<fieldset disabled className="px-[22px] py-2">
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
											"grid size-[18px] flex-none place-items-center rounded-[5px] border-[1.5px] text-[12px] leading-none text-(--paper) transition-[color,background-color,border-color,transform] duration-150 data-[pressed=true]:scale-[0.96]",
											on ? "border-(--accent-ink) bg-(--accent-ink)" : "border-(--rule-3)",
										)}
									>
										{on ? "✓" : ""}
									</span>
									<span
										className={cn(
											"flex-1 text-[15px]",
											step !== 0 && !on ? "text-(--ink-2)" : "text-(--ink)",
										)}
									>
										{it.name}
									</span>
									<span className="text-[15px] tabular-nums text-(--ink-2)">
										{formatCurrency(it.price, { whole: true })}
									</span>
								</label>
							);
						})}
						<div className="flex justify-between pt-3 text-[14px] text-(--ink-2)">
							<span>Tax (8.25%)</span>
							<span className="tabular-nums">{formatCurrency(tax)}</span>
						</div>
						<div className="flex justify-between pb-2.5 pt-2 text-[19px] font-semibold text-(--ink)">
							<span>Total</span>
							<span className="tabular-nums">{formatCurrency(total)}</span>
						</div>
					</fieldset>

					<div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-(--rule) bg-[color-mix(in_srgb,var(--paper)_60%,var(--sheet))] px-[22px] py-4">
						<div className="grid justify-items-start gap-2.5">
							<p className="text-[13.5px] text-(--ink-3)">{current.hint}</p>
							{step === PAID && !running ? (
								<button
									type="button"
									onClick={play}
									className={cn(LP_SECONDARY, "h-[38px] gap-2 rounded-[9px] px-4 text-sm")}
								>
									<span aria-hidden="true">↻</span>
									Replay
								</button>
							) : null}
						</div>
						{current.action ? (
							<span
								data-demo="action"
								data-pressed={pressed === "action"}
								className={cn(
									LP_PRIMARY,
									PRESSABLE,
									"h-[46px] cursor-default px-[22px] text-[15.5px]",
									waiting && "opacity-60",
								)}
							>
								{current.action}
								<span aria-hidden="true">→</span>
							</span>
						) : null}
					</div>
				</div>

				<div className="mx-auto w-[min(290px,100%)]">
					<div className="relative aspect-[9/17] rounded-[40px] border border-(--rule-2) bg-(--lp-casing) p-[10px] shadow-(--lp-shadow)">
						<div className="flex h-full flex-col overflow-hidden rounded-[31px] border border-(--rule) bg-(--sheet)">
							<div className="flex justify-center pb-1.5 pt-2.5">
								<span aria-hidden="true" className="h-[22px] w-20 rounded-full bg-(--rule-3)" />
							</div>
							<p className="border-b border-(--rule) px-[18px] pb-2.5 pt-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-(--ink-3)">
								Client&apos;s phone
							</p>
							<div
								aria-live="polite"
								aria-atomic="true"
								className="flex flex-1 flex-col justify-center gap-3 p-[18px] text-center"
							>
								{step === 0 ? (
									<p className="text-[14.5px] leading-[1.5] text-(--ink-3)">
										Nothing yet. Your client sees the quote the moment you send it.
									</p>
								) : null}
								{step === SENT ? (
									<div className="grid gap-2.5">
										<p className="text-[13px] text-(--ink-3)">Quote from OneMan Lawn &amp; Co.</p>
										<p className="text-[32px] font-semibold tracking-[-0.03em] text-(--ink)">
											{formatCurrency(total)}
										</p>
										<div
											data-demo="approve"
											data-pressed={pressed === "approve"}
											className={cn(PHONE_BUTTON, "bg-(--accent-ink)")}
										>
											Approve &amp; sign
										</div>
									</div>
								) : null}
								{step === SIGNED ? (
									<div className="grid gap-2">
										<svg viewBox="0 0 200 60" aria-hidden="true" className="h-[50px] w-full">
											<motion.path
												d={SIGNATURE}
												fill="none"
												stroke="var(--ink)"
												strokeWidth={2.4}
												strokeLinecap="round"
												initial={reduced ? false : { pathLength: 0 }}
												animate={{ pathLength: 1 }}
												transition={{ duration: SIGN_MS / 1000, ease: "easeInOut" }}
											/>
										</svg>
										<p className="text-[14.5px] font-semibold text-(--paid)">Signed · thank you!</p>
									</div>
								) : null}
								{step === INVOICED ? (
									<div className="grid gap-2.5 text-left">
										<p className="text-[13px] text-(--ink-3)">Invoice #1042</p>
										<p className="text-[30px] font-semibold tracking-[-0.03em] text-(--ink)">
											{formatCurrency(total)}
										</p>
										<p className="rounded-[9px] border border-(--rule-2) px-3 py-2.5 font-mono text-[12.5px] text-(--ink-2)">
											•••• 4180
										</p>
										<div
											data-demo="pay"
											data-pressed={pressed === "pay"}
											className={cn(PHONE_BUTTON, "bg-(--ink)")}
										>
											Pay now
										</div>
									</div>
								) : null}
								{step === PAID ? (
									<div className="grid justify-items-center gap-2.5">
										<span
											aria-hidden="true"
											className="grid size-14 place-items-center rounded-full bg-(--paid-wash) text-[26px] font-bold text-(--paid)"
										>
											✓
										</span>
										<p className="text-[16px] font-semibold text-(--ink)">Payment received</p>
										<p className="text-[13px] text-(--ink-3)">Receipt sent by email</p>
									</div>
								) : null}
							</div>
						</div>
					</div>
				</div>

				{running && !reduced ? (
					<UserCursor
						positionX={cursorX}
						positionY={cursorY}
						trigger="always"
						name={identity.name}
						color={identity.color}
						textColor="var(--paper)"
						size={26}
						spring={ARROW_SPRING}
						labelSpring={LABEL_SPRING}
						zIndex={10}
						hideOnTouch={false}
						className="pointer-events-none absolute inset-0"
					/>
				) : null}
			</div>

			<SimToastStack toasts={toasts} />
		</Section>
	);
}
