"use client";
import { useEffect, useRef, useState } from "react";
import {
	AnimatePresence,
	motion,
	useInView,
	useReducedMotion,
} from "motion/react";
import type { LucideIcon } from "lucide-react";
import {
	ArrowRight,
	Briefcase,
	Building2,
	Check,
	FileText,
	Home,
	ListCheck,
	MessageCircle,
	Plus,
	Receipt,
	Search,
	Users,
} from "lucide-react";
import { BentoCard } from "./bento-card";
import { BENTO_COPY } from "./copy";
type Item = {
	group: string;
	label: string;
	icon: LucideIcon;
	detail?: string;
	/** Search hits match by word prefix, like the real search. */
	record?: boolean;
};
const items: Item[] = [
	{ group: "Navigate", label: "Home", icon: Home },
	{ group: "Navigate", label: "Clients", icon: Users },
	{ group: "Navigate", label: "Projects", icon: Briefcase },
	{ group: "Navigate", label: "Tasks", icon: ListCheck },
	{ group: "Navigate", label: "Quotes", icon: FileText },
	{ group: "Navigate", label: "Invoices", icon: Receipt },
	{ group: "Create", label: "New client", icon: Plus },
	{ group: "Create", label: "New project", icon: Plus },
	{ group: "Create", label: "New quote", icon: Plus },
	{ group: "Create", label: "New task", icon: Plus },
	{ group: "Support", label: "Contact support", icon: MessageCircle },
	{
		group: "Clients",
		label: "Whitfield Property Group",
		icon: Building2,
		record: true,
	},
	{
		group: "Quotes",
		label: "Q-1042",
		detail: "Whitfield Property Group",
		icon: FileText,
		record: true,
	},
	{
		group: "Invoices",
		label: "INV-1042",
		detail: "Whitfield Property Group",
		icon: Receipt,
		record: true,
	},
];
const scripts = ["new q", "whit", "1042", "inv"];
const PLACEHOLDER = "Search clients, projects, quotes…";
const MIN_QUERY_LENGTH = 2;
const ease = [0.22, 1, 0.36, 1] as const;
const TYPE_MS = 85;
const ERASE_MS = 38;
const HOLD_MS = 1500;
const RAN_MS = 900;
const ROWS = 3;
const LIST_H = ROWS * 36 + 8;
type Phase = "idle" | "typing" | "hold" | "ran" | "erasing";
function matches(item: Item, query: string) {
	const q = query.trim().toLowerCase();
	if (!item.record) return item.label.toLowerCase().includes(q);
	if (q.length < MIN_QUERY_LENGTH) return false;
	return item.label
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.some((word) => word.startsWith(q));
}
export function CommandCell() {
	const reduce = !!useReducedMotion();
	const stageRef = useRef<HTMLDivElement>(null);
	const inView = useInView(stageRef, { margin: "25% 0px" });
	const [query, setQuery] = useState("");
	const [pressed, setPressed] = useState(false);
	const [phase, setPhase] = useState<Phase>("idle");
	const [round, setRound] = useState(0);
	const [manual, setManual] = useState(false);
	useEffect(() => {
		if (!inView || reduce || manual) return;
		let cancelled = false;
		const timers: number[] = [];
		const after = (ms: number, fn: () => void) => {
			timers.push(
				window.setTimeout(() => {
					if (!cancelled) fn();
				}, ms),
			);
		};
		const word = scripts[round % scripts.length];
		after(200, () => setPressed(true));
		after(360, () => setPressed(false));
		let t = 760;
		after(t - 1, () => setPhase("typing"));
		for (let i = 1; i <= word.length; i += 1) {
			after(t, () => setQuery(word.slice(0, i)));
			t += TYPE_MS + (i % 2) * 30;
		}
		after(t, () => setPhase("hold"));
		t += HOLD_MS;
		after(t, () => setPhase("ran"));
		t += RAN_MS;
		after(t, () => setPhase("erasing"));
		for (let i = word.length - 1; i >= 0; i -= 1) {
			after(t, () => setQuery(word.slice(0, i)));
			t += ERASE_MS;
		}
		t += 420;
		after(t, () => {
			setPhase("idle");
			setRound((r) => r + 1);
		});
		return () => {
			cancelled = true;
			timers.forEach((id) => window.clearTimeout(id));
		};
	}, [inView, reduce, round, manual]);
	const visible = items.filter((item) => matches(item, query));
	const openItem = (item: Item) => {
		setManual(true);
		setQuery(item.label);
		setPhase("ran");
	};
	return (
		<BentoCard {...BENTO_COPY.command}>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,color-mix(in_oklch,var(--ink)_14%,transparent)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_70%)]"
			/>

			<motion.div
				ref={stageRef}
				initial={{ opacity: 0, y: reduce ? 0 : 12 }}
				whileInView={{ opacity: 1, y: 0 }}
				viewport={{ once: true, amount: 0.3 }}
				transition={{ duration: 0.7, ease }}
				className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 py-2"
			>
				<div className="flex shrink-0 items-center gap-2">
					{["⌘", "K"].map((cap) => (
						<motion.span
							key={cap}
							initial={false}
							animate={{ y: pressed ? 3 : 0 }}
							transition={{ duration: 0.12 }}
							className={`flex h-8 w-8 items-center justify-center rounded-lg border text-[13px] font-semibold transition-[box-shadow,background-color] duration-150 ${
								pressed
									? "border-(--ink) bg-(--ink) text-(--sheet) shadow-none"
									: "border-(--rule-2) bg-(--sheet) text-(--ink-2) shadow-[0_3px_0_0_var(--rule-2)]"
							}`}
						>
							{cap}
						</motion.span>
					))}
				</div>

				<div className="w-full max-w-[320px] shrink-0 overflow-hidden rounded-xl border border-(--rule-2) bg-(--sheet) shadow-(--lp-shadow) @2xl:max-w-[380px]">
					<label className="flex h-9 items-center gap-2 border-b border-(--rule) px-3">
						<Search className="h-3.5 w-3.5 shrink-0 text-(--ink-3)" />
						<span className="relative flex min-w-0 flex-1 items-center">
							<span
								aria-hidden="true"
								className="invisible max-w-full truncate whitespace-pre text-xs"
							>
								{query || PLACEHOLDER}
							</span>
							<input
								value={query}
								onFocus={() => {
									setManual(true);
									setPressed(false);
									setPhase("idle");
								}}
								onChange={(event) => {
									setManual(true);
									setPhase("idle");
									setQuery(event.target.value);
								}}
								onKeyDown={(event) => {
									if (event.key === "Enter" && visible[0]) {
										event.preventDefault();
										openItem(visible[0]);
									} else if (event.key === "Escape") {
										setQuery("");
										setPhase("idle");
										event.currentTarget.blur();
										setManual(false);
									}
								}}
								onBlur={() => {
									if (query === "") setManual(false);
								}}
								placeholder={PLACEHOLDER}
								aria-label="Search workspace"
								className="absolute inset-0 w-full bg-transparent text-xs text-(--ink) placeholder:text-(--ink-3) focus:outline-none"
							/>
							{!manual && !reduce && (
								<span
									className={`ml-px h-3.5 w-px shrink-0 bg-(--ink) ${
										phase === "typing" || phase === "erasing"
											? ""
											: "motion-safe:animate-[pulse_1s_ease-in-out_infinite]"
									}`}
								/>
							)}
						</span>
					</label>
					<ul className="relative p-1" style={{ height: LIST_H }}>
						<AnimatePresence initial={false}>
							{visible.length === 0 && (
								<motion.li
									key="empty"
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									transition={{ duration: 0.2 }}
									className="absolute inset-x-1 top-1 px-2 py-3 text-center text-[11px] text-(--ink-3)"
								>
									No results found.
								</motion.li>
							)}
							{visible.slice(0, ROWS).map((item, index) => {
								const Icon = item.icon;
								const active = index === 0;
								const ran = active && phase === "ran";
								return (
									<motion.li
										key={`${item.group}:${item.label}`}
										layout="position"
										initial={{ opacity: 0, y: 6 }}
										animate={{ opacity: 1, y: 0 }}
										exit={{
											opacity: 0,
											y: -4,
											transition: { duration: 0.15 },
										}}
										transition={{ duration: 0.28, ease }}
									>
										<button
											type="button"
											onClick={() => openItem(item)}
											className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink) ${
												active ? "bg-(--paper)" : "hover:bg-(--paper)"
											}`}
										>
											<span
												className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors duration-200 ${
													active
														? "bg-(--accent-wash) text-(--accent-ink)"
														: "border border-(--rule-2) text-(--ink-3)"
												}`}
											>
												<AnimatePresence mode="wait" initial={false}>
													{ran ? (
														<motion.span
															key="check"
															initial={{ scale: 0.4, opacity: 0 }}
															animate={{ scale: 1, opacity: 1 }}
															exit={{ scale: 0.4, opacity: 0 }}
															transition={{ duration: 0.18, ease }}
															className="flex"
														>
															<Check className="h-3 w-3" strokeWidth={2.5} />
														</motion.span>
													) : (
														<motion.span
															key="icon"
															initial={{ scale: 0.4, opacity: 0 }}
															animate={{ scale: 1, opacity: 1 }}
															exit={{ scale: 0.4, opacity: 0 }}
															transition={{ duration: 0.18, ease }}
															className="flex"
														>
															<Icon className="h-3 w-3" />
														</motion.span>
													)}
												</AnimatePresence>
											</span>
											<span className="flex min-w-0 flex-1 items-baseline gap-1.5">
												<span className="truncate text-[11px] font-medium text-(--ink)">
													{item.label}
												</span>
												{item.detail && (
													<span className="hidden truncate text-[10px] text-(--ink-3) @xs:inline">
														{item.detail}
													</span>
												)}
											</span>
											<span className="shrink-0 text-[10px] text-(--ink-3)">
												{item.group}
											</span>
										</button>
									</motion.li>
								);
							})}
						</AnimatePresence>
					</ul>
					<div className="flex items-center justify-between border-t border-(--rule) px-3 py-1.5 text-[10px] text-(--ink-3)">
						<span>
							{visible.length} {visible.length === 1 ? "result" : "results"}
						</span>
						<span
							className={`inline-flex items-center gap-1 transition-colors duration-200 ${phase === "ran" ? "text-(--ink)" : ""}`}
						>
							{phase === "ran" ? "Preview only" : "Open"}
							{phase === "ran" ? (
								<Check className="h-3 w-3" />
							) : (
								<ArrowRight className="h-3 w-3" />
							)}
						</span>
					</div>
				</div>
			</motion.div>
		</BentoCard>
	);
}
