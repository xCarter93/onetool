"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The 1KB workhorse: one IntersectionObserver per scene that adds `.bp-in` to
 * its own element. Every CSS-driven `.bp-draw` / `.bp-fade-in` / `.bp-rise` /
 * `.bp-stamp` descendant then fires on its own `--bp-delay`.
 *
 * This is what keeps ~80% of the blueprint markup as server components: the
 * children are never touched, only an ancestor class flips. No Motion, no
 * getTotalLength(), no per-frame React state.
 *
 * The class is toggled on the DOM node directly rather than through state: the
 * reveal is a one-way, render-irrelevant flag, and a re-render of the whole
 * scene subtree to add one class is waste.
 *
 * Fires once and disconnects — re-triggering artwork on scroll-back is the
 * cheapest-feeling tell there is.
 *
 * Failure floors, both required because `.bp-draw` ships hidden:
 *  - No IntersectionObserver support: reveal immediately.
 *  - No JS at all: the <noscript> override in <BlueprintDefs/> lands every mark
 *    on its terminal state.
 */
export function DrawIn({
	children,
	className,
	amount = 0.35,
	rootMargin = "0px 0px -10% 0px",
}: {
	children: ReactNode;
	className?: string;
	/** Fraction of the element that must be visible before the scene draws. */
	amount?: number;
	rootMargin?: string;
}) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el || el.classList.contains("bp-in")) return;

		if (typeof IntersectionObserver === "undefined") {
			el.classList.add("bp-in");
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					el.classList.add("bp-in");
					observer.disconnect();
				}
			},
			{ threshold: amount, rootMargin },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [amount, rootMargin]);

	return (
		<div ref={ref} className={cn(className)}>
			{children}
		</div>
	);
}
