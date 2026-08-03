"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Falloff = "linear" | "smooth" | "sharp";

export interface CursorGridProps {
	/** Lattice pitch in px. Omit to read `--bp-grid-major` at mount (the printed pitch). */
	cellSize?: number;
	/** Omit to read `--primary` at mount and on every theme toggle. */
	color?: string;
	radius?: number;
	falloff?: Falloff;
	holdTime?: number;
	fadeDuration?: number;
	lineWidth?: number;
	maxOpacity?: number;
	fillOpacity?: number;
	/** Canvas-drawn static lattice. Stays 0 here — the CSS layer already prints it. */
	gridOpacity?: number;
	cellRadius?: number;
	clickPulse?: boolean;
	pulseSpeed?: number;
	/**
	 * Ramp-in depth from the top of the sheet, in px. Mirrors the printed layer's
	 * `linear-gradient(to bottom, transparent, #000 7rem)` mask, which a
	 * viewport-fixed canvas cannot inherit as CSS (that mask is document-relative).
	 */
	topFade?: number;
	className?: string;
}

interface GridConfig {
	radius: number;
	falloff: Falloff;
	holdTime: number;
	fadeDuration: number;
	lineWidth: number;
	maxOpacity: number;
	fillOpacity: number;
	gridOpacity: number;
	cellRadius: number;
	clickPulse: boolean;
	pulseSpeed: number;
	topFade: number;
}

interface Pulse {
	/** Lattice-local, so a pulse stays pinned to the sheet while the page scrolls. */
	x: number;
	y: number;
	t0: number;
}

const FALLOFF_CURVES: Record<Falloff, (t: number) => number> = {
	linear: (t) => t,
	smooth: (t) => t * t * (3 - 2 * t),
	sharp: (t) => t * t * t,
};

const FALLBACK_CELL = 40;

/**
 * The printed layer's horizontal centre dim, as a function. Same stops as the
 * `linear-gradient(to right, #000, rgba(0,0,0,0.42) 28%, ... 72%, #000)` mask on
 * `bp-graphpaper`, but evaluated in *sheet* space — a viewport-fixed canvas
 * cannot inherit that mask, and applying it as CSS would key it to the viewport
 * instead of the inset sheet.
 */
const DIM_FLOOR = 0.42;
const DIM_IN = 0.28;
const DIM_OUT = 0.72;
const centreDim = (f: number) => {
	if (f <= 0 || f >= 1) return 1;
	if (f < DIM_IN) return 1 - (1 - DIM_FLOOR) * (f / DIM_IN);
	if (f > DIM_OUT)
		return DIM_FLOOR + (1 - DIM_FLOOR) * ((f - DIM_OUT) / (1 - DIM_OUT));
	return DIM_FLOOR;
};

/**
 * The drafting sheet responding to the pointer: cells of the *printed*
 * `bp-graphpaper` lattice brighten under the cursor and ripple outward on click.
 *
 * Two geometries are in play and must not be confused:
 * - the canvas is **viewport-fixed** (constant pixel budget, no Safari canvas-area
 *   risk on a page many viewports tall, draw loop culled to what is on screen);
 * - all state and hit-testing live in **lattice-local** coordinates, taken from a
 *   sizer div that is `absolute inset-0` of the same parent that paints
 *   `bp-graphpaper` — identical origin and size, so cell k lands exactly on
 *   printed line k. The CSS layer's `background-position: -0.5px` centers its
 *   1px major line on element-x `k * cellSize`, which is why cell rects are
 *   stroked on that integer with no half-pixel fudge.
 */
