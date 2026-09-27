"use client";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { BookOpen, CreditCard, ReceiptText, Undo2, Users } from "lucide-react";
import { BentoCard } from "./bento-card";
import { BENTO_COPY } from "./copy";

const sources: {
	label: string;
	icon: LucideIcon;
	rule: string;
}[] = [
	{ label: "Clients", icon: Users, rule: "Clients sync on create and edit" },
	{ label: "Invoices", icon: ReceiptText, rule: "Invoices sync when sent" },
	{ label: "Payments", icon: CreditCard, rule: "Payments post when paid" },
	{ label: "Refunds", icon: Undo2, rule: "Refunds post once they succeed" },
];
const connectorPaths = [
	"M50 0 C50 44 200 22 200 64",
	"M150 0 C150 40 200 30 200 64",
	"M250 0 C250 40 200 30 200 64",
	"M350 0 C350 44 200 22 200 64",
];
const ease = [0.22, 1, 0.36, 1] as const;

export function SyncCell() {
	const reduce = useReducedMotion();
	const [hovered, setHovered] = useState<number | null>(null);
	const active = hovered === null ? null : sources[hovered];
	return (
		<BentoCard {...BENTO_COPY.sync}>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(color-mix(in_oklch,var(--ink)_14%,transparent)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_72%)]"
			/>

			<motion.div
				initial={{ opacity: 0, y: reduce ? 0 : 12 }}
				whileInView={{ opacity: 1, y: 0 }}
				viewport={{ once: true, amount: 0.3 }}
				transition={{ duration: 0.6, ease }}
				className="absolute inset-0 flex flex-col items-center justify-center px-6 py-5"
			>
				<div className="grid w-full max-w-[360px] grid-cols-4 gap-1.5 @2xl:max-w-[480px]">
					{sources.map((source, index) => {
						const Icon = source.icon;
						const isActive = hovered === index;
						return (
							<div
								key={source.label}
								className="relative flex justify-center"
								onMouseEnter={() => setHovered(index)}
								onMouseLeave={() => setHovered(null)}
							>
								<button
									type="button"
									aria-label={`Show how ${source.label.toLowerCase()} sync`}
									onClick={() => setHovered(index)}
									onFocus={() => setHovered(index)}
									onBlur={() => setHovered(null)}
									className={`relative inline-flex max-w-full cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm transition-[transform,color,background-color,border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink) ${
										isActive
											? "border-(--ink) bg-(--ink) text-(--sheet)"
											: "border-(--rule-2) bg-(--sheet) text-(--ink-2)"
									}`}
								>
									<Icon
										className={`h-3 w-3 shrink-0 ${
											isActive ? "text-(--sheet)" : "text-(--ink-3)"
										}`}
									/>
									<span className="hidden truncate @[420px]:inline">
										{source.label}
									</span>
								</button>
							</div>
						);
					})}
				</div>

				<svg
					aria-hidden="true"
					viewBox="0 0 400 64"
					preserveAspectRatio="none"
					className="h-12 w-full max-w-[360px] overflow-visible @sm:h-14 @2xl:max-w-[480px]"
				>
					{connectorPaths.map((d, index) => {
						const lit = hovered === index;
						return (
							<g key={d}>
								<path
									d={d}
									fill="none"
									stroke="currentColor"
									strokeWidth={lit ? 1.75 : 1.25}
									vectorEffect="non-scaling-stroke"
									className={`transition-colors duration-300 ${
										lit
											? "text-(--ink)"
											: hovered === null
												? "text-(--rule-2)"
												: "text-(--rule)"
									}`}
								/>
								{!reduce && hovered === null && (
									<motion.path
										d={d}
										fill="none"
										stroke="currentColor"
										strokeWidth={1.5}
										strokeLinecap="round"
										vectorEffect="non-scaling-stroke"
										pathLength={100}
										strokeDasharray="10 90"
										initial={{ strokeDashoffset: 100 }}
										animate={{ strokeDashoffset: [100, 0] }}
										transition={{
											duration: 2.2,
											repeat: Infinity,
											ease: "linear",
											delay: index * 0.55,
										}}
										className="text-(--accent)"
									/>
								)}
							</g>
						);
					})}
				</svg>

				<div className="relative">
					<span className="absolute inset-0 rounded-full bg-[color-mix(in_oklch,var(--ink)_10%,transparent)] blur-md" />
					<motion.span
						animate={reduce ? undefined : { scale: hovered === null ? 1 : 1.05 }}
						transition={{ duration: 0.3, ease }}
						className="relative inline-flex items-center gap-1.5 rounded-full bg-(--ink) px-3.5 py-1.5 text-xs font-medium text-(--sheet)"
					>
						<BookOpen className="h-3.5 w-3.5" />
						QuickBooks Online
					</motion.span>
					<span className="absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-full border border-(--rule-2) bg-(--paper) px-2 py-0.5 text-[10px] font-medium text-(--ink-2)">
						Business plan
					</span>
				</div>

				<svg
					aria-hidden="true"
					viewBox="0 0 2 28"
					preserveAspectRatio="none"
					className="h-6 w-[2px] @sm:h-7"
				>
					<line
						x1={1}
						y1={0}
						x2={1}
						y2={28}
						stroke="currentColor"
						strokeWidth={1.25}
						vectorEffect="non-scaling-stroke"
						className="text-(--rule-2)"
					/>
					{!reduce && (
						<motion.line
							x1={1}
							y1={0}
							x2={1}
							y2={28}
							stroke="currentColor"
							strokeWidth={1.5}
							strokeLinecap="round"
							vectorEffect="non-scaling-stroke"
							pathLength={100}
							strokeDasharray="24 76"
							animate={{ strokeDashoffset: [100, 0] }}
							transition={{
								duration: 1.1,
								repeat: Infinity,
								ease: "linear",
								repeatDelay: 1.1,
							}}
							className="text-(--accent)"
						/>
					)}
				</svg>

				<div className="w-full max-w-[300px] rounded-xl border border-(--rule-2) bg-(--sheet) p-3 shadow-(--lp-shadow) @2xl:max-w-[380px]">
					<div className="flex items-center justify-between gap-3">
						<span className="flex items-center gap-2 text-[11px] font-medium text-(--ink-2)">
							<span className="relative flex h-1.5 w-1.5">
								<span className="absolute inset-0 rounded-full bg-(--paid) motion-safe:animate-ping" />
								<span className="relative h-1.5 w-1.5 rounded-full bg-(--paid)" />
							</span>
							{active ? active.rule : "No sync issues"}
						</span>
						<span className="whitespace-nowrap text-[11px] tabular-nums text-(--ink-3)">
							Synced 2 min ago
						</span>
					</div>
					<div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-(--paper)">
						<motion.div
							initial={{ scaleX: reduce ? 0.72 : 0.08 }}
							animate={
								reduce
									? undefined
									: active
										? { scaleX: 1 }
										: { scaleX: [0.08, 0.72, 0.72, 0.08] }
							}
							transition={
								active
									? { duration: 0.6, ease }
									: {
											duration: 4.4,
											times: [0, 0.55, 0.85, 1],
											repeat: Infinity,
											ease: "easeInOut",
										}
							}
							className="h-full w-full origin-left rounded-full bg-(--ink) will-change-transform"
						/>
					</div>
				</div>
			</motion.div>
		</BentoCard>
	);
}
