"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/* Confirmation toasts for the Try-it simulation, stacked at the bottom-right of
 * the viewport. Deliberately NOT the app's `useToast()`: the marketing layout
 * mounts no sonner Toaster, and mounting one would drag workspace tokens onto
 * paper. Entry/exit is a CSS transition + @starting-style (landing.css) rather
 * than a keyframe, because these stack and a keyframe restarts from zero when a
 * second one lands mid-entrance.
 *
 * Mount the stack OUTSIDE the simulation's cursor surface: inside it, hovering a
 * toast would hide the OS pointer over its own dismiss control. */

export type SimToastTone = "ink" | "paid";

export type SimToast = {
	id: number;
	title: string;
	body: string;
	tone: SimToastTone;
	leaving?: boolean;
};

const LIFE_MS = 5000;
const EXIT_MS = 200;
/** Three is the whole story on screen at once; older ones drop off the top. */
const MAX_VISIBLE = 3;

export function useSimToasts() {
	const [toasts, setToasts] = useState<SimToast[]>([]);
	const timers = useRef<number[]>([]);
	const seq = useRef(0);

	const dismiss = useCallback((id: number) => {
		setToasts((prev) =>
			prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))
		);
		timers.current.push(
			window.setTimeout(
				() => setToasts((prev) => prev.filter((t) => t.id !== id)),
				EXIT_MS
			)
		);
	}, []);

	const push = useCallback(
		(title: string, body: string, tone: SimToastTone = "ink") => {
			seq.current += 1;
			const id = seq.current;
			setToasts((prev) =>
				[...prev, { id, title, body, tone }].slice(-MAX_VISIBLE)
			);
			timers.current.push(window.setTimeout(() => dismiss(id), LIFE_MS));
		},
		[dismiss]
	);

	const clear = useCallback(() => {
		timers.current.forEach(clearTimeout);
		timers.current = [];
		setToasts([]);
	}, []);

	// Capture the ref object, not the array: clear() swaps the array out, so a
	// captured array would leave the live timers running past unmount.
	useEffect(() => {
		const pending = timers;
		return () => pending.current.forEach(clearTimeout);
	}, []);

	return { toasts, push, dismiss, clear };
}

/** No dismiss control on purpose: these auto-clear in five seconds and the
 *  whole stack stays pointer-transparent, so it can never sit on top of
 *  something the visitor is reaching for. */
export function SimToastStack({ toasts }: { toasts: SimToast[] }) {
	return (
		<div
			role="status"
			aria-live="polite"
			className="pointer-events-none fixed bottom-[clamp(16px,3vw,28px)] right-[clamp(16px,3vw,28px)] z-[60] flex w-[min(340px,calc(100vw-32px))] flex-col gap-2"
		>
			{toasts.map((toast) => (
				<div
					key={toast.id}
					data-leaving={toast.leaving ? "true" : undefined}
					className="lp-toast flex items-start gap-3 rounded-[12px] border border-(--rule-2) bg-(--sheet) px-4 py-3 shadow-(--lp-shadow)"
				>
					<span
						aria-hidden="true"
						className={cn(
							"mt-[2px] grid h-[19px] w-[19px] flex-none place-items-center rounded-full text-[10px] font-bold leading-none",
							toast.tone === "paid"
								? "bg-(--paid-wash) text-(--paid)"
								: "bg-(--accent-wash) text-(--accent-ink)"
						)}
					>
						&#10003;
					</span>
					<div className="min-w-0 flex-1">
						<p className="text-[14px] font-semibold leading-[1.35] tracking-[-0.01em] text-(--ink)">
							{toast.title}
						</p>
						<p className="mt-[3px] text-[13px] leading-[1.45] text-(--ink-2) text-pretty">
							{toast.body}
						</p>
					</div>
				</div>
			))}
		</div>
	);
}
