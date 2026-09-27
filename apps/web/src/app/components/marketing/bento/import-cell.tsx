"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { Check, FileSpreadsheet, Upload } from "lucide-react";
import { BentoCard } from "./bento-card";
import { BENTO_COPY } from "./copy";

type Job = {
	name: string;
	results: string[];
};
const jobs: Job[] = [
	{
		name: "clients.csv",
		results: ["9 columns matched", "2 duplicates skipped", "214 clients added"],
	},
	{
		name: "customer-list.csv",
		results: ["6 columns matched", "No duplicates", "87 clients added"],
	},
	{
		name: "spreadsheet-export.csv",
		results: ["12 columns matched", "5 duplicates skipped", "1,340 clients added"],
	},
];
type Phase = "drop" | "process" | "done";
const ease = [0.22, 1, 0.36, 1] as const;
const R = 26;
const CIRC = 2 * Math.PI * R;

export function ImportCell() {
	const reduce = !!useReducedMotion();
	const stageRef = useRef<HTMLDivElement>(null);
	const inView = useInView(stageRef, { margin: "25% 0px" });
	const [index, setIndex] = useState(0);
	const [phase, setPhase] = useState<Phase>(reduce ? "done" : "drop");
	const [progress, setProgress] = useState(0);
	const [hovering, setHovering] = useState(false);
	const job = jobs[index % jobs.length];
	useEffect(() => {
		if (!inView || reduce) return;
		let cancelled = false;
		const timers: number[] = [];
		const at = (ms: number, fn: () => void) =>
			timers.push(window.setTimeout(() => !cancelled && fn(), ms));
		at(700, () => setPhase("process"));
		for (let i = 1; i <= 10; i++) at(700 + i * 130, () => setProgress(i / 10));
		at(2200, () => setPhase("done"));
		at(4600, () => {
			setPhase("drop");
			setProgress(0);
			setIndex((n) => n + 1);
		});
		return () => {
			cancelled = true;
			timers.forEach((t) => window.clearTimeout(t));
		};
	}, [inView, reduce, index]);
	const displayPhase = reduce ? "done" : phase;
	return (
		<BentoCard {...BENTO_COPY.import}>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(color-mix(in_oklch,var(--ink)_14%,transparent)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
			/>

			<motion.div
				ref={stageRef}
				initial={{ opacity: 0, y: reduce ? 0 : 12 }}
				whileInView={{ opacity: 1, y: 0 }}
				viewport={{ once: true, amount: 0.3 }}
				transition={{ duration: 0.6, ease }}
				className="absolute inset-0 flex items-center justify-center px-6 py-5"
			>
				<div className="relative w-full max-w-[240px] @2xl:max-w-[320px]">
					<div className="pointer-events-none absolute -left-8 top-1/2 z-10 flex h-[140px] w-16 -translate-y-1/2 items-center justify-center @sm:-left-16 @2xl:-left-[88px]">
						<AnimatePresence mode="wait">
							{displayPhase === "drop" && (
								<motion.div
									key={job.name}
									initial={{ opacity: 0, y: -30, rotate: -6 }}
									animate={{ opacity: 1, y: 0, rotate: -3 }}
									exit={{ opacity: 0, x: 60, scale: 0.7 }}
									transition={{ duration: 0.5, ease }}
									className="flex h-[88px] w-16 flex-col justify-between rounded-lg border border-(--rule-2) bg-(--sheet) p-2.5 shadow-(--lp-shadow)"
								>
									<FileSpreadsheet className="h-5 w-5 text-(--ink-2)" />
									<div className="space-y-1">
										<div className="h-1 w-full rounded-full bg-(--paper)" />
										<div className="h-1 w-3/4 rounded-full bg-(--paper)" />
									</div>
									<span className="truncate text-[9px] font-medium text-(--ink-3)">
										{job.name}
									</span>
								</motion.div>
							)}
						</AnimatePresence>
					</div>

					<motion.button
						type="button"
						aria-label="Import another sample CSV"
						onClick={() => {
							setPhase("drop");
							setProgress(0);
							setIndex((value) => value + 1);
						}}
						onMouseEnter={() => setHovering(true)}
						onMouseLeave={() => setHovering(false)}
						animate={{ scale: hovering && !reduce ? 1.03 : 1 }}
						transition={{ duration: 0.25 }}
						className={`relative flex h-[140px] w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink) focus-visible:ring-offset-4 focus-visible:ring-offset-(--sheet) ${
							displayPhase === "drop" && !hovering
								? "border-(--rule-3) bg-(--sheet)"
								: "border-(--ink) bg-(--paper)"
						}`}
					>
						<div className="relative flex h-16 w-16 items-center justify-center">
							<svg
								aria-hidden="true"
								viewBox="0 0 64 64"
								className="absolute inset-0 h-full w-full -rotate-90"
							>
								<circle
									cx={32}
									cy={32}
									r={R}
									fill="none"
									stroke="currentColor"
									strokeWidth={3}
									className="text-(--rule-2)"
								/>
								<motion.circle
									cx={32}
									cy={32}
									r={R}
									fill="none"
									stroke="currentColor"
									strokeWidth={3}
									strokeLinecap="round"
									strokeDasharray={CIRC}
									initial={false}
									animate={{
										strokeDashoffset:
											CIRC * (1 - (displayPhase === "done" ? 1 : progress)),
									}}
									transition={{ duration: 0.2 }}
									className="text-(--accent)"
								/>
							</svg>
							<AnimatePresence mode="wait" initial={false}>
								{displayPhase === "done" ? (
									<motion.span
										key="done"
										initial={{ scale: 0.5, opacity: 0 }}
										animate={{ scale: 1, opacity: 1 }}
										exit={{ scale: 0.5, opacity: 0 }}
										transition={{ duration: 0.3, ease }}
										className="flex h-9 w-9 items-center justify-center rounded-full bg-(--ink) text-(--sheet)"
									>
										<Check className="h-4 w-4" strokeWidth={2.5} />
									</motion.span>
								) : (
									<motion.span
										key="up"
										initial={{ scale: 0.5, opacity: 0 }}
										animate={{ scale: 1, opacity: 1 }}
										exit={{ scale: 0.5, opacity: 0 }}
										transition={{ duration: 0.3, ease }}
										className="text-(--ink-3)"
									>
										<Upload className="h-5 w-5" />
									</motion.span>
								)}
							</AnimatePresence>
						</div>
						<span className="mt-2 text-[10px] font-medium tabular-nums text-(--ink-3)">
							{hovering
								? "Try another file"
								: displayPhase === "drop"
									? "Drop your CSV here"
									: displayPhase === "process"
										? `Matching columns · ${Math.round(progress * 100)}%`
										: `${job.name} imported`}
						</span>

						<div className="absolute -bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
							<AnimatePresence>
								{displayPhase === "done" &&
									job.results.map((out, i) => (
										<motion.span
											key={out}
											initial={{ opacity: 0, y: 8, scale: 0.9 }}
											animate={{ opacity: 1, y: 0, scale: 1 }}
											exit={{ opacity: 0, y: 4 }}
											transition={{ duration: 0.35, delay: i * 0.08, ease }}
											className="whitespace-nowrap rounded-full border border-(--rule-2) bg-(--sheet) px-2 py-0.5 text-[10px] font-medium text-(--ink-2) shadow-(--lp-shadow)"
										>
											{out}
										</motion.span>
									))}
							</AnimatePresence>
						</div>
					</motion.button>
				</div>
			</motion.div>
		</BentoCard>
	);
}
