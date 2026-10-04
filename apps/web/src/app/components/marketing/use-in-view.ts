"use client";

import { useEffect, useState, type RefObject } from "react";

type InViewOptions = {
	/** Stay true after the first entry. */
	once?: boolean;
	/** Visible fraction (0 to 1) that counts as entering. */
	amount?: number;
	/** IntersectionObserver rootMargin. */
	margin?: string;
};

/** True while the element intersects the viewport; mirrors motion's `useInView`. */
export function useInView(ref: RefObject<Element | null>, { once = false, amount = 0, margin }: InViewOptions = {}) {
	const [inView, setInView] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[entries.length - 1];
				if (entry.isIntersecting) {
					setInView(true);
					if (once) observer.disconnect();
				} else if (!once) {
					setInView(false);
				}
			},
			{ rootMargin: margin, threshold: amount },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [ref, once, amount, margin]);

	return inView;
}
