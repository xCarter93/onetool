"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Canvas re-implementation of React Bits Pro "blinking-squares".
 *
 * The stock component renders this via three.js + @react-three/fiber, but
 * R3F v9's types globally merge ThreeElements into React's
 * JSX.IntrinsicElements, which collapses every polymorphic ElementType
 * component in the repo to `never` props. The effect is a pure fragment
 * shader — a grid of hash-gated squares with a density gradient and a sine
 * twinkle — so it ports 1:1 to 2D canvas with the same props and no WebGL
 * runtime.
 */

export type BlinkingSquaresDirection = "right" | "left" | "top" | "bottom";

export interface BlinkingSquaresProps {
	width?: string | number;
	height?: string | number;
	className?: string;
	children?: React.ReactNode;
	/** Edge the dense squares anchor to; the grid fades out the other way. */
	direction?: BlinkingSquaresDirection;
	/** Number of grid cells along the long axis. */
	gridSize?: number;
	/** Square color (hex). */
	squareColor?: string;
	/** Kept for API parity; the canvas stays transparent over the page. */
	backgroundColor?: string;
	/** Sharpness of the density ramp between fadeStart and fadeEnd. */
	falloff?: number;
	/** Where density starts along `direction`, 0..1. */
	fadeStart?: number;
	/** Where density reaches full, 0..1. */
	fadeEnd?: number;
	/** Square fill fraction of each cell (0–1). */
	squareSize?: number;
	/** Min brightness of a lit cell. */
	minBrightness?: number;
	/** Per-cell twinkle rate, cycles/second. */
	twinkleSpeed?: number;
	/** Strength of the brightness oscillation (0–1). */
	twinkleStrength?: number;
	/** Master brightness multiplier. */
	intensity?: number;
	/** Master alpha. */
	opacity?: number;
	/** Max device pixel ratio. */
	dpr?: number;
}

/** Mirrors the shader's hash21. */
function hash21(x: number, y: number): number {
	let px = (x * 123.34) % 1;
	let py = (y * 456.21) % 1;
	if (px < 0) px += 1;
	if (py < 0) py += 1;
	const d = px * (px + 45.32) + py * (py + 45.32);
	px = (px + d) % 1;
	py = (py + d) % 1;
	const v = (px * py * 951.135) % 1;
	return v < 0 ? v + 1 : v;
}

function hexToRgb(hex: string): [number, number, number] {
	const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!m) return [0, 0, 0];
	return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

const BlinkingSquares: React.FC<BlinkingSquaresProps> = ({
	width = "100%",
	height = "100%",
	className,
	children,
	direction = "right",
	gridSize = 52,
	squareColor = "#BB29FF",
	falloff = 1.25,
	fadeStart = 0.65,
	fadeEnd = 1,
	squareSize = 0.57,
	minBrightness = 0.55,
	twinkleSpeed = 1.4,
	twinkleStrength = 0.94,
	intensity = 1,
	opacity = 1,
	dpr = 1.5,
}) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const container = containerRef.current;
		const canvas = canvasRef.current;
		if (!container || !canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const ratio = Math.min(window.devicePixelRatio || 1, dpr);
		const [r, g, b] = hexToRgb(squareColor);
		const [dirX, dirY] =
			direction === "left"
				? [-1, 0]
				: direction === "top"
					? [0, 1]
					: direction === "bottom"
						? [0, -1]
						: [1, 0];

		type Cell = {
			x: number;
			y: number;
			size: number;
			base: number;
			speed: number;
			phase: number;
		};
		let cells: Cell[] = [];
		let frame = 0;

		const init = () => {
			canvas.width = container.clientWidth * ratio;
			canvas.height = container.clientHeight * ratio;
			if (!canvas.width || !canvas.height) return;

			const aspect = canvas.width / canvas.height;
			const cols = Math.round(aspect >= 1 ? gridSize * aspect : gridSize);
			const rows = Math.round(aspect >= 1 ? gridSize : gridSize / aspect);
			const cellW = canvas.width / cols;
			const cellH = canvas.height / rows;
			const fs = Math.min(fadeStart, 0.999);
			const fe = Math.max(fadeEnd, fs + 0.001);
			const side = Math.min(cellW, cellH) * Math.min(squareSize, 0.98);

			const next: Cell[] = [];
			for (let cy = 0; cy < rows; cy++) {
				for (let cx = 0; cx < cols; cx++) {
					// Cell center in -1..1, projected onto the fade direction.
					const px = ((cx + 0.5) / cols) * 2 - 1;
					const py = (1 - (cy + 0.5) / rows) * 2 - 1;
					const t = Math.min(
						Math.max((px * dirX + py * dirY) * 0.5 + 0.5, 0),
						1,
					);
					const density = Math.pow(
						Math.min(Math.max((t - fs) / (fe - fs), 0), 1),
						Math.max(falloff, 0.0001),
					);
					if (hash21(cx + 11.7, cy + 11.7) > density) continue;
					const bRnd = hash21(cx + 47.3, cy + 47.3);
					next.push({
						x: cx * cellW + (cellW - side) / 2,
						y: cy * cellH + (cellH - side) / 2,
						size: side,
						base: minBrightness + (1 - minBrightness) * bRnd,
						speed: twinkleSpeed * (0.6 + 0.8 * bRnd),
						phase: hash21(cx + 91.1, cy + 91.1) * Math.PI * 2,
					});
				}
			}
			cells = next;
		};

		const tick = (now: number) => {
			const t = now / 1000;
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			for (const c of cells) {
				const pulse = 0.5 + 0.5 * Math.sin(t * c.speed + c.phase);
				const twinkle = 1 - twinkleStrength + twinkleStrength * pulse;
				const alpha = Math.min(c.base * twinkle * intensity, 1) * opacity;
				if (alpha <= 0.004) continue;
				ctx.fillStyle = `rgba(${r} ${g} ${b} / ${alpha.toFixed(3)})`;
				ctx.fillRect(c.x, c.y, c.size, c.size);
			}
			frame = requestAnimationFrame(tick);
		};

		init();
		frame = requestAnimationFrame(tick);
		const ro = new ResizeObserver(() => init());
		ro.observe(container);

		return () => {
			cancelAnimationFrame(frame);
			ro.disconnect();
		};
	}, [
		direction,
		gridSize,
		squareColor,
		falloff,
		fadeStart,
		fadeEnd,
		squareSize,
		minBrightness,
		twinkleSpeed,
		twinkleStrength,
		intensity,
		opacity,
		dpr,
	]);

	return (
		<div
			ref={containerRef}
			className={cn("relative overflow-hidden", className)}
			style={{ width, height }}
		>
			<canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
			{children && <div className="relative z-10">{children}</div>}
		</div>
	);
};

BlinkingSquares.displayName = "BlinkingSquares";

export default BlinkingSquares;
