"use client";

import { useEffect, type RefObject } from "react";

const DASH = [4, 2];
const STROKE = 1.5;

/** Traces each headline beat as a dashed outline on its own canvas, the way TechText draws a selected letter. */
export function useBeatDashes(root: RefObject<HTMLElement | null>, color: string | undefined) {
	useEffect(() => {
		const beats = root.current ? [...root.current.querySelectorAll<HTMLElement>(".lp-beat")] : [];
		if (!color || beats.length === 0) return;
		let alive = true;
		const draw = () => beats.forEach((beat) => trace(beat, color));
		draw();
		const resize = new ResizeObserver(draw);
		beats.forEach((beat) => resize.observe(beat));
		document.fonts?.ready.then(() => alive && draw());
		return () => {
			alive = false;
			resize.disconnect();
		};
	}, [root, color]);
}

function trace(beat: HTMLElement, color: string) {
	const canvas = beat.querySelector("canvas");
	const ctx = canvas?.getContext("2d");
	const text = beat.textContent?.trim();
	if (!canvas || !ctx || !text) return;
	const style = getComputedStyle(beat);
	const lineHeight = parseFloat(style.lineHeight);
	const { width, height } = beat.getBoundingClientRect();
	// A wrapped beat can't be traced as one line, so it keeps the CSS outline.
	if (!lineHeight || height > lineHeight * 1.5) {
		delete beat.dataset.dashed;
		return;
	}

	const pad = STROKE * 2 + 2;
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	canvas.width = Math.ceil((width + pad * 2) * dpr);
	canvas.height = Math.ceil((height + pad * 2) * dpr);
	canvas.style.width = `${width + pad * 2}px`;
	canvas.style.height = `${height + pad * 2}px`;
	canvas.style.left = canvas.style.top = `${-pad}px`;

	ctx.setTransform(dpr, 0, 0, dpr, pad * dpr, pad * dpr);
	ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
	if ("letterSpacing" in ctx) ctx.letterSpacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
	ctx.textBaseline = "alphabetic";
	const metrics = ctx.measureText(text);
	const baseline = (lineHeight - metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2 + metrics.fontBoundingBoxAscent;

	// Stroke twice as wide, then cut the fill away, so only the outer half of the line shows.
	ctx.lineJoin = "round";
	ctx.lineWidth = STROKE * 2;
	ctx.strokeStyle = color;
	ctx.setLineDash(DASH);
	ctx.strokeText(text, 0, baseline);
	ctx.globalCompositeOperation = "destination-out";
	ctx.fillText(text, 0, baseline);
	ctx.globalCompositeOperation = "source-over";
	beat.dataset.dashed = "";
}
