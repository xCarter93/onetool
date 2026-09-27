"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { CalendarPlus } from "lucide-react";
import { StatusBadge } from "@/components/domain/status-badge";
import { BentoCard } from "./bento-card";
import { BENTO_COPY } from "./copy";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const hours = ["7", "8", "9", "10", "11", "12"];
type Visit = {
	id: string;
	day: number;
	start: number;
	span: number;
	title: string;
	crew: string[];
	placed?: boolean;
};
const fixed: Visit[] = [
	{ id: "gutters", day: 0, start: 1, span: 2, title: "Gutter clearing · Oak St", crew: ["MR"] },
	{ id: "filter", day: 1, start: 0, span: 1, title: "Quarterly filter change", crew: ["PS"] },
	{ id: "deep-clean", day: 3, start: 1, span: 3, title: "Deep clean, 3BR", crew: ["MR", "PS"] },
	{ id: "irrigation", day: 4, start: 0, span: 2, title: "Irrigation startup", crew: ["PS"] },
];
const upNext: Visit[] = [
	{ id: "hedges", day: 2, start: 3, span: 1, title: "Hedge trim · Rivera", crew: ["MR"], placed: true },
	{ id: "estimate", day: 0, start: 4, span: 1, title: "Estimate walkthrough", crew: ["DN"], placed: true },
	{
		id: "windows",
		day: 3,
		start: 4,
		span: 2,
		title: "Window wash · Whitfield",
		crew: ["PS", "MR"],
		placed: true,
	},
];
const ease = [0.22, 1, 0.36, 1] as const;
const STEP_MS = 3200;

function Initials({ value, className }: { value: string; className: string }) {
	return (
		<span
			className={`grid shrink-0 place-items-center rounded-full bg-(--accent-wash) font-semibold text-(--accent-ink) ${className}`}
		>
			{value}
		</span>
	);
}

