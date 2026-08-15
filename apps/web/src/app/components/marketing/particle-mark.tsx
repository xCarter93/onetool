"use client";

import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "./use-reduced-motion";
import { LOGO_CHECK, LOGO_WRENCH } from "./logo-mark-data";

/**
 * The hero mark as particles: the real OneTool logo traced from its own path
 * data, each particle keeping the pixel's true brand color. The particles are
 * the *outline* only — the interior is painted with the same diagonal-stripe
 * fill the report charts use (ChartStripeDefs), and that fill only shows while
 * the mark is settled. Disturb the particles and the fill drops out; hold still
 * and it eases back in once they've been home for SETTLE_DELAY.
 *
 * No CAD layer — this replaced the drafted-part treatment (construction
 * geometry, centrelines, dimensions, QA stamp) at Patrick's direction.
 *
 * Reduced motion: outline + fill are painted once, statically, on the same
 * canvas. The rAF loop runs only while the plate is on screen.
 */

const VIEWBOX = 296;
/** Fraction of the canvas left as margin around the 296-space artwork. */
const PADDING = 0.04;
const STEP = 2; // sample stride in CSS px — density knob
const SIZE = 2; // particle edge in CSS px
const OUTLINE_WIDTH = 3.4; // traced stroke in CSS px — the particle band
const EASE = 0.06;
const FRICTION = 0.84;
const MOUSE_RADIUS = 120;
const MOUSE_STRENGTH = 4.2;
/** Largest particle offset (CSS px) still counted as "in place". */
const SETTLE_EPS = 2;
/** How long the mark must hold still before the stripe fill returns. */
const SETTLE_DELAY = 650;
/** Per-frame lerp rates — fill leaves fast, comes back slowly. */
const FILL_IN = 0.05;
const FILL_OUT = 0.22;

const SHAPES = [LOGO_WRENCH, LOGO_CHECK];

interface Particle {
	x: number;
	y: number;
	ox: number;
	oy: number;
	vx: number;
	vy: number;
	color: string;
}

