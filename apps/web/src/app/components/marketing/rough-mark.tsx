"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "./use-reduced-motion";

/* Hand-drawn annotation strokes behind (or over) a run of inline text — the
 * page's six editorial moments. Ported from the comp's annotate.js: same
 * deterministic wobble (seeded PRNG), same stroke math, same draw-on timing.
 * Colors are passed straight through as CSS (var() welcome) so theme flips
 * repaint without JS. Draws once, when scrolled into view. */

type MarkType =
	| "highlight"
	| "underline"
	| "circle"
	| "box"
	| "strike-through"
	| "bracket";

const prng = (seed: number) => {
	let s = seed >>> 0 || 1;
	return () => {
		s ^= s << 13;
		s >>>= 0;
		s ^= s >> 17;
		s ^= s << 5;
		s >>>= 0;
		return s / 4294967296;
	};
};

const hash = (str: string) => {
	let h = 2166136261;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
};

/* One wobbly stroke as a cubic path: the line is walked in segments whose
   control points drift off-axis by up to `bow`. */
const stroke = (
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	rnd: () => number,
	bow: number,
	segments = 2
) => {
	const dx = (x2 - x1) / segments;
	const dy = (y2 - y1) / segments;
	let d = `M${x1.toFixed(2)},${(y1 + (rnd() - 0.5) * bow).toFixed(2)}`;
	for (let i = 0; i < segments; i++) {
		const sx = x1 + dx * i;
		const sy = y1 + dy * i;
		const ex = sx + dx;
		const ey = sy + dy;
		const j = () => (rnd() - 0.5) * bow * 2;
		d +=
			`C${(sx + dx * 0.33).toFixed(2)},${(sy + dy * 0.33 + j()).toFixed(2)} ` +
			`${(sx + dx * 0.66).toFixed(2)},${(sy + dy * 0.66 + j()).toFixed(2)} ` +
			`${ex.toFixed(2)},${(ey + (i === segments - 1 ? (rnd() - 0.5) * bow : j())).toFixed(2)}`;
	}
	return d;
};

const ellipse = (
	cx: number,
	cy: number,
	rx: number,
	ry: number,
	rnd: () => number,
	bow: number
) => {
	// Open, slightly over-run loop — a pen circling something twice.
	const start = -0.35 + (rnd() - 0.5) * 0.3;
	const end = start + Math.PI * 2 + 0.45;
	const steps = 10;
	let d = "";
	for (let i = 0; i <= steps; i++) {
		const t = start + ((end - start) * i) / steps;
		const x = cx + Math.cos(t) * (rx + (rnd() - 0.5) * bow);
		const y = cy + Math.sin(t) * (ry + (rnd() - 0.5) * bow);
		d += (i ? "L" : "M") + x.toFixed(2) + "," + y.toFixed(2);
	}
	return d;
};

