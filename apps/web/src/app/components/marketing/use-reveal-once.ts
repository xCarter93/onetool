"use client";

import { useEffect, type RefObject } from "react";
import { isMotionPaused } from "./motion-pause";

/** Plays the target's section-motion.css entrance once, as its top passes 85% of the viewport. */
export function useRevealOnce(ref: RefObject<HTMLElement | null>) {
	useEffect(() => {
		const el = ref.current;
		// Already on screen (deep link, restored scroll): hiding it now would flash.
		if (
			!el ||
			el.getBoundingClientRect().top < window.innerHeight ||
			window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
			isMotionPaused()
		) {
			return;
		}
		el.dataset.reveal = "pending";
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry.isIntersecting) return;
				el.dataset.reveal = "done";
				observer.disconnect();
			},
			{ rootMargin: "0px 0px -15% 0px" },
		);
		observer.observe(el);
		return () => {
			observer.disconnect();
			if (el.dataset.reveal === "pending") delete el.dataset.reveal;
		};
	}, [ref]);
}
