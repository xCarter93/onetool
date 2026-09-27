"use client";
import { useEffect, useRef, useState } from "react";
import {
	AnimatePresence,
	motion,
	useInView,
	useReducedMotion,
} from "motion/react";
import { ArrowUp, Check, Sparkles } from "lucide-react";
import { BentoCard } from "./bento-card";
import { BENTO_COPY } from "./copy";
const suggestions = [
	"What's on the schedule tomorrow?",
	"Which invoices are overdue?",
	"Create a task to change the Riveras' filter on Friday",
	"Mark the Whitfield spring cleanup as completed",
];
const chips: {
	label: string;
	prompt: string;
}[] = [
	{ label: "Tomorrow's schedule", prompt: suggestions[0] },
	{ label: "Overdue invoices", prompt: suggestions[1] },
	{ label: "Add a task", prompt: suggestions[2] },
];
const ease = [0.22, 1, 0.36, 1] as const;
const TYPE_MS = 36;
const HOLD_MS = 1800;
const ERASE_MS = 16;
const GAP_MS = 260;
const FILL_MS = 11;
const GLOW =
	"conic-gradient(from 0deg, transparent 0deg, color-mix(in oklch, var(--accent) 70%, transparent) 60deg, transparent 120deg, transparent 180deg, color-mix(in oklch, var(--accent) 40%, transparent) 240deg, transparent 300deg)";
