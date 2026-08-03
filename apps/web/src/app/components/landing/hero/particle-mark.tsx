"use client";

import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "../use-reduced-motion";
import { LOGO_CHECK, LOGO_WRENCH } from "./logo-mark-data";

/**
 * The hero mark as particles: the real OneTool logo rasterized from its own
 * path data, each particle keeping the pixel's true brand color. Particles
 * assemble on load, scatter under the pointer, and settle back into the mark.
 *
 * No CAD layer — this replaced the drafted-part treatment (construction
 * geometry, centrelines, dimensions, QA stamp) at Patrick's direction.
 *
 * Reduced motion: the paths are painted once, statically, on the same canvas.
 * The rAF loop runs only while the plate is on screen.
 */

const VIEWBOX = 296;
/** Fraction of the canvas left as margin around the 296-space artwork. */
const PADDING = 0.04;
const STEP = 3; // sample stride in CSS px — density knob
const SIZE = 2.4; // particle edge in CSS px
const EASE = 0.06;
const FRICTION = 0.84;
const MOUSE_RADIUS = 120;
const MOUSE_STRENGTH = 4.2;

interface Particle {
	x: number;
	y: number;
	ox: number;
	oy: number;
	vx: number;
	vy: number;
	color: string;
}

function paintMark(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
) {
	const scale = (Math.min(width, height) * (1 - PADDING * 2)) / VIEWBOX;
	const dx = (width - VIEWBOX * scale) / 2;
	const dy = (height - VIEWBOX * scale) / 2;
	ctx.setTransform(scale, 0, 0, scale, dx, dy);
	for (const shape of [LOGO_WRENCH, LOGO_CHECK]) {
		ctx.fillStyle = shape.fill;
		ctx.fill(new Path2D(shape.d));
	}
	ctx.setTransform(1, 0, 0, 1, 0, 0);
}

export function ParticleMark({ className }: { className?: string }) {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const reduced = usePrefersReducedMotion();

	useEffect(() => {
		const container = containerRef.current;
		const canvas = canvasRef.current;
		if (!container || !canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		let particles: Particle[] = [];
		let frame = 0;
		let running = false;
		const mouse = { x: -1e4, y: -1e4, active: false };

		const init = () => {
			canvas.width = container.clientWidth * dpr;
			canvas.height = container.clientHeight * dpr;
			if (canvas.width === 0 || canvas.height === 0) return;

			if (reduced) {
				// Terminal state: the mark itself, no particles, no loop.
				paintMark(ctx, canvas.width, canvas.height);
				return;
			}

			const off = document.createElement("canvas");
			off.width = canvas.width;
			off.height = canvas.height;
			const offCtx = off.getContext("2d");
			if (!offCtx) return;
			paintMark(offCtx, off.width, off.height);

			const data = offCtx.getImageData(0, 0, off.width, off.height).data;
			const step = Math.max(1, Math.round(STEP * dpr));
			const next: Particle[] = [];
			for (let y = 0; y < off.height; y += step) {
				for (let x = 0; x < off.width; x += step) {
					const i = (y * off.width + x) * 4;
					if (data[i + 3] > 128) {
						next.push({
							x: Math.random() * off.width,
							y: Math.random() * off.height,
							ox: x,
							oy: y,
							vx: 0,
							vy: 0,
							color: `rgb(${data[i]} ${data[i + 1]} ${data[i + 2]})`,
						});
					}
				}
			}
			particles = next;
		};

		const tick = () => {
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			const size = SIZE * dpr;
			const radius = MOUSE_RADIUS * dpr;
			for (const p of particles) {
				let fx = 0;
				let fy = 0;
				if (mouse.active) {
					const mdx = mouse.x * dpr - p.x;
					const mdy = mouse.y * dpr - p.y;
					const dist = Math.hypot(mdx, mdy);
					if (dist < radius && dist > 0) {
						const force = (radius - dist) / radius;
						fx = (-mdx / dist) * force * MOUSE_STRENGTH * 5;
						fy = (-mdy / dist) * force * MOUSE_STRENGTH * 5;
					}
				}
				p.vx = (p.vx + (p.ox - p.x) * EASE + fx) * FRICTION;
				p.vy = (p.vy + (p.oy - p.y) * EASE + fy) * FRICTION;
				p.x += p.vx;
				p.y += p.vy;
				ctx.fillStyle = p.color;
				ctx.fillRect(Math.round(p.x), Math.round(p.y), size, size);
			}
			frame = requestAnimationFrame(tick);
		};

		const start = () => {
			if (running || reduced) return;
			running = true;
			frame = requestAnimationFrame(tick);
		};
		const stop = () => {
			running = false;
			cancelAnimationFrame(frame);
		};

		init();

		// Run the loop only while the plate is actually on screen.
		const io = new IntersectionObserver(([entry]) => {
			if (entry.isIntersecting) start();
			else stop();
		});
		io.observe(container);

		const ro = new ResizeObserver(() => init());
		ro.observe(container);

		const onMove = (e: MouseEvent) => {
			const rect = canvas.getBoundingClientRect();
			mouse.x = e.clientX - rect.left;
			mouse.y = e.clientY - rect.top;
			mouse.active = true;
		};
		const onLeave = () => {
			mouse.active = false;
		};
		const onTouch = (e: TouchEvent) => {
			const rect = canvas.getBoundingClientRect();
			mouse.x = e.touches[0].clientX - rect.left;
			mouse.y = e.touches[0].clientY - rect.top;
			mouse.active = true;
		};
		container.addEventListener("mousemove", onMove);
		container.addEventListener("mouseleave", onLeave);
		container.addEventListener("touchmove", onTouch, { passive: true });
		container.addEventListener("touchend", onLeave);

		return () => {
			stop();
			io.disconnect();
			ro.disconnect();
			container.removeEventListener("mousemove", onMove);
			container.removeEventListener("mouseleave", onLeave);
			container.removeEventListener("touchmove", onTouch);
			container.removeEventListener("touchend", onLeave);
		};
	}, [reduced]);

	return (
		<div
			ref={containerRef}
			role="img"
			aria-label="OneTool logo"
			className={`aspect-square w-full ${className ?? ""}`}
		>
			<canvas ref={canvasRef} className="block h-full w-full" />
		</div>
	);
}
