"use client";
import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { Check, FolderPlus, Mail, RotateCcw, Workflow } from "lucide-react";
import { BentoCard } from "./bento-card";
import { BENTO_COPY } from "./copy";
const PHASE_MS = [700, 700, 1100, 550, 160, 3200];
const ease = [0.22, 1, 0.36, 1] as const;
const steps = [
	{ name: "Send Email", ready: "To the client", result: "Email sent", icon: Mail, phase: 4 },
	{ name: "Create Record", ready: "New project", result: "Project created", icon: FolderPlus, phase: 5 },
];
const timeline = [
	{ label: "Status changed", detail: "Quote #1042 · Approved", phase: 1 },
	{ label: "Send Email", detail: "Whitfield Property Group", phase: 4 },
	{ label: "Create Record", detail: "Project · Spring cleanup", phase: 5 },
];
function FlowPath({ d, active, reduce }: { d: string; active: boolean; reduce: boolean }) {
	return (
		<>
			<path d={d} fill="none" stroke="currentColor" strokeWidth={1.25} className="text-(--rule-2)" />
			<motion.path
				d={d}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
				strokeLinecap="round"
				initial={false}
				animate={{ pathLength: active ? 1 : 0, opacity: active ? 1 : 0 }}
				transition={{ duration: reduce ? 0 : active ? 0.5 : 0.2, ease }}
				className="text-(--accent)"
			/>
		</>
	);
}
export function AutomationCell() {
	const reduce = !!useReducedMotion();
	const stageRef = useRef<HTMLDivElement>(null);
	const inView = useInView(stageRef, { margin: "25% 0px" });
	const [expanded, setExpanded] = useState(false);
	const [phase, setPhase] = useState(0);
	const [run, setRun] = useState(1);
	const current = reduce ? 5 : phase;
	const complete = current === 5;
	useEffect(() => {
		const stage = stageRef.current;
		if (!stage) return;
		const observer = new ResizeObserver(([entry]) => {
			setExpanded(entry.contentRect.height > 520);
		});
		observer.observe(stage);
		return () => observer.disconnect();
	}, []);
	useEffect(() => {
		if (reduce || !inView) return;
		const timer = window.setTimeout(() => {
			if (phase === PHASE_MS.length - 1) {
				setRun((value) => value + 1);
				setPhase(0);
			} else {
				setPhase((value) => value + 1);
			}
		}, PHASE_MS[phase]);
		return () => window.clearTimeout(timer);
	}, [phase, run, reduce, inView]);
	const replay = () => {
		setPhase(0);
		setRun((value) => value + 1);
	};
	return (
		<BentoCard {...BENTO_COPY.automation}>
			<motion.div
				ref={stageRef}
				initial={{ opacity: 0, y: reduce ? 0 : 10 }}
				whileInView={{ opacity: 1, y: 0 }}
				viewport={{ once: true, amount: 0.3 }}
				transition={{ duration: 0.6, ease }}
				className="absolute inset-0 flex flex-col items-center justify-center px-5 py-1.5 @sm:px-6 @sm:py-3"
			>
				<div className="grid w-full max-w-[340px] items-center @2xl:max-w-[760px] @2xl:grid-cols-[1fr_36px_1.15fr_44px_1fr]">
					<div className="mx-auto flex w-[188px] max-w-full items-center gap-2.5 rounded-xl border border-(--rule-2) bg-(--sheet) px-3 py-1 shadow-(--lp-shadow) @sm:py-2 @2xl:w-full">
						<span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-(--accent-wash) text-[10px] font-semibold text-(--accent-ink)">
							WP
						</span>
						<div className="min-w-0">
							<p className="whitespace-nowrap text-[11px] font-medium leading-4 text-(--ink)">
								Quote #1042 approved
							</p>
							<p className="truncate text-[10px] leading-3.5 text-(--ink-3)">
								Whitfield Property Group
							</p>
						</div>
						<motion.span
							initial={false}
							animate={{ opacity: current >= 1 ? 1 : 0.2 }}
							transition={{ duration: reduce ? 0 : 0.3 }}
							className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-(--paper)"
						>
							<Check className="h-2.5 w-2.5 text-(--ink-3)" />
						</motion.span>
					</div>

					<div aria-hidden="true" className="relative h-3 @sm:h-5 @2xl:h-[132px]">
						<svg viewBox="0 0 340 20" className="h-full w-full @2xl:hidden">
							<FlowPath d="M170 0V20" active={current >= 1} reduce={reduce} />
						</svg>
						<svg viewBox="0 0 36 132" className="hidden h-full w-full @2xl:block">
							<FlowPath d="M0 66H36" active={current >= 1} reduce={reduce} />
						</svg>
					</div>

					<div className="relative mx-auto flex h-12 w-[224px] max-w-full items-center gap-2.5 overflow-hidden rounded-xl bg-(--ink) px-3.5 text-(--sheet) shadow-(--lp-shadow) @sm:h-[54px] @2xl:w-full">
						<Workflow className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.7} />
						<div className="min-w-0">
							<p className="whitespace-nowrap text-[11px] font-medium leading-4">
								Approved quote follow-up
							</p>
							<p className="text-[10px] leading-4 text-[color-mix(in_oklch,var(--sheet)_60%,transparent)]">
								{complete
									? "Run completed"
									: current >= 3
										? "Running steps"
										: current === 2
											? "Checking entry criteria"
											: current === 1
												? "Quote status changed"
												: "Watching quote statuses"}
							</p>
						</div>
						<div
							aria-hidden="true"
							className="absolute inset-x-0 bottom-0 h-0.5 bg-[color-mix(in_oklch,var(--sheet)_12%,transparent)]"
						>
							<motion.div
								initial={false}
								animate={{ scaleX: current >= 2 ? 1 : 0 }}
								transition={{
									duration: reduce ? 0 : current === 2 ? 1.1 : 0.2,
									ease: "linear",
								}}
								className="h-full origin-left bg-[color-mix(in_oklch,var(--sheet)_60%,transparent)]"
							/>
						</div>
					</div>

					<div aria-hidden="true" className="relative h-7 @2xl:h-[132px]">
						<svg viewBox="0 0 340 28" className="h-full w-full @2xl:hidden">
							<FlowPath d="M170 0V4Q170 12 162 12H90Q82 12 82 20V28" active={current >= 3} reduce={reduce} />
							<FlowPath d="M170 0V4Q170 12 178 12H250Q258 12 258 20V28" active={current >= 3} reduce={reduce} />
						</svg>
						<svg viewBox="0 0 44 132" className="hidden h-full w-full @2xl:block">
							<FlowPath d="M0 66H14Q22 66 22 58V38Q22 30 30 30H44" active={current >= 3} reduce={reduce} />
							<FlowPath d="M0 66H14Q22 66 22 74V94Q22 102 30 102H44" active={current >= 3} reduce={reduce} />
						</svg>
					</div>

					<div className="grid grid-cols-2 gap-3 @2xl:grid-cols-1">
						{steps.map((step) => {
							const done = current >= step.phase;
							const Icon = step.icon;
							return (
								<div
									key={step.name}
									className="flex h-[52px] items-center gap-2 rounded-xl border border-(--rule-2) bg-(--sheet) px-2.5 shadow-(--lp-shadow) @sm:h-[60px] @sm:px-3"
								>
									<div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-(--paper) text-(--ink-3)">
										<motion.span
											key={done ? "done" : "ready"}
											initial={{ opacity: reduce ? 1 : 0, scale: reduce ? 1 : 0.85 }}
											animate={{ opacity: 1, scale: 1 }}
											transition={{ duration: 0.25, ease }}
										>
											{done ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
										</motion.span>
									</div>
									<div className="min-w-0">
										<p className="whitespace-nowrap text-[11px] font-medium leading-4 text-(--ink)">
											{step.name}
										</p>
										<p className="whitespace-nowrap text-[10px] leading-4 text-(--ink-3)">
											{done ? step.result : current >= 3 ? "Running…" : step.ready}
										</p>
									</div>
								</div>
							);
						})}
					</div>
				</div>

				<div className="mt-2 flex h-5 w-full max-w-[340px] items-center justify-between gap-3 @sm:mt-4 @sm:h-6 @2xl:mt-6 @2xl:max-w-[760px]">
					<div className="flex min-w-0 items-center gap-1.5 text-[10px] tabular-nums text-(--ink-3)">
						<span
							className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-300 ${complete ? "bg-(--paid)" : "bg-(--rule-3)"}`}
						/>
						<span className="truncate">
							{complete
								? `Run ${String(run).padStart(3, "0")} completed`
								: current > 0
									? "One approval, two steps"
									: "Watching for an approved quote"}
						</span>
					</div>
					<button
						type="button"
						onClick={replay}
						aria-label="Replay the approved quote run"
						className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] font-medium text-(--ink-3) transition-colors hover:bg-(--paper) hover:text-(--ink) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent-ink)"
					>
						<RotateCcw className="h-3 w-3" />
						Replay
					</button>
				</div>

				{expanded && (
					<div className="mt-8 w-full max-w-[340px] rounded-xl border border-(--rule-2) bg-(--sheet) px-4 py-3.5 @2xl:mt-10 @2xl:max-w-[760px]">
						<div className="mb-4 flex items-center justify-between gap-3 text-[10px]">
							<span className="font-medium text-(--ink-2)">Run timeline</span>
							<span className="font-mono tabular-nums text-(--ink-3)">
								#{String(run).padStart(4, "0")}
							</span>
						</div>
						<div className="space-y-4 @2xl:grid @2xl:grid-cols-3 @2xl:gap-5 @2xl:space-y-0">
							{timeline.map((event) => {
								const done = current >= event.phase;
								return (
									<div key={event.label} className="flex items-start gap-2.5">
										<span
											className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-300 ${done ? "border-(--rule-2) text-(--ink-2)" : "border-(--rule) text-transparent"}`}
										>
											<Check className="h-2.5 w-2.5" />
										</span>
										<div className="min-w-0 flex-1">
											<div className="flex items-center justify-between gap-2 text-[10px]">
												<span className={done ? "font-medium text-(--ink-2)" : "text-(--ink-3)"}>
													{event.label}
												</span>
												<span className="shrink-0 text-(--ink-3)">{done ? "Completed" : "--"}</span>
											</div>
											<p className="mt-0.5 truncate text-[10px] text-(--ink-3)">{event.detail}</p>
										</div>
									</div>
								);
							})}
						</div>
					</div>
				)}
			</motion.div>
		</BentoCard>
	);
}
