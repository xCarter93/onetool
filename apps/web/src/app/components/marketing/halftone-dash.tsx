"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "./use-reduced-motion";

/* Row-based dash halftone over an image, with a pointer light. Technique from
 * twentyhq/twenty's website halftone pipeline (halftone-row-shader.ts +
 * hero-backdrop-config.ts), reimplemented on 2D canvas by the design comp and
 * ported here: horizontal dash rows whose length grows out of the artwork's
 * DARK areas, round caps, and a light that follows the pointer with eased
 * follow/damping (ported values: follow .38, damping .82). The dash color is
 * the element's computed `color`, so `text-(--accent)` themes it. */

const FOLLOW = 0.38;
const DAMPING = 0.82;

type Props = {
	src: string;
	rows?: number;
	cellRatio?: number;
	power?: number;
	maxBar?: number;
	minTone?: number;
	light?: number;
	lightRadius?: number;
	focus?: "top" | "center" | "bottom";
	/** Selector whose boxes swallow the pointer (copy blocks). */
	exclude?: string;
	className?: string;
};

export function HalftoneDash({
	src,
	rows = 30,
	cellRatio = 1,
	power = 1,
	maxBar = 0.17,
	minTone = 0,
	light = 0.8,
	lightRadius = 0.5,
	focus = "center",
	exclude,
	className,
}: Props) {
	const hostRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const reduced = usePrefersReducedMotion();

	useEffect(() => {
		const host = hostRef.current;
		const canvas = canvasRef.current;
		if (!host || !canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		let srcGrid: { W: number; H: number; lum: Float32Array; ratio: number } | null =
			null;
		let scale = 1;
		let raf = 0;
		// eased pointer state, in canvas px
		let px = -1, py = -1, tx = -1, ty = -1, vx = 0, vy = 0, lit = 0;

		// luminance grid of the source, cover-fit, sampled coarse
		const sample = (img: HTMLImageElement) => {
			const W = 220;
			const H = Math.max(1, Math.round((W * img.height) / img.width));
			const off = document.createElement("canvas");
			off.width = W;
			off.height = H;
			const g = off.getContext("2d");
			if (!g) return;
			g.drawImage(img, 0, 0, W, H);
			const d = g.getImageData(0, 0, W, H).data;
			const lum = new Float32Array(W * H);
			for (let i = 0; i < W * H; i++) {
				lum[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
			}
			srcGrid = { W, H, lum, ratio: img.width / img.height };
		};

		const resize = () => {
			const r = host.getBoundingClientRect();
			if (!r.width || !r.height) return;
			scale = Math.min(1.5, window.devicePixelRatio || 1);
			canvas.width = Math.round(r.width * scale);
			canvas.height = Math.round(r.height * scale);
		};

		const draw = () => {
			const s = srcGrid;
			if (!s || !canvas.width) return;
			const W = canvas.width;
			const H = canvas.height;
			ctx.clearRect(0, 0, W, H);

			const rowH = H / rows;
			const cellW = rowH * cellRatio;
			const lightR = lightRadius * H;

			// cover-fit the sample grid across the element
			const elRatio = W / H;
			let sw = 1, sh = 1, sx = 0, sy = 0;
			if (s.ratio > elRatio) {
				sw = elRatio / s.ratio;
				sx = (1 - sw) / 2;
			} else {
				sh = s.ratio / elRatio;
				sy = focus === "top" ? 0 : focus === "bottom" ? 1 - sh : (1 - sh) / 2;
			}

			ctx.strokeStyle = getComputedStyle(host).color;
			ctx.lineCap = "round";
			ctx.lineWidth = Math.max(1, maxBar * rowH * 2);

			const cols = Math.ceil(W / cellW);
			for (let r = 0; r < rows; r++) {
				const cy = (r + 0.5) * rowH;
				const v = sy + (cy / H) * sh;
				const iy = Math.min(s.H - 1, Math.max(0, Math.round(v * s.H)));
				// vertical fade so the field dissolves into the page at both edges
				const edge = Math.min(1, Math.min(cy, H - cy) / (H * 0.22));
				for (let k = 0; k < cols; k++) {
					const cx = (k + 0.5) * cellW;
					const u = sx + (cx / W) * sw;
					const ix = Math.min(s.W - 1, Math.max(0, Math.round(u * s.W)));
					let ink = 1 - s.lum[iy * s.W + ix]; // dashes grow from dark areas
					ink = Math.max(0, (ink - minTone) / (1 - minTone));
					let fill = Math.min(1, Math.pow(ink, 1.05) * power);
					let alpha = 0.34 + 0.5 * fill;
					if (lit > 0 && px >= 0) {
						const dx = (cx - px) / lightR;
						const dy = (cy - py) / lightR;
						const near = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
						const boost = near * near * lit * light;
						fill = Math.min(1, fill + boost * 0.55);
						alpha += boost * 0.5;
					}
					const len = fill * cellW - ctx.lineWidth;
					if (len <= 0) continue;
					ctx.globalAlpha = Math.min(1, alpha) * edge;
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
					lit = Math.min(1, lit + 1 / 18); // fadeIn 18 frames
				} else {
					lit = Math.max(0, lit - 1 / 7); // fadeOut 7 frames
				}
				draw();
				const settled = Math.abs(vx) < 0.3 && Math.abs(vy) < 0.3;
				const fading = lit > 0 && lit < 1;
				// nothing left to interpolate — park until the pointer moves again
				if (!settled || fading) raf = requestAnimationFrame(tick);
			};
			raf = requestAnimationFrame(tick);
		};

		const onMove = (e: PointerEvent) => {
			const r = host.getBoundingClientRect();
			if (
				e.clientX < r.left - 80 ||
				e.clientX > r.right + 80 ||
				e.clientY < r.top - 80 ||
				e.clientY > r.bottom + 80
			) {
				tx = -1;
				run();
				return;
			}
			if (exclude) {
				for (const node of document.querySelectorAll(exclude)) {
					const b = node.getBoundingClientRect();
					if (
						e.clientX >= b.left &&
						e.clientX <= b.right &&
						e.clientY >= b.top &&
						e.clientY <= b.bottom
					) {
						tx = -1;
						run();
						return;
					}
				}
			}
			tx = (e.clientX - r.left) * scale;
			ty = (e.clientY - r.top) * scale;
			if (px < 0) {
				px = tx;
				py = ty;
			}
			run();
		};

		const img = new Image();
		img.crossOrigin = "anonymous";
		img.decoding = "async";
		img.onload = () => {
			sample(img);
			resize();
			draw();
		};
		img.src = src;

		const ro = new ResizeObserver(() => {
			resize();
			draw();
		});
		ro.observe(host);

		// repaint when the theme flips (dash color is themed via `color`)
		const mo = new MutationObserver(() => draw());
		mo.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class", "data-theme"],
		});

		if (!reduced) window.addEventListener("pointermove", onMove, { passive: true });

		return () => {
			if (raf) cancelAnimationFrame(raf);
			ro.disconnect();
			mo.disconnect();
			window.removeEventListener("pointermove", onMove);
		};
	}, [src, rows, cellRatio, power, maxBar, minTone, light, lightRadius, focus, exclude, reduced]);

	return (
		<div ref={hostRef} aria-hidden="true" className={cn("block", className)}>
			<canvas ref={canvasRef} className="block h-full w-full" />
		</div>
	);
}
