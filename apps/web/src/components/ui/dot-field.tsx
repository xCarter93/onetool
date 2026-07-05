"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

// Deterministic per-dot value so the field reads as noise, not a flat grid.
function grain(i: number, j: number) {
	const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
	return n - Math.floor(n);
}

// Vendored from ReUI @reui/chart-1. A dense grid of dots at varied per-dot
// brightness, painted to canvas and repainted on resize/theme change. Dot color
// resolves from the element's `color` token so it stays neutral in both themes;
// mask the element to shape where the field shows.
export function DotField({ className }: { className?: string }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const GAP = 3; // dot spacing in px
		const DOT = 1.5; // dot side in px
		const BASE = 0.05; // dim end of a dot
		const PEAK = 0.32; // bright end of a dot (subtle for a card surface)

		const draw = () => {
			const rect = canvas.getBoundingClientRect();
			if (!rect.width || !rect.height) return;

			// Resetting width clears the canvas and restores the identity transform.
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			canvas.width = Math.round(rect.width * dpr);
			canvas.height = Math.round(rect.height * dpr);

			// Resolve the token to concrete sRGB by painting + reading it back, so
			// oklch never casts a color and dark mode recolors on theme change.
			ctx.fillStyle = getComputedStyle(canvas).color || "rgb(115,115,115)";
			ctx.fillRect(0, 0, 1, 1);
			const px = ctx.getImageData(0, 0, 1, 1).data;
			const color = `rgb(${px[0]}, ${px[1]}, ${px[2]})`;

			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.clearRect(0, 0, rect.width, rect.height);
			ctx.fillStyle = color;

			const cols = Math.ceil(rect.width / GAP) + 1;
			const rows = Math.ceil(rect.height / GAP) + 1;
			for (let i = 0; i < cols; i++) {
				const x = i * GAP;
				for (let j = 0; j < rows; j++) {
					const q = grain(i, j);
					const amp = 0.7 + 0.6 * grain(j * 2 + 1, i * 2 + 1);
					let a = (BASE + (PEAK - BASE) * q * q) * amp;
					if (a > 1) a = 1;
					ctx.globalAlpha = a;
					ctx.fillRect(x, j * GAP, DOT, DOT);
				}
			}
			ctx.globalAlpha = 1;
		};

		draw();

		const resizeObserver = new ResizeObserver(() => draw());
		resizeObserver.observe(canvas);

		// Repaint when the theme class toggles so the resolved color stays correct.
		const themeObserver = new MutationObserver(() => draw());
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class", "style"],
		});

		return () => {
			resizeObserver.disconnect();
			themeObserver.disconnect();
		};
	}, []);

	return (
		<canvas
			ref={canvasRef}
			aria-hidden="true"
			className={cn(
				"pointer-events-none absolute inset-0 h-full w-full",
				className
			)}
		/>
	);
}
