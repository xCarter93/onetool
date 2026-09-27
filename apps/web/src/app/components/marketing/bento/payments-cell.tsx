"use client";
import { useEffect, useRef, useState } from "react";
import {
	animate,
	motion,
	useInView,
	useMotionValue,
	useReducedMotion,
	useSpring,
	useTransform,
} from "motion/react";
import { ArrowDownLeft, Check, KeyRound, Landmark } from "lucide-react";
import { StatusBadge } from "@/components/domain/status-badge";
import { formatCurrency } from "@/lib/money";
import { BentoCard } from "./bento-card";
import { BENTO_COPY } from "./copy";

const SIZE = 240;
const START_BALANCE = 18240;
const payments = [
	{ client: "Whitfield Property Group", invoice: "Invoice #1042", amount: 1840, card: "Visa ••4242" },
	{ client: "Rivera residence", invoice: "Invoice #1043", amount: 385.5, card: "Mastercard ••8210" },
	{ client: "Oak St Bakery", invoice: "Invoice #1044", amount: 912.75, card: "Amex ••1005" },
];
const badges = [
	{
		label: "Pays out to your bank",
		icon: Landmark,
		className: "-left-8 top-[8%]",
		delay: 0,
	},
	{
		label: "No client password",
		icon: KeyRound,
		className: "-right-8 top-[8%]",
		delay: 1.4,
	},
];
const stripeChecks = ["Details submitted", "Charges enabled", "Payouts enabled"];
const collectedAt = (step: number) => {
	let total = START_BALANCE;
	for (let i = 1; i <= step; i++) total += payments[i % payments.length].amount;
	return total;
};
const ease = [0.22, 1, 0.36, 1] as const;
const STEP_MS = 3800;