export function CursorGrid({
	cellSize,
	color,
	radius = 140,
	falloff = "smooth",
	holdTime = 400,
	fadeDuration = 800,
	lineWidth = 1,
	maxOpacity = 0.35,
	fillOpacity = 0.06,
	gridOpacity = 0,
	cellRadius = 0,
	clickPulse = true,
	pulseSpeed = 600,
	topFade = 112,
	className,
}: CursorGridProps) {
	const sizerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const wakeRef = useRef<(() => void) | null>(null);

	// Fine pointer + motion preference are the two hard gates; both are live so a
	// hybrid device or an OS-level preference change takes effect without a reload.
	const [enabled, setEnabled] = useState(false);

	useEffect(() => {
		const fine = window.matchMedia("(pointer: fine)");
		const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
		const sync = () => setEnabled(fine.matches && !reduced.matches);
		sync();
		fine.addEventListener("change", sync);
		reduced.addEventListener("change", sync);
		return () => {
			fine.removeEventListener("change", sync);
			reduced.removeEventListener("change", sync);
		};
	}, []);

	const config = useMemo<GridConfig>(
		() => ({
			radius,
			falloff,
			holdTime,
			fadeDuration,
			lineWidth,
			maxOpacity,
			fillOpacity,
			gridOpacity,
			cellRadius,
			clickPulse,
			pulseSpeed,
			topFade,
		}),
		[
			radius,
			falloff,
			holdTime,
			fadeDuration,
			lineWidth,
			maxOpacity,
			fillOpacity,
			gridOpacity,
			cellRadius,
			clickPulse,
			pulseSpeed,
			topFade,
		],
	);
	const configRef = useRef(config);

	useEffect(() => {
		configRef.current = config;
		wakeRef.current?.();
	}, [config]);

	useEffect(() => {
		if (!enabled) return;
		const sizer = sizerRef.current;
		const canvas = canvasRef.current;
		if (!sizer || !canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);

		const cell =
			cellSize ??
			parseFloat(getComputedStyle(sizer).getPropertyValue("--bp-grid-major"));
		const pitch = Number.isFinite(cell) && cell > 0 ? cell : FALLBACK_CELL;

		// Highlighted cells respond in brand sky, not the print ink. Each theme
		// needs its own pair: light paper takes --cta-solid (the brand #00A6F4 at
		// 0.35 alpha all but vanishes on white) with a moderate boost; the dark
		// sheet keeps --primary with a stronger one.
		let ink = "currentColor";
		let boost = 1;
		const resolveInk = () => {
			const styles = getComputedStyle(sizer);
			const dark = document.documentElement.classList.contains("dark");
			ink =
				color ||
				styles.getPropertyValue(dark ? "--primary" : "--cta-solid").trim() ||
				styles.getPropertyValue("--bp-ink").trim() ||
				"currentColor";
			boost = dark ? 1.7 : 1.35;
		};
		resolveInk();

		// One alpha + timestamp per lattice cell for the WHOLE sheet (a 6000px page
		// is ~5k cells), so nothing has to be re-registered as the page scrolls.
		let cols = 0;
		let rows = 0;
		let alphas = new Float32Array(0);
		let touched = new Float64Array(0);
		let vw = 0;
		let vh = 0;
		// Sheet size in lattice units. Cells may overhang it (the last column is
		// partial); the draw clip is what keeps ink inside the sheet rect.
		let sheetW = 0;
		let sheetH = 0;
		const pulses: Pulse[] = [];
		let raf = 0;
		let running = false;
		let lastFrame = 0;

		const resizeCanvas = () => {
			vw = window.innerWidth;
			vh = window.innerHeight;
			canvas.width = Math.max(1, Math.round(vw * dpr));
			canvas.height = Math.max(1, Math.round(vh * dpr));
			canvas.style.width = `${vw}px`;
			canvas.style.height = `${vh}px`;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		};

		const rebuildCells = () => {
			const rect = sizer.getBoundingClientRect();
			sheetW = rect.width;
			sheetH = rect.height;
			// `ceil`, no `+1`: exactly the cells the sheet overlaps. A further cell
			// would sit wholly outside the sheet and could only ever bleed.
			const nextCols = Math.max(1, Math.ceil(rect.width / pitch));
			const nextRows = Math.max(1, Math.ceil(rect.height / pitch));
			if (nextCols === cols && nextRows === rows) return;
			cols = nextCols;
			rows = nextRows;
			alphas = new Float32Array(cols * rows);
			touched = new Float64Array(cols * rows);
			pulses.length = 0;
		};

		const clampCol = (v: number) => Math.min(cols - 1, Math.max(0, v));
		const clampRow = (v: number) => Math.min(rows - 1, Math.max(0, v));

		/** Cell centers, lattice-local. */
		const centerX = (c: number) => c * pitch + pitch / 2;
		const centerY = (r: number) => r * pitch + pitch / 2;

		const energize = (x: number, y: number) => {
			const p = configRef.current;
			const r = Math.max(p.radius, 1);
			const ease = FALLOFF_CURVES[p.falloff] ?? FALLOFF_CURVES.linear;
			const now = performance.now();
			const minCol = clampCol(Math.floor((x - r) / pitch));
			const maxCol = clampCol(Math.floor((x + r) / pitch));
			const minRow = clampRow(Math.floor((y - r) / pitch));
			const maxRow = clampRow(Math.floor((y + r) / pitch));
			for (let row = minRow; row <= maxRow; row++) {
				for (let col = minCol; col <= maxCol; col++) {
					const dist = Math.hypot(centerX(col) - x, centerY(row) - y);
					if (dist > r) continue;
					const i = row * cols + col;
					const level = ease(1 - dist / r) * p.maxOpacity;
					if (level > alphas[i]) alphas[i] = level;
					if (level > 0) touched[i] = now;
				}
			}
		};

		const draw = (now: number) => {
			const p = configRef.current;
			const dt = Math.min(now - lastFrame, 50);
			lastFrame = now;
			ctx.clearRect(0, 0, vw, vh);
			ctx.globalAlpha = 1;

			// Re-read every frame: the canvas is viewport-fixed, so this offset is what
			// keeps the response registered with the printed lattice during scroll.
			const rect = sizer.getBoundingClientRect();
			const ox = rect.left;
			const oy = rect.top;
			sheetW = rect.width;
			sheetH = rect.height;

			// Everything below is clipped to the sheet's on-screen rect, so a partial
			// edge cell renders partially — exactly as the printed lattice does, which
			// is clipped by the shell's own box. Without this the last column strokes
			// past the shell's right hairline.
			ctx.save();
			ctx.beginPath();
			ctx.rect(ox, oy, rect.width, rect.height);
			ctx.clip();

			// Visible window in cell indices — the only cells worth touching.
			const firstCol = clampCol(Math.floor(-ox / pitch));
			const lastCol = clampCol(Math.ceil((vw - ox) / pitch));
			const firstRow = clampRow(Math.floor(-oy / pitch));
			const lastRow = clampRow(Math.ceil((vh - oy) / pitch));

			if (p.gridOpacity > 0) {
				ctx.strokeStyle = ink;
				ctx.globalAlpha = p.gridOpacity;
				ctx.lineWidth = 1;
				ctx.beginPath();
				for (let col = firstCol; col <= lastCol + 1; col++) {
					const x = ox + col * pitch;
					ctx.moveTo(x, 0);
					ctx.lineTo(x, vh);
				}
				for (let row = firstRow; row <= lastRow + 1; row++) {
					const y = oy + row * pitch;
					ctx.moveTo(0, y);
					ctx.lineTo(vw, y);
				}
				ctx.stroke();
				ctx.globalAlpha = 1;
			}

			// Expanding click rings hand their energy to cells as they sweep past.
			const pulseLimit = Math.hypot(vw, vh);
			for (let pi = pulses.length - 1; pi >= 0; pi--) {
				const pulse = pulses[pi];
				const ringR = ((now - pulse.t0) / 1000) * p.pulseSpeed;
				if (ringR > pulseLimit) {
					pulses.splice(pi, 1);
					continue;
				}
				const band = pitch;
				const minCol = Math.max(
					firstCol,
					clampCol(Math.floor((pulse.x - ringR - band) / pitch)),
				);
				const maxCol = Math.min(
					lastCol,
					clampCol(Math.floor((pulse.x + ringR + band) / pitch)),
				);
				const minRow = Math.max(
					firstRow,
					clampRow(Math.floor((pulse.y - ringR - band) / pitch)),
				);
				const maxRow = Math.min(
					lastRow,
					clampRow(Math.floor((pulse.y + ringR + band) / pitch)),
				);
				for (let row = minRow; row <= maxRow; row++) {
					for (let col = minCol; col <= maxCol; col++) {
						const dist = Math.hypot(
							centerX(col) - pulse.x,
							centerY(row) - pulse.y,
						);
						if (Math.abs(dist - ringR) >= band / 2) continue;
						const i = row * cols + col;
						if (p.maxOpacity > alphas[i]) alphas[i] = p.maxOpacity;
						touched[i] = now;
					}
				}
			}

			let anyVisible = pulses.length > 0;
			const fadeStep = dt / Math.max(p.fadeDuration, 16);

			for (let row = firstRow; row <= lastRow; row++) {
				for (let col = firstCol; col <= lastCol; col++) {
					const i = row * cols + col;
					let a = alphas[i];
					if (a <= 0) continue;
					if (now - touched[i] > p.holdTime) {
						a = Math.max(0, a - fadeStep);
						alphas[i] = a;
						if (a <= 0) continue;
					}
					anyVisible = true;

					// Both printed masks, in lattice space so they track the sheet.
					const ramp =
						p.topFade > 0 ? Math.min(1, (row * pitch) / p.topFade) : 1;
					if (ramp <= 0) continue;
					const dim =
						sheetW > 0 ? centreDim((col * pitch + pitch / 2) / sheetW) : 1;
					const level = Math.min(1, a * boost) * ramp * dim;

					// Path on the integer multiple of the pitch: a 1px stroke there covers
					// exactly the printed major line's pixel.
					const x = ox + col * pitch;
					const y = oy + row * pitch;
					const cx = x + pitch / 2;
					const cy = y + pitch / 2;

					// Alpha rides globalAlpha, never the color string — `--bp-ink` is an
					// oklch()/var() chain and is not parseable into channels here.
					const gradient = ctx.createRadialGradient(
						cx,
						cy,
						pitch * 0.05,
						cx,
						cy,
						pitch,
					);
					gradient.addColorStop(0, ink);
					gradient.addColorStop(1, "transparent");

					ctx.beginPath();
					if (p.cellRadius > 0) {
						ctx.roundRect(x, y, pitch, pitch, p.cellRadius);
					} else {
						ctx.rect(x, y, pitch, pitch);
					}
					if (p.fillOpacity > 0) {
						ctx.globalAlpha = level * p.fillOpacity;
						ctx.fillStyle = ink;
						ctx.fill();
					}
					ctx.globalAlpha = level;
					ctx.strokeStyle = gradient;
					ctx.lineWidth = p.lineWidth;
					ctx.stroke();
					ctx.globalAlpha = 1;
				}
			}

			ctx.restore();

			// Cells outside the visible window keep their alpha; they are re-checked the
			// moment they scroll back in, which reads as the sheet holding its mark.
			if (anyVisible) {
				raf = requestAnimationFrame(draw);
			} else {
				running = false;
				if (p.gridOpacity <= 0) ctx.clearRect(0, 0, vw, vh);
			}
		};

		const wake = () => {
			if (running) return;
			running = true;
			lastFrame = performance.now();
			raf = requestAnimationFrame(draw);
		};
		wakeRef.current = wake;

		/** Client coords → lattice-local, via the sizer's live rect. */
		const toLattice = (e: PointerEvent): [number, number] => {
			const rect = sizer.getBoundingClientRect();
			return [e.clientX - rect.left, e.clientY - rect.top];
		};

		// The sheet rect, not the cell grid: `cols * pitch` rounds up past the sheet.
		const inside = (x: number, y: number) =>
			x >= 0 && y >= 0 && x <= sheetW && y <= sheetH;

		const onPointerMove = (e: PointerEvent) => {
			const [x, y] = toLattice(e);
			if (!inside(x, y)) return;
			energize(x, y);
			wake();
		};

		const onPointerDown = (e: PointerEvent) => {
			if (!configRef.current.clickPulse) return;
			const [x, y] = toLattice(e);
			if (!inside(x, y)) return;
			pulses.push({ x, y, t0: performance.now() });
			wake();
		};

		const onResize = () => {
			resizeCanvas();
			wake();
		};

		const ro = new ResizeObserver(() => {
			rebuildCells();
			wake();
		});
		ro.observe(sizer);

		// next-themes toggles `.dark` on <html>; re-resolve the ink rather than
		// re-mounting, and repaint in case the effect is idle.
		const themeObserver = new MutationObserver(() => {
			resolveInk();
			wake();
		});
		// class only: watching style too fires on every unrelated inline write
		// (scroll locks, smooth-scroll libs), each forcing a style recalc via
		// resolveInk and waking the draw loop.
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});

		resizeCanvas();
		rebuildCells();

		// Listeners on window, not the layer: the layer is pointer-events-none so the
		// content above it must keep every event.
		window.addEventListener("pointermove", onPointerMove, { passive: true });
		window.addEventListener("pointerdown", onPointerDown, { passive: true });
		window.addEventListener("resize", onResize);

		return () => {
			cancelAnimationFrame(raf);
			wakeRef.current = null;
			ro.disconnect();
			themeObserver.disconnect();
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerdown", onPointerDown);
			window.removeEventListener("resize", onResize);
		};
	}, [enabled, cellSize, color]);

	return (
		<div
			ref={sizerRef}
			aria-hidden="true"
			className={cn("pointer-events-none absolute inset-0", className)}
		>
			{enabled ? (
				// No CSS mask here: a viewport-fixed element would key the stops to the
				// viewport, not the inset sheet. Both printed masks are reproduced in
				// the draw loop in lattice space instead (`topFade`, `centreDim`).
				<canvas ref={canvasRef} className="fixed left-0 top-0 block" />
			) : null}
		</div>
	);
}
