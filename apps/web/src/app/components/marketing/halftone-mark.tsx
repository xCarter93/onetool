"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { LOGO_CHECK, LOGO_WRENCH } from "./logo-mark-data";
import { usePrefersReducedMotion } from "./use-reduced-motion";

/* The OneTool mark rendered in Twenty's row-dash halftone language: horizontal
 * dashes grow wherever the logo's own vector paths have ink, each dash keeping
 * its shape's true brand color, and a light that follows the pointer with the
 * same eased follow/damping as the hero backdrop (follow .38, damping .82).
 * Replaces the particle mark in the hero at Patrick's direction — one dash
 * grammar for the whole hero, photo field and logo alike. */

const FOLLOW = 0.38;
const DAMPING = 0.82;
const VIEWBOX = 296;
const PADDING = 0.06; // fraction of the box kept clear around the mark
const GRID = 240; // sample resolution per axis

const SHAPES = [
	{ d: LOGO_WRENCH.d, color: LOGO_WRENCH.fill },
	{ d: LOGO_CHECK.d, color: LOGO_CHECK.fill },
] as const;

export function HalftoneMark({
	rows = 44,
	cellRatio = 1.05,
	maxBar = 0.3,
	light = 0.9,
	lightRadius = 0.42,
	className,
}: {
	rows?: number;
	cellRatio?: number;
	maxBar?: number;
	light?: number;
	lightRadius?: number;
	className?: string;
}) {
	const hostRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const reduced = usePrefersReducedMotion();

	useEffect(() => {
		const host = hostRef.current;
		const canvas = canvasRef.current;
		if (!host || !canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		// coverage[i] = 0 (empty), 1 (wrench), 2 (check); alpha-weighted at edges
		let coverage: Uint8Array | null = null;
		let softness: Float32Array | null = null;
		let scale = 1;
		let raf = 0;
		let px = -1, py = -1, tx = -1, ty = -1, vx = 0, vy = 0, lit = 0;

		/* Rasterize the two paths once at sample resolution. Which-shape wins is
		   resolved by drawing the check second — the shapes don't overlap. */
		const sample = () => {
			const off = document.createElement("canvas");
			off.width = GRID;
			off.height = GRID;
			const g = off.getContext("2d");
			if (!g) return;
			const s = (GRID * (1 - PADDING * 2)) / VIEWBOX;
			g.setTransform(s, 0, 0, s, (GRID - VIEWBOX * s) / 2, (GRID - VIEWBOX * s) / 2);
			g.fillStyle = "#f00";
			g.fill(new Path2D(SHAPES[0].d));
			g.fillStyle = "#0f0";
			g.fill(new Path2D(SHAPES[1].d));
			const d = g.getImageData(0, 0, GRID, GRID).data;
			coverage = new Uint8Array(GRID * GRID);
			softness = new Float32Array(GRID * GRID);
			for (let i = 0; i < GRID * GRID; i++) {
				const a = d[i * 4 + 3] / 255;
				if (a < 0.08) continue;
				coverage[i] = d[i * 4] > d[i * 4 + 1] ? 1 : 2;
				softness[i] = a;
			}
		};

		const resize = () => {
			const r = host.getBoundingClientRect();
			if (!r.width || !r.height) return;
			scale = Math.min(1.5, window.devicePixelRatio || 1);
			canvas.width = Math.round(r.width * scale);
			canvas.height = Math.round(r.height * scale);
		};

		const draw = () => {
			if (!coverage || !softness || !canvas.width) return;
			const W = canvas.width;
			const H = canvas.height;
			ctx.clearRect(0, 0, W, H);

			const rowH = H / rows;
			const cellW = rowH * cellRatio;
			const lightR = lightRadius * H;
			ctx.lineCap = "round";
			ctx.lineWidth = Math.max(1, maxBar * rowH);

			const cols = Math.ceil(W / cellW);
			for (let r = 0; r < rows; r++) {
				const cy = (r + 0.5) * rowH;
				const iy = Math.min(GRID - 1, Math.max(0, Math.round((cy / H) * GRID)));
				for (let k = 0; k < cols; k++) {
					const cx = (k + 0.5) * cellW;
					const ix = Math.min(GRID - 1, Math.max(0, Math.round((cx / W) * GRID)));
					const shape = coverage[iy * GRID + ix];
					if (!shape) continue;
					let fill = softness[iy * GRID + ix];
					let alpha = 0.55 + 0.4 * fill;
					if (lit > 0 && px >= 0) {
						const dx = (cx - px) / lightR;
						const dy = (cy - py) / lightR;
						const near = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
						const boost = near * near * lit * light;
						fill = Math.min(1.18, fill + boost * 0.5);
						alpha = Math.min(1, alpha + boost * 0.45);
					}
					const len = fill * cellW - ctx.lineWidth * 0.6;
					if (len <= 0) continue;
					ctx.strokeStyle = SHAPES[shape - 1].color;
					ctx.globalAlpha = Math.min(1, alpha);
					ctx.beginPath();
					ctx.moveTo(cx - len / 2, cy);
					ctx.lineTo(cx + len / 2, cy);
					ctx.stroke();
				}
			}
			ctx.globalAlpha = 1;
		};

		const run = () => {
			if (raf) return;
			const tick = () => {
				raf = 0;
				if (tx >= 0) {
					vx = vx * DAMPING + (tx - px) * FOLLOW;
					vy = vy * DAMPING + (ty - py) * FOLLOW;
					px += vx;
					py += vy;
					lit = Math.min(1, lit + 1 / 18);
				} else {
					lit = Math.max(0, lit - 1 / 7);
				}
				draw();
				const settled = Math.abs(vx) < 0.3 && Math.abs(vy) < 0.3;
				const fading = lit > 0 && lit < 1;
				if (!settled || fading || (tx >= 0 && lit < 1)) raf = requestAnimationFrame(tick);
			};
			raf = requestAnimationFrame(tick);
		};

		const onMove = (e: PointerEvent) => {
			const r = host.getBoundingClientRect();
			if (
				e.clientX < r.left - 60 ||
				e.clientX > r.right + 60 ||
				e.clientY < r.top - 60 ||
				e.clientY > r.bottom + 60
			) {
				if (tx >= 0) {
					tx = -1;
					run();
				}
				return;
			}
			tx = (e.clientX - r.left) * scale;
			ty = (e.clientY - r.top) * scale;
			if (px < 0) {
				px = tx;
				py = ty;
			}
			run();
		};

		sample();
		resize();
		draw();

		const ro = new ResizeObserver(() => {
			resize();
			draw();
		});
		ro.observe(host);

		if (!reduced) window.addEventListener("pointermove", onMove, { passive: true });

		return () => {
			if (raf) cancelAnimationFrame(raf);
			ro.disconnect();
			window.removeEventListener("pointermove", onMove);
		};
	}, [rows, cellRatio, maxBar, light, lightRadius, reduced]);

	return (
		<div
			ref={hostRef}
			role="img"
			aria-label="OneTool logo"
			className={cn("block", className)}
		>
			<canvas ref={canvasRef} className="block h-full w-full" />
		</div>
	);
}