/** Runs `draw` with the 296-space artwork mapped onto the canvas, then resets. */
function withMarkTransform(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	draw: (scale: number) => void,
) {
	const scale = (Math.min(width, height) * (1 - PADDING * 2)) / VIEWBOX;
	const dx = (width - VIEWBOX * scale) / 2;
	const dy = (height - VIEWBOX * scale) / 2;
	ctx.setTransform(scale, 0, 0, scale, dx, dy);
	draw(scale);
	ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function paintOutline(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	dpr: number,
) {
	withMarkTransform(ctx, width, height, (scale) => {
		ctx.lineJoin = "round";
		ctx.lineCap = "round";
		for (const shape of SHAPES) {
			ctx.strokeStyle = shape.fill;
			// Divide by scale so the band is OUTLINE_WIDTH CSS px at any plate size.
			ctx.lineWidth = (OUTLINE_WIDTH * dpr) / scale;
			ctx.stroke(new Path2D(shape.d));
		}
	});
}

function line(
	ctx: CanvasRenderingContext2D,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
) {
	ctx.beginPath();
	ctx.moveTo(x1, y1);
	ctx.lineTo(x2, y2);
	ctx.stroke();
}

/**
 * The reports diagonal-stripe fill as a canvas pattern — same 8-unit tile,
 * opacities and stroke widths as `ChartStripeDefs`, so the hero and the report
 * charts print the same texture.
 */
function stripePattern(
	ctx: CanvasRenderingContext2D,
	color: string,
	dpr: number,
): CanvasPattern | null {
	const tile = document.createElement("canvas");
	const size = Math.max(8, Math.round(8 * dpr));
	tile.width = size;
	tile.height = size;
	const t = tile.getContext("2d");
	if (!t) return null;

	t.scale(size / 8, size / 8);
	t.fillStyle = color;
	t.strokeStyle = color;

	t.globalAlpha = 0.1;
	t.fillRect(0, 0, 8, 8);

	t.globalAlpha = 0.6;
	t.lineWidth = 1.5;
	line(t, 0, 8, 8, 0);
	line(t, 4, 12, 12, 4);
	line(t, -4, 4, 4, -4);

	t.globalAlpha = 0.3;
	t.lineWidth = 1;
	line(t, 2, 10, 10, 2);
	line(t, 6, 14, 14, 6);
	line(t, -2, 6, 6, -2);

	return ctx.createPattern(tile, "repeat");
}

/**
 * Both shapes' interiors, striped in their own brand color, baked once into an
 * offscreen canvas — the loop then costs a single drawImage per frame.
 */
function buildFillLayer(
	width: number,
	height: number,
	dpr: number,
): HTMLCanvasElement | null {
	const layer = document.createElement("canvas");
	layer.width = width;
	layer.height = height;
	const lc = layer.getContext("2d");
	const scratch = document.createElement("canvas");
	scratch.width = width;
	scratch.height = height;
	const sc = scratch.getContext("2d");
	if (!lc || !sc) return null;

	for (const shape of SHAPES) {
		const pattern = stripePattern(sc, shape.fill, dpr);
		if (!pattern) continue;
		sc.setTransform(1, 0, 0, 1, 0, 0);
		sc.clearRect(0, 0, width, height);
		// Stripes are laid down untransformed so their pitch stays constant on
		// screen instead of scaling with the mark.
		sc.fillStyle = pattern;
		sc.fillRect(0, 0, width, height);
		sc.globalCompositeOperation = "destination-in";
		withMarkTransform(sc, width, height, () => {
			sc.fillStyle = "#000";
			sc.fill(new Path2D(shape.d));
		});
		sc.globalCompositeOperation = "source-over";
		lc.drawImage(scratch, 0, 0);
	}
	return layer;
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
		let fillLayer: HTMLCanvasElement | null = null;
		let fillAlpha = 0;
		let settledMs = 0;
		let lastTime = 0;
		let frame = 0;
		let running = false;
		let visible = false;
		const mouse = { x: -1e4, y: -1e4, active: false };

		const init = () => {
			canvas.width = container.clientWidth * dpr;
			canvas.height = container.clientHeight * dpr;
			if (canvas.width === 0 || canvas.height === 0) return;

			fillLayer = buildFillLayer(canvas.width, canvas.height, dpr);

			if (reduced) {
				// Terminal state: settled mark, fill shown, no particles, no loop.
				ctx.setTransform(1, 0, 0, 1, 0, 0);
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				if (fillLayer) ctx.drawImage(fillLayer, 0, 0);
				paintOutline(ctx, canvas.width, canvas.height, dpr);
				return;
			}

			fillAlpha = 0;
			settledMs = 0;
			lastTime = 0;

			const off = document.createElement("canvas");
			off.width = canvas.width;
			off.height = canvas.height;
			const offCtx = off.getContext("2d");
			if (!offCtx) return;
			paintOutline(offCtx, off.width, off.height, dpr);

			const data = offCtx.getImageData(0, 0, off.width, off.height).data;
			const step = Math.max(1, Math.round(STEP * dpr));
			const next: Particle[] = [];
			for (let y = 0; y < off.height; y += step) {
				for (let x = 0; x < off.width; x += step) {
					const i = (y * off.width + x) * 4;
					// Above the antialiased skirt, so particles keep the true brand hue.
					if (data[i + 3] > 200) {
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

		const tick = (time: number) => {
			const delta = lastTime ? Math.min(time - lastTime, 64) : 16;
			lastTime = time;

			const size = SIZE * dpr;
			const radius = MOUSE_RADIUS * dpr;
			let maxOffset = 0;

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
				const offset = Math.hypot(p.x - p.ox, p.y - p.oy);
				if (offset > maxOffset) maxOffset = offset;
			}

			// One particle knocked out of place is enough to pull the fill: the
			// mark reads as "in hand" the moment anything moves.
			settledMs = maxOffset < SETTLE_EPS * dpr ? settledMs + delta : 0;
			const target = settledMs >= SETTLE_DELAY ? 1 : 0;
			fillAlpha += (target - fillAlpha) * (target > fillAlpha ? FILL_IN : FILL_OUT);

			ctx.clearRect(0, 0, canvas.width, canvas.height);
			if (fillLayer && fillAlpha > 0.01) {
				ctx.globalAlpha = Math.min(fillAlpha, 1);
				ctx.drawImage(fillLayer, 0, 0);
				ctx.globalAlpha = 1;
			}
			for (const p of particles) {
				ctx.fillStyle = p.color;
				ctx.fillRect(Math.round(p.x), Math.round(p.y), size, size);
			}

			// Idle stop. Fill fully in, nothing displaced, pointer away: there is
			// nothing left to integrate, so park the loop instead of burning a
			// frame a tick forever. Pointer or observer wakes it.
			if (!mouse.active && maxOffset < SETTLE_EPS * dpr && fillAlpha > 0.995) {
				running = false;
				lastTime = 0;
				return;
			}

			frame = requestAnimationFrame(tick);
		};

		const start = () => {
			if (running || reduced || !visible) return;
			running = true;
			frame = requestAnimationFrame(tick);
		};
		const stop = () => {
			running = false;
			// Drop the stale timestamp so re-entering the viewport doesn't bank a
			// multi-second delta into the settle timer.
			lastTime = 0;
			cancelAnimationFrame(frame);
		};

		init();

		// Run the loop only while the plate is actually on screen.
		const io = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
			if (visible) start();
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
			start();
		};
		const onLeave = () => {
			mouse.active = false;
			// Wake so the particles can walk home and the fill can ease back.
			start();
		};
		const onTouch = (e: TouchEvent) => {
			const rect = canvas.getBoundingClientRect();
			mouse.x = e.touches[0].clientX - rect.left;
			mouse.y = e.touches[0].clientY - rect.top;
			mouse.active = true;
			start();
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