export function RoughMark({
	type = "highlight",
	color = "var(--accent)",
	strokeWidth,
	opacity,
	iterations,
	duration = 620,
	delay = 0,
	seed,
	className,
	children,
}: {
	type?: MarkType;
	color?: string;
	strokeWidth?: number;
	opacity?: number;
	iterations?: number;
	duration?: number;
	delay?: number;
	seed?: number;
	className?: string;
	children: ReactNode;
}) {
	const hostRef = useRef<HTMLSpanElement>(null);
	const textRef = useRef<HTMLSpanElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const drawnRef = useRef(false);
	const reduced = usePrefersReducedMotion();

	useEffect(() => {
		const host = hostRef.current;
		const text = textRef.current;
		const svg = svgRef.current;
		if (!host || !text || !svg) return;

		/* Text rects, one stroke per visual line. Coordinates are relative to the
		   SVG's containing block — for a wrapping inline element that is its FIRST
		   fragment box, so measure against the SVG's own rect, not the host's. */
		const measure = () => {
			const origin = svg.getBoundingClientRect();
			const range = document.createRange();
			const nodes = [...text.childNodes];
			if (!nodes.length) return [];
			range.setStartBefore(nodes[0]);
			range.setEndAfter(nodes[nodes.length - 1]);
			const rects = [...range.getClientRects()].filter(
				(r) => r.width > 1 && r.height > 1
			);
			return (rects.length ? rects : [host.getBoundingClientRect()]).map((r) => ({
				x: r.left - origin.left,
				y: r.top - origin.top,
				w: r.width,
				h: r.height,
			}));
		};

		const draw = (animate: boolean) => {
			const rects = measure();
			svg.replaceChildren();
			if (!rects.length) return;

			const iters = Math.max(1, iterations ?? (type === "highlight" ? 1 : 2));
			const dur = reduced ? 0 : duration;
			const seedVal = seed || hash((text.textContent ?? "").trim() + type);
			const rnd = prng(seedVal);
			const paths: SVGPathElement[] = [];

			for (const r of rects) {
				const sw =
					strokeWidth ??
					(type === "highlight"
						? r.h * 0.82
						: Math.max(1.6, Math.min(3.4, r.h * 0.075)));
				for (let i = 0; i < iters; i++) {
					const bow =
						type === "highlight" ? r.h * 0.06 : Math.max(1.2, r.h * 0.055);
					let d: string;
					if (type === "highlight") {
						const y = r.y + r.h * 0.58;
						d = stroke(r.x - r.h * 0.06, y, r.x + r.w + r.h * 0.06, y, rnd, bow, 2);
					} else if (type === "underline") {
						const y = r.y + r.h * (0.94 + i * 0.05);
						d = stroke(r.x - 1, y, r.x + r.w + 1, y + (rnd() - 0.5) * bow, rnd, bow, 3);
					} else if (type === "strike-through") {
						const y = r.y + r.h * 0.56;
						d = stroke(r.x - 2, y, r.x + r.w + 2, y, rnd, bow, 3);
					} else if (type === "circle") {
						const px = r.h * 0.28;
						const py = r.h * 0.16;
						d = ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 + px, r.h / 2 + py, rnd, bow * 1.4);
					} else if (type === "box") {
						const p = r.h * 0.16;
						const x1 = r.x - p, y1 = r.y - p, x2 = r.x + r.w + p, y2 = r.y + r.h + p;
						d = [
							stroke(x1, y1, x2, y1, rnd, bow),
							stroke(x2, y1, x2, y2, rnd, bow),
							stroke(x2, y2, x1, y2, rnd, bow),
							stroke(x1, y2, x1, y1, rnd, bow),
						].join(" ");
					} else {
						// bracket — left and right only
						const p = r.h * 0.18, t = r.h * 0.22;
						const x1 = r.x - p, x2 = r.x + r.w + p;
						const y1 = r.y - p * 0.4, y2 = r.y + r.h + p * 0.4;
						d = [
							stroke(x1 + t, y1, x1, y1, rnd, bow),
							stroke(x1, y1, x1, y2, rnd, bow),
							stroke(x1, y2, x1 + t, y2, rnd, bow),
							stroke(x2 - t, y1, x2, y1, rnd, bow),
							stroke(x2, y1, x2, y2, rnd, bow),
							stroke(x2, y2, x2 - t, y2, rnd, bow),
						].join(" ");
					}

					const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
					p.setAttribute("d", d);
					p.setAttribute("fill", "none");
					p.style.stroke = color; // CSS resolves var(); theme flips repaint free
					p.setAttribute("stroke-width", String(sw));
					p.setAttribute("stroke-linecap", type === "highlight" ? "butt" : "round");
					p.setAttribute(
						"stroke-opacity",
						String(
							opacity ??
								(type === "highlight" ? 0.26 : type === "strike-through" ? 0.7 : 0.9)
						)
					);
					paths.push(p);
					svg.appendChild(p);
				}
			}

			if (!animate || !dur) return;
			paths.forEach((p, i) => {
				const len = p.getTotalLength?.() || 0;
				if (!len) return;
				p.style.strokeDasharray = String(len);
				p.style.strokeDashoffset = String(len);
				const anim = p.animate(
					[{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
					{
						duration: dur,
						delay: delay + i * dur * 0.28,
						easing: "cubic-bezier(.23,1,.32,1)",
						fill: "forwards",
					}
				);
				anim.finished
					.then(() => {
						p.style.strokeDashoffset = "0";
					})
					.catch(() => {});
			});
		};

		let ro: ResizeObserver | null = null;
		const start = () => {
			if (drawnRef.current) return;
			if (!host.getBoundingClientRect().width) return;
			drawnRef.current = true;
			draw(true);
			ro = new ResizeObserver(() => {
				if (drawnRef.current) draw(false);
			});
			ro.observe(host);
			if (document.body) ro.observe(document.body);
		};

		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					start();
					io.disconnect();
				}
			},
			{ rootMargin: "0px 0px -10% 0px" }
		);
		io.observe(host);
		// Fallback: a mark that never draws is worse than one drawn a screen early.
		const t = window.setTimeout(start, 1200);

		return () => {
			io.disconnect();
			ro?.disconnect();
			window.clearTimeout(t);
		};
	}, [type, color, strokeWidth, opacity, iterations, duration, delay, seed, reduced]);

	return (
		<span ref={hostRef} className={cn("relative inline", className)}>
			<span ref={textRef} className="relative z-[1]">
				{children}
			</span>
			<svg
				ref={svgRef}
				aria-hidden="true"
				className="pointer-events-none absolute left-0 top-0 h-full w-full overflow-visible"
				style={{ zIndex: type === "highlight" ? 0 : 2 }}
			/>
		</span>
	);
}
