"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { Figure } from "@lucasmarkes/hairline";

const TOKENS = {
	aspectRatio: "5 / 4",
	"--hairline-plate": "var(--background)",
	"--hairline-hi": "var(--primary)",
	"--hairline-edge": "var(--muted-foreground)",
	"--hairline-mid":
		"color-mix(in oklab, var(--muted-foreground) 55%, var(--background))",
	"--hairline-lo": "var(--border)",
} as CSSProperties;

// The vanilla entry, not the React one: its components module pulls in all 33 figures.
export function NotFoundFigure({ className }: { className?: string }) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let figure: Figure | undefined;
		let unmounted = false;
		// Root not-found's client chunks load on every route; keep the engine out of them.
		import("@lucasmarkes/hairline").then(({ plug }) => {
			if (!unmounted) figure = plug(ref.current!);
		});
		return () => {
			unmounted = true;
			figure?.destroy();
		};
	}, []);

	return <div ref={ref} aria-hidden className={className} style={TOKENS} />;
}