function placeholderAt(t: number, length: number) {
	const typeEnd = length * TYPE_MS;
	const holdEnd = typeEnd + HOLD_MS;
	const eraseEnd = holdEnd + length * ERASE_MS;
	if (t < typeEnd) return { count: Math.floor(t / TYPE_MS), done: false };
	if (t < holdEnd) return { count: length, done: false };
	if (t < eraseEnd)
		return {
			count: length - Math.floor((t - holdEnd) / ERASE_MS),
			done: false,
		};
	return { count: 0, done: t >= eraseEnd + GAP_MS };
}
export function AssistantCell() {
	const reduce = !!useReducedMotion();
	const stageRef = useRef<HTMLDivElement>(null);
	const inView = useInView(stageRef, { margin: "25% 0px" });
	const [value, setValue] = useState("");
	const [manual, setManual] = useState(false);
	const [sent, setSent] = useState(false);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const [which, setWhich] = useState(0);
	const [shown, setShown] = useState(reduce ? suggestions[0].length : 0);
	const clock = useRef(0);
	const [fillTarget, setFillTarget] = useState<string | null>(null);
	useEffect(() => {
		if (fillTarget === null) return;
		const timer = window.setTimeout(
			() => {
				if (reduce || value.length + 2 >= fillTarget.length) {
					setValue(fillTarget);
					setFillTarget(null);
				} else {
					setValue(fillTarget.slice(0, value.length + 2));
				}
			},
			reduce ? 0 : FILL_MS,
		);
		return () => window.clearTimeout(timer);
	}, [fillTarget, value, reduce]);
	useEffect(() => {
		if (!inView || reduce || manual) return;
		const target = suggestions[which % suggestions.length];
		let frame = 0;
		let last = performance.now();
		const step = (now: number) => {
			clock.current += now - last;
			last = now;
			const { count, done } = placeholderAt(clock.current, target.length);
			setShown(count);
			if (done) {
				clock.current = 0;
				setWhich((w) => w + 1);
				return;
			}
			frame = requestAnimationFrame(step);
		};
		frame = requestAnimationFrame(step);
		return () => cancelAnimationFrame(frame);
	}, [inView, reduce, manual, which]);
	const placeholder = suggestions[which % suggestions.length];
	useEffect(() => {
		if (!sent) return;
		const timer = window.setTimeout(() => {
			setSent(false);
			setValue("");
			setManual(false);
		}, 1600);
		return () => window.clearTimeout(timer);
	}, [sent]);
	const fill = (prompt: string) => {
		if (sent) return;
		setManual(true);
		setValue("");
		setFillTarget(prompt);
		inputRef.current?.focus();
	};
	const send = () => {
		if (!value.trim() || sent || fillTarget) return;
		setSent(true);
	};
	const active = value.length > 0 || fillTarget !== null;
	return (
		<BentoCard {...BENTO_COPY.assistant}>
			<style>{`@keyframes assistant-cell-sweep { to { transform: rotate(360deg) } }`}</style>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,color-mix(in_oklch,var(--ink)_14%,transparent)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
			/>

			<motion.div
				ref={stageRef}
				initial={{ opacity: 0, y: reduce ? 0 : 12 }}
				whileInView={{ opacity: 1, y: 0 }}
				viewport={{ once: true, amount: 0.3 }}
				transition={{ duration: 0.7, ease }}
				className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-5"
			>
				<div className="group/composer relative w-full max-w-[400px] rounded-xl p-px">
					<div
						aria-hidden="true"
						className={`pointer-events-none absolute inset-0 overflow-hidden rounded-xl transition-opacity duration-500 ${
							active || sent
								? "opacity-100"
								: "opacity-0 group-focus-within/composer:opacity-60"
						}`}
					>
						<div
							className="absolute left-1/2 top-1/2 aspect-square w-[160%] -translate-x-1/2 -translate-y-1/2"
							style={{
								background: GLOW,
								animation: reduce
									? undefined
									: `assistant-cell-sweep ${sent ? 1.6 : 4}s linear infinite`,
							}}
						/>
					</div>
					<div className="relative rounded-[11px] border border-(--rule-2) bg-(--sheet) shadow-(--lp-shadow) transition-[border-color,box-shadow] duration-300">
						<div className="relative min-h-[64px] px-3.5 pt-3">
							{!value && (
								<span
									aria-hidden="true"
									className="pointer-events-none absolute inset-x-3.5 top-3 text-[12px] leading-relaxed text-(--ink-3)"
								>
									{placeholder.split("").map((ch, i) => (
										<span
											key={`${which}-${i}`}
											className="transition-opacity duration-200 ease-out"
											style={{ opacity: reduce || i < shown ? 1 : 0 }}
										>
											{ch}
											{!reduce && i === shown - 1 && (
												<span className="-mr-[1.5px] ml-px inline-block h-3 w-[1.5px] translate-y-[2px] rounded-full bg-(--ink-3)" />
											)}
										</span>
									))}
									{!reduce && shown === 0 && (
										<span className="absolute left-0 top-0 inline-block h-3 w-[1.5px] translate-y-[3px] rounded-full bg-(--ink-3)" />
									)}
								</span>
							)}
							<textarea
								ref={inputRef}
								readOnly={sent}
								value={value}
								onFocus={() => setManual(true)}
								onChange={(event) => {
									setManual(true);
									setFillTarget(null);
									setValue(event.target.value);
								}}
								onBlur={() => {
									if (!value) setManual(false);
								}}
								onKeyDown={(event) => {
									if (
										event.key === "Enter" &&
										!event.shiftKey &&
										!event.nativeEvent.isComposing
									) {
										event.preventDefault();
										send();
									}
								}}
								aria-label="Ask the assistant"
								rows={2}
								className="relative w-full resize-none bg-transparent text-[12px] leading-relaxed text-(--ink) focus:outline-none"
							/>
						</div>
						<div className="flex items-center justify-between px-3.5 pb-2">
							<span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-(--ink-3)">
								<Sparkles className="h-3 w-3" />
								Assistant
							</span>
							<button
								type="button"
								aria-label={sent ? "Message sent" : "Send"}
								onClick={send}
								disabled={!value.trim() || sent || fillTarget !== null}
								className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink) disabled:cursor-default ${
									value
										? "bg-(--ink) text-(--sheet) shadow-sm hover:bg-(--ink-2)"
										: "bg-(--paper) text-(--ink-3)"
								}`}
							>
								<AnimatePresence mode="wait" initial={false}>
									{sent ? (
										<motion.span
											key="sent"
											initial={{ scale: 0.5, opacity: 0 }}
											animate={{ scale: 1, opacity: 1 }}
											exit={{ scale: 0.5, opacity: 0 }}
											transition={{ duration: 0.18 }}
										>
											<Check className="h-3.5 w-3.5" />
										</motion.span>
									) : (
										<motion.span
											key="send"
											initial={{ scale: 0.5, opacity: 0 }}
											animate={{ scale: 1, opacity: 1 }}
											exit={{ scale: 0.5, opacity: 0 }}
											transition={{ duration: 0.18 }}
										>
											<ArrowUp className="h-3.5 w-3.5" />
										</motion.span>
									)}
								</AnimatePresence>
							</button>
						</div>

						<AnimatePresence>
							{sent && (
								<motion.span
									aria-hidden="true"
									initial={{ scaleX: 0, opacity: 1 }}
									animate={{ scaleX: 1 }}
									exit={{ opacity: 0 }}
									transition={{ duration: 1.4, ease }}
									className="absolute inset-x-3 bottom-0 h-px origin-left bg-(--ink)"
								/>
							)}
						</AnimatePresence>
					</div>
				</div>

				<div className="flex w-full max-w-[400px] flex-wrap justify-center gap-1.5">
					{chips.map((chip, i) => (
						<motion.button
							key={chip.label}
							type="button"
							initial={{ opacity: 0, y: 6 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true }}
							transition={{ duration: 0.45, ease, delay: 0.25 + i * 0.06 }}
							onClick={() => fill(chip.prompt)}
							disabled={sent}
							className={`cursor-pointer rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink) ${
								value === chip.prompt
									? "border-(--ink) bg-(--ink) text-(--sheet)"
									: "border-(--rule-2) bg-(--sheet) text-(--ink-2) hover:border-(--ink) hover:text-(--ink)"
							}`}
						>
							{chip.label}
						</motion.button>
					))}
				</div>
			</motion.div>
		</BentoCard>
	);
}