export function PaymentsCell() {
	const reduce = !!useReducedMotion();
	const stageRef = useRef<HTMLDivElement>(null);
	const inView = useInView(stageRef, { margin: "25% 0px" });
	const [step, setStep] = useState(0);
	const [flipped, setFlipped] = useState(false);
	const collected = useMotionValue(START_BALANCE);
	const collectedText = useTransform(collected, (v) => formatCurrency(v));
	const [locked, setLocked] = useState(false);
	const lock = {
		onPointerEnter: () => setLocked(true),
		onPointerLeave: () => setLocked(false),
	};
	const payment = payments[step % payments.length];
	useEffect(() => {
		if (!inView || reduce || flipped) return;
		const id = window.setInterval(() => setStep((s) => s + 1), STEP_MS);
		return () => window.clearInterval(id);
	}, [inView, reduce, flipped]);
	useEffect(() => {
		if (!inView || reduce || step === 0) return;
		const controls = animate(collected, collectedAt(step), {
			duration: 1.1,
			ease: [0.16, 1, 0.3, 1],
		});
		return () => controls.stop();
	}, [inView, reduce, step, collected]);
	const px = useMotionValue(0);
	const py = useMotionValue(0);
	const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [12, -12]), {
		stiffness: 160,
		damping: 18,
	});
	const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-14, 14]), {
		stiffness: 160,
		damping: 18,
	});
	const track = (event: React.PointerEvent<HTMLDivElement>) => {
		if (reduce || locked) return;
		const rect = event.currentTarget.getBoundingClientRect();
		px.set((event.clientX - rect.left) / rect.width - 0.5);
		py.set((event.clientY - rect.top) / rect.height - 0.5);
	};
	const release = () => {
		setLocked(false);
		px.set(0);
		py.set(0);
		setFlipped(false);
	};

	return (
		<BentoCard {...BENTO_COPY.payments}>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(color-mix(in_oklch,var(--ink)_14%,transparent)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_70%)]"
			/>

			<motion.div
				ref={stageRef}
				initial={{ opacity: 0, y: reduce ? 0 : 12 }}
				whileInView={{ opacity: 1, y: 0 }}
				viewport={{ once: true, amount: 0.3 }}
				transition={{ duration: 0.7, ease }}
				onPointerMove={track}
				onPointerLeave={release}
				className="absolute inset-0 flex items-center justify-center p-4 [perspective:900px]"
			>
				<motion.div
					style={{ rotateX, rotateY, width: SIZE, height: SIZE }}
					className="relative shrink-0 scale-[0.85] [transform-style:preserve-3d] @sm:scale-100 @2xl:scale-[1.12]"
				>
					<div
						aria-hidden="true"
						className="absolute inset-[14px] rounded-full border border-dashed border-(--rule-3) motion-safe:animate-[spin_60s_linear_infinite]"
					/>
					<div
						aria-hidden="true"
						className="absolute inset-[34px] rounded-full bg-[color-mix(in_oklch,var(--ink)_4%,transparent)] blur-2xl"
					/>

					<button
						type="button"
						onClick={() => setFlipped((f) => !f)}
						{...lock}
						aria-label={flipped ? "Show amount collected" : "Show Stripe payout status"}
						className="absolute left-1/2 top-1/2 h-[120px] w-[192px] -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-xl [perspective:800px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink) focus-visible:ring-offset-4 focus-visible:ring-offset-(--sheet)"
					>
						<motion.div
							initial={false}
							animate={{ rotateY: flipped ? 180 : 0 }}
							transition={{ duration: reduce ? 0 : 0.7, ease }}
							className="relative h-full w-full [transform-style:preserve-3d]"
						>
							<div className="absolute inset-0 flex flex-col justify-between rounded-xl bg-(--ink) p-4 text-left text-(--sheet) shadow-(--lp-shadow) [backface-visibility:hidden]">
								<div className="flex items-start justify-between">
									<span className="text-[10px] font-medium uppercase tracking-wide opacity-80">
										Collected this month
									</span>
									<Landmark className="h-4 w-4 opacity-70" />
								</div>
								<motion.p className="text-xl font-semibold tabular-nums tracking-tight">
									{collectedText}
								</motion.p>
								<span className="text-[10px] opacity-70">Through Stripe</span>
							</div>
							<div className="absolute inset-0 flex flex-col justify-between rounded-xl border border-(--rule-2) bg-(--sheet) p-4 text-left text-(--ink) shadow-(--lp-shadow) [backface-visibility:hidden] [transform:rotateY(180deg)]">
								<p className="text-[10px] font-medium text-(--ink-3)">
									Stripe payments
								</p>
								<ul className="space-y-1 text-[11px]">
									{stripeChecks.map((check) => (
										<li key={check} className="flex items-center justify-between">
											<span className="text-(--ink-2)">{check}</span>
											<span className="inline-flex items-center gap-1 font-medium text-(--paid)">
												<Check className="h-3 w-3" />
												Yes
											</span>
										</li>
									))}
								</ul>
							</div>
						</motion.div>
					</button>

					<motion.div
						key={payment.invoice + step}
						initial={{ opacity: 0, y: 14, scale: 0.96 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						transition={{ duration: 0.5, ease }}
						style={{ translateZ: 40 }}
						className="absolute bottom-[4%] left-1/2 flex w-[216px] -translate-x-1/2 items-center gap-2.5 rounded-xl border border-(--rule-2) bg-(--sheet) p-2.5 shadow-(--lp-shadow)"
					>
						<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--paid-wash) text-(--paid)">
							<ArrowDownLeft className="h-3.5 w-3.5" />
						</span>
						<div className="min-w-0 flex-1 leading-tight">
							<p className="truncate text-[11px] font-medium text-(--ink)">
								{payment.client}
							</p>
							<p className="truncate text-[10px] text-(--ink-3)">
								{payment.invoice} · {payment.card}
							</p>
						</div>
						<div className="flex shrink-0 flex-col items-end gap-1">
							<span className="text-[11px] font-semibold tabular-nums text-(--ink)">
								{formatCurrency(payment.amount)}
							</span>
							<StatusBadge status="paid" size="sm">
								Paid
							</StatusBadge>
						</div>
					</motion.div>

					{badges.map((badge) => {
						const Icon = badge.icon;
						return (
							<motion.span
								key={badge.label}
								animate={reduce ? undefined : { y: [0, -5, 0] }}
								transition={{
									duration: 4.2,
									repeat: Infinity,
									ease: "easeInOut",
									delay: badge.delay,
								}}
								style={{ translateZ: 22 }}
								className={`absolute inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-(--rule-2) bg-(--sheet) px-2.5 py-1 text-[11px] font-medium text-(--ink-2) shadow-sm will-change-transform ${badge.className}`}
							>
								<Icon className="h-3 w-3 text-(--ink-3)" />
								{badge.label}
							</motion.span>
						);
					})}
				</motion.div>
			</motion.div>
		</BentoCard>
	);
}