export function ScheduleCell() {
	const reduce = !!useReducedMotion();
	const ref = useRef<HTMLDivElement>(null);
	const inView = useInView(ref, { margin: "25% 0px" });
	const [step, setStep] = useState(0);
	const [hovered, setHovered] = useState<string | null>(null);
	useEffect(() => {
		if (!inView || reduce) return;
		const id = window.setInterval(
			() => setStep((s) => (s + 1) % (upNext.length + 3)),
			STEP_MS
		);
		return () => window.clearInterval(id);
	}, [inView, reduce]);
	const shown = reduce ? upNext.length : Math.min(step, upNext.length);
	const visits = [...fixed, ...upNext.slice(0, shown)];
	const pending = upNext[shown];
	return (
		<BentoCard {...BENTO_COPY.schedule}>
			<motion.div
				ref={ref}
				initial={{ opacity: 0, y: reduce ? 0 : 16 }}
				whileInView={{ opacity: 1, y: 0 }}
				viewport={{ once: true, amount: 0.3 }}
				transition={{ duration: 0.7, ease }}
				className="relative m-3 mb-0 flex flex-col overflow-hidden rounded-xl border border-(--rule-2) bg-(--sheet) shadow-(--lp-shadow)"
			>
				<div className="flex items-center justify-between gap-3 border-b border-(--rule) px-3.5 py-2.5">
					<div className="flex shrink-0 items-center gap-2">
						<span className="text-[11px] font-semibold text-(--ink)">September</span>
						<span className="hidden rounded-full border border-(--rule-2) px-2 py-0.5 text-[10px] text-(--ink-3) @sm:inline">
							Week 36
						</span>
					</div>
					<AnimatePresence mode="wait">
						{pending && !reduce && (
							<motion.span
								key={pending.id}
								initial={{ opacity: 0, y: 4 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -4 }}
								className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-(--rule-2) px-2 py-0.5 text-[10px] font-medium text-(--ink-2)"
							>
								<CalendarPlus className="h-3 w-3 shrink-0" />
								<span className="truncate">
									Adding {pending.title} to {days[pending.day]}
								</span>
							</motion.span>
						)}
					</AnimatePresence>
				</div>

				<div className="flex flex-1 flex-col @2xl:flex-row">
					<div className="min-w-0 @2xl:flex-1">
						<div className="grid h-[318px] shrink-0 grid-cols-[28px_repeat(3,minmax(0,1fr))] grid-rows-[32px_22px_264px] @sm:grid-cols-[28px_repeat(5,minmax(0,1fr))] @2xl:grid-cols-[36px_repeat(5,minmax(0,1fr))]">
							<div />
							{days.map((day, index) => (
								<div
									key={day}
									className={`${index >= 3 ? "hidden @sm:block" : ""} whitespace-nowrap border-l border-(--rule) px-1 py-1.5 text-center text-[10px] font-medium ${
										index === 2 ? "text-(--ink)" : "text-(--ink-3)"
									}`}
								>
									{day}
									<span
										className={`ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full tabular-nums ${
											index === 2 ? "bg-(--ink) text-(--sheet)" : ""
										}`}
									>
										{index + 2}
									</span>
								</div>
							))}

							<div />
							<div className="col-span-3 px-1 py-0.5">
								<div
									className="flex h-full items-center rounded-md border border-(--rule-2) bg-(--paper) px-1.5 text-[9px] font-medium leading-none text-(--ink) @2xl:text-[10px]"
									title="Spring cleanup · Whitfield, Mon to Wed"
								>
									<span className="truncate">Spring cleanup · Whitfield</span>
								</div>
							</div>
							<div className="hidden @sm:block" />
							<div className="hidden @sm:block" />

							<div className="relative">
								{hours.map((h, i) => (
									<span
										key={h}
										className="absolute right-1.5 -translate-y-1/2 text-[9px] tabular-nums text-(--ink-3)"
										style={{ top: `${(i / hours.length) * 100}%` }}
									>
										{h}
									</span>
								))}
							</div>

							{days.map((day, dayIndex) => (
								<div
									key={day}
									className={`relative border-l border-(--rule) ${dayIndex >= 3 ? "hidden @sm:block" : ""}`}
								>
									{hours.map((h, i) => (
										<div
											key={h}
											className="absolute inset-x-0 border-t border-dashed border-(--rule)"
											style={{ top: `${(i / hours.length) * 100}%` }}
										/>
									))}
									<AnimatePresence>
										{visits
											.filter((v) => v.day === dayIndex)
											.map((visit) => {
												const lit = hovered === visit.id;
												return (
													<motion.button
														key={visit.id}
														type="button"
														layout
														initial={
															visit.placed
																? {
																		opacity: 0,
																		scale: reduce ? 1 : 0.9,
																		y: reduce ? 0 : -8,
																	}
																: false
														}
														animate={{ opacity: 1, scale: 1, y: 0 }}
														exit={{ opacity: 0, scale: reduce ? 1 : 0.96 }}
														transition={{ duration: 0.45, ease }}
														onMouseEnter={() => setHovered(visit.id)}
														onMouseLeave={() => setHovered(null)}
														onFocus={() => setHovered(visit.id)}
														onBlur={() => setHovered(null)}
														onClick={() =>
															setHovered((value) => (value === visit.id ? null : visit.id))
														}
														aria-label={`${visit.title}, ${day}, ${hours[visit.start]} o'clock`}
														title={`${visit.title} · ${hours[visit.start]}:00`}
														className={`absolute inset-x-1 flex cursor-pointer flex-col justify-between overflow-hidden rounded-lg border bg-(--paper) px-1.5 py-1 text-left transition-[box-shadow,border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink) ${
															lit
																? "z-10 border-(--ink) shadow-(--lp-shadow)"
																: "border-(--rule-2)"
														}`}
														style={{
															top: `calc(${(visit.start / hours.length) * 100}% + 2px)`,
															height: `calc(${(visit.span / hours.length) * 100}% - 4px)`,
														}}
													>
														<span className="truncate text-[9px] font-medium leading-none text-(--ink) @2xl:text-[10px]">
															{visit.title}
														</span>
														<span className="flex -space-x-1">
															{visit.crew.map((initials) => (
																<Initials
																	key={initials}
																	value={initials}
																	className="h-4 w-4 border border-(--sheet) text-[6px]"
																/>
															))}
														</span>
													</motion.button>
												);
											})}
									</AnimatePresence>

									{dayIndex === 2 && (
										<div
											className="pointer-events-none absolute inset-x-0 flex items-center"
											style={{ top: `${(1.6 / hours.length) * 100}%` }}
										>
											<span className="h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-(--accent)" />
											<span className="h-px flex-1 bg-(--accent)" />
										</div>
									)}
								</div>
							))}
						</div>
					</div>
					<div className="border-t border-(--rule) p-4 @2xl:w-[248px] @2xl:shrink-0 @2xl:border-l @2xl:border-t-0">
						<p className="text-[11px] font-medium text-(--ink-2)">Up Next</p>
						<div className="mt-3 space-y-2">
							{upNext.map((visit, index) => {
								const booked = index < shown;
								return (
									<button
										key={visit.id}
										type="button"
										onClick={() => {
											setStep((value) => Math.max(value, index + 1));
											setHovered(visit.id);
										}}
										onPointerEnter={() => setHovered(visit.id)}
										onPointerLeave={() => setHovered(null)}
										onFocus={() => setHovered(visit.id)}
										onBlur={() => setHovered(null)}
										aria-label={`${booked ? "Show" : "Schedule"} ${visit.title}`}
										className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-(--rule-2) p-3 text-left transition-colors hover:bg-(--paper) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)"
									>
										<Initials value={visit.crew[0]} className="h-7 w-7 text-[10px]" />
										<span className="min-w-0 flex-1">
											<span className="block truncate text-[11px] font-medium text-(--ink-2)">
												{visit.title}
											</span>
											<span className="mt-1 block text-[10px] text-(--ink-3)">
												{days[visit.day]} · {hours[visit.start]}:00
											</span>
										</span>
										{booked ? (
											<StatusBadge status="scheduled" className="shrink-0">
												Scheduled
											</StatusBadge>
										) : (
											<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-(--rule-3)" />
										)}
									</button>
								);
							})}
						</div>
					</div>
				</div>
			</motion.div>
		</BentoCard>
	);
}
