"use client";

import { useEffect, type RefObject } from "react";

/** Loads the lazy screenshot a viewport early and sets data-ready once it decodes, so the reveal never opens on an empty screen. */
export function usePreloadScreen(ref: RefObject<HTMLDivElement | null>) {
	useEffect(() => {
		const frame = ref.current;
		const img = frame?.querySelector("img");
		if (!frame || !img) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry.isIntersecting) return;
				observer.disconnect();
				img.loading = "eager";
				img.decode()
					.catch(() => {})
					.finally(() => {
						frame.dataset.ready = "";
					});
			},
			{ rootMargin: "100% 0px" },
		);
		observer.observe(frame);
		return () => observer.disconnect();
	}, [ref]);
}
