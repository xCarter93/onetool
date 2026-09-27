"use client";
import { useRef, useState } from "react";
import {
	motion,
	useInView,
	useMotionValue,
	useReducedMotion,
	useSpring,
	useTransform,
} from "motion/react";
import { Link2, Users } from "lucide-react";
import { BentoCard } from "./bento-card";
import { BENTO_COPY } from "./copy";

const SIZE = 240;
const body = { x: 48, y: 96, w: 144, h: 96, r: 10 };
const flap = `M${body.x} ${body.y + 6} L${body.x + body.w / 2} ${body.y - 52} L${body.x + body.w} ${body.y + 6} Z`;
const badges = [
	{
		label: "Filed to the client",
		icon: Link2,
		className: "-right-10 top-[26%]",
		delay: 1.3,
	},
	{
		label: "Shared with your team",
		icon: Users,
		className: "-left-4 bottom-[10%]",
		delay: 2.4,
	},
];
const letters = [
	{ from: "Whitfield Property", subject: "Re: Quote #1042", z: 0 },
	{ from: "Rivera residence", subject: "Gate code for Thursday", z: 1 },
	{ from: "Oak St Bakery", subject: "Can you add gutters?", z: 2 },
];
const ease = [0.22, 1, 0.36, 1] as const;

export function InboxCell() {
	const reduce = !!useReducedMotion();
	const stageRef = useRef<HTMLDivElement>(null);
	const inView = useInView(stageRef, { margin: "25% 0px" });
	const [open, setOpen] = useState(false);
	const px = useMotionValue(0);
	const py = useMotionValue(0);
	const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [10, -10]), {
		stiffness: 160,
		damping: 18,
	});
	const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-12, 12]), {
		stiffness: 160,
		damping: 18,
	});
	const track = (event: React.PointerEvent<HTMLDivElement>) => {
		if (reduce) return;
		const rect = event.currentTarget.getBoundingClientRect();
		px.set((event.clientX - rect.left) / rect.width - 0.5);
		py.set((event.clientY - rect.top) / rect.height - 0.5);
	};
	const release = () => {
		px.set(0);
		py.set(0);
		setOpen(false);
	};
	const lift = (z: number) => (open ? -80 - z * 8 : -34 - z * 6);

	return (
		<BentoCard {...BENTO_COPY.inbox}>
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
				onPointerEnter={() => setOpen(true)}
				onPointerLeave={release}
				className="absolute inset-0 flex items-center justify-center p-4 [perspective:900px]"
			>
				<motion.div
					style={{ rotateX, rotateY, width: SIZE, height: SIZE }}
					className="relative max-w-full shrink-0 scale-[0.85] [transform-style:preserve-3d] @sm:scale-100 @2xl:scale-[1.12]"
				>
					<div
						aria-hidden="true"
						className="absolute inset-[14px] rounded-full border border-dashed border-(--rule-3) motion-safe:animate-[spin_60s_linear_infinite]"
					/>
					<div
						aria-hidden="true"
						className="absolute inset-[34px] rounded-full bg-[color-mix(in_oklch,var(--ink)_4%,transparent)] blur-2xl"
					/>

					<svg
						aria-hidden="true"
						viewBox={`0 0 ${SIZE} ${SIZE}`}
						className="absolute inset-0 h-full w-full overflow-visible"
					>
						<path
							d={flap}
							strokeWidth={1.25}
							className="fill-(--paper) stroke-(--rule-2)"
						/>

						<rect
							x={body.x}
							y={body.y}
							width={body.w}
							height={body.h}
							rx={body.r}
							strokeWidth={1.25}
							className="fill-(--paper) stroke-(--rule-2)"
						/>

						{letters.map((letter, index) => (
							<motion.g
								key={letter.subject}
								initial={false}
								animate={{
									y: reduce ? -50 - index * 6 : lift(letter.z),
									x: open ? (index - 1) * 14 : 0,
									rotate: open ? (index - 1) * 5 : 0,
								}}
								transition={{ duration: 0.6, ease }}
								style={{ originX: 0.5, originY: 1 }}
							>
								<rect
									x={body.x + 16}
									y={body.y + 18}
									width={body.w - 32}
									height={72}
									rx={6}
									strokeWidth={1}
									className="fill-(--sheet) stroke-(--rule-2)"
								/>
								<text
									x={body.x + 26}
									y={body.y + 34}
									fontSize={8.5}
									fontWeight={600}
									className="fill-(--ink)"
								>
									{letter.from}
								</text>
								<text
									x={body.x + 26}
									y={body.y + 46}
									fontSize={7.5}
									className="fill-(--ink-3)"
								>
									{letter.subject}
								</text>
								<rect
									x={body.x + 26}
									y={body.y + 54}
									width={70}
									height={3}
									rx={1.5}
									className="fill-(--rule)"
								/>
								<rect
									x={body.x + 26}
									y={body.y + 61}
									width={48}
									height={3}
									rx={1.5}
									className="fill-(--rule)"
								/>
							</motion.g>
						))}

						<path
							d={`M${body.x} ${body.y + 28} L${body.x + body.w / 2} ${body.y + 70} L${body.x + body.w} ${body.y + 28} V${body.y + body.h - body.r} a${body.r} ${body.r} 0 0 1 -${body.r} ${body.r} H${body.x + body.r} a${body.r} ${body.r} 0 0 1 -${body.r} -${body.r} Z`}
							strokeWidth={1.25}
							className="fill-(--sheet) stroke-(--rule-2)"
						/>
					</svg>

					{badges.map((badge) => {
						const Icon = badge.icon;
						return (
							<motion.span
								key={badge.label}
								animate={reduce || !inView ? undefined : { y: [0, -5, 0] }}
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

					<motion.span
						initial={{ scale: reduce ? 1 : 0.6, opacity: reduce ? 1 : 0 }}
						whileInView={{ scale: 1, opacity: 1 }}
						viewport={{ once: true }}
						transition={{ duration: 0.5, delay: 0.5, ease }}
						style={{ translateZ: 30 }}
						className="absolute right-[14%] top-[40%] inline-flex h-7 items-center gap-1.5 rounded-full border-[3px] border-(--sheet) bg-(--accent-wash) px-2 text-[10px] font-semibold tabular-nums text-(--accent-ink) shadow-(--lp-shadow)"
					>
						<span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-(--accent)" />
						3 unread
					</motion.span>
				</motion.div>
			</motion.div>
		</BentoCard>
	);
}
