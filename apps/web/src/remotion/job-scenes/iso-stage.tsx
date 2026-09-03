import React from "react";
import {
	ISO_T,
	isoGrid,
	type IsoGrid,
} from "../../components/illustrations/art/iso";
import type { JobPalette } from "./theme";

/* Compositions can't reach `.ot-illo` or CSS vars, so the paint is inlined; the
 * Player halves the 700px frame, so strokes and offsets are double the system's. */

export { ISO_T, isoGrid, type IsoGrid };

export interface StagePaint {
	line: string;
	faceTop: string;
	faceLeft: string;
	faceRight: string;
	surface: string;
	knock: string;
	cast: string;
	accent: string;
	accentShade: string;
	paid: string;
	ink3: string;
}

export function stagePaint(T: JobPalette): StagePaint {
	const mix = (n: number) =>
		`color-mix(in oklab, ${T.stageLine} ${n}%, ${T.stageFace})`;
	return {
		line: T.stageLine,
		faceTop: mix(5),
		faceLeft: mix(18),
		faceRight: mix(32),
		surface: mix(12),
		knock: T.stageFace,
		cast: T.stageCast,
		accent: T.accent,
		accentShade: `color-mix(in oklab, ${T.accent} 76%, black)`,
		paid: T.paid,
		ink3: T.ink3,
	};
}

export const OUTLINE = 3;
export const HAIR = 1.5;
export const DASH = "8 6";

const r2 = (n: number) => Math.round(n * 100) / 100;

export const outlineStyle = (P: StagePaint): React.CSSProperties => ({
	fill: "none",
	stroke: P.line,
	strokeWidth: OUTLINE,
	strokeLinejoin: "round",
	strokeLinecap: "round",
});

export const hairStyle = (P: StagePaint): React.CSSProperties => ({
	fill: "none",
	stroke: P.line,
	strokeWidth: HAIR,
	strokeLinecap: "round",
	opacity: 0.55,
});

/** Light strokes on an accent face (the record's text bars). */
export const onAccentStyle = (P: StagePaint): React.CSSProperties => ({
	fill: "none",
	stroke: P.knock,
	strokeWidth: 3.5,
	strokeLinecap: "round",
	strokeLinejoin: "round",
});

/** ±`amp` px hover on a 2.8s cycle, `phase` in turns so floaters desync. */
export const bob = (frame: number, fps: number, phase: number, amp = 5) =>
	r2(Math.sin(((frame / fps) / 2.8 + phase) * Math.PI * 2) * amp);

/** The two top-face edges the silhouette outline skips, plus the front vertical. */
export function innerEdges(
	g: IsoGrid,
	a: number,
	b: number,
	w: number,
	d: number,
	h: number,
	ht: number,
): string {
	const top = h + ht;
	const p = (pa: number, pb: number, z: number) => {
		const [x, y] = g.pt(pa, pb, z);
		return `${r2(x)} ${r2(y)}`;
	};
	const corner = p(a + w, b + d, top);
	return `M${p(a + w, b, top)}L${corner}L${p(a, b + d, top)}M${corner}L${p(a + w, b + d, h)}`;
}

/** Three-face slab with every edge inked. `tone` picks the face ramp. */
export const Slab: React.FC<{
	g: IsoGrid;
	a: number;
	b: number;
	w: number;
	d: number;
	h?: number;
	ht: number;
	P: StagePaint;
	tone?: "face" | "accent";
}> = ({ g, a, b, w, d, h = 0, ht, P, tone = "face" }) => {
	const box = g.box(a, b, h, w, d, ht);
	const [top, left, right] =
		tone === "accent"
			? [P.accent, P.accentShade, P.accentShade]
			: [P.faceTop, P.faceLeft, P.faceRight];
	return (
		<>
			<path d={box.top} style={{ fill: top }} />
			<path d={box.left} style={{ fill: left }} />
			<path d={box.right} style={{ fill: right }} />
			<path d={innerEdges(g, a, b, w, d, h, ht)} style={outlineStyle(P)} />
			<path d={box.outline} style={outlineStyle(P)} />
		</>
	);
};

/** Flattened shadow rhombus on the ground plane under a floater or plinth. */
export const Cast: React.FC<{
	g: IsoGrid;
	a: number;
	b: number;
	w: number;
	d: number;
	h: number;
	P: StagePaint;
	opacity?: number;
}> = ({ g, a, b, w, d, h, P, opacity = 1 }) => (
	<path d={g.ground(a, b, h, w, d)} style={{ fill: P.cast, opacity }} />
);

/** Inset rhombus ring on a plinth's top face. */
export const Ring: React.FC<{
	g: IsoGrid;
	hw: number;
	h?: number;
	P: StagePaint;
	color?: string;
	width?: number;
	opacity?: number;
}> = ({ g, hw, h = 0, P, color = P.paid, width = 6, opacity = 1 }) => (
	<path
		d={g.ground(-hw, -hw, h, hw * 2, hw * 2)}
		style={{
			fill: "none",
			stroke: color,
			strokeWidth: width,
			strokeLinejoin: "round",
			opacity,
		}}
	/>
);

/** Dashed accent leader; drive `flow` from the frame so dashes stream from start to end. */
export const Leader: React.FC<{
	d: string;
	P: StagePaint;
	flow: number;
	opacity?: number;
}> = ({ d, P, flow, opacity = 0.8 }) => (
	<path
		d={d}
		style={{
			fill: "none",
			stroke: P.accent,
			strokeWidth: OUTLINE,
			strokeLinecap: "round",
			strokeDasharray: DASH,
			strokeDashoffset: -flow,
			opacity,
		}}
	/>
);

/** Dashes advance 0.9px per frame (≈27px/s at 30fps): unhurried, always moving. */
export const flowAt = (frame: number) => r2(frame * 0.9);

/**
 * A floating square plate: cast shadow fixed on the ground, the slab lifted
 * by `lift` (bob + entrance), its mark laid in the top plane. Draw marks in
 * iso units; stroked children need vectorEffect="non-scaling-stroke".
 */
export const Plate: React.FC<{
	x: number;
	y: number;
	unit: number;
	hw: number;
	ht: number;
	P: StagePaint;
	lift: number;
	opacity?: number;
	castDrop?: number;
	children?: React.ReactNode;
}> = ({ x, y, unit, hw, ht, P, lift, opacity = 1, castDrop = 52, children }) => {
	const g = isoGrid(x, y, unit);
	return (
		<g style={{ opacity }}>
			<Cast
				g={g}
				a={-hw * 0.78}
				b={-hw * 0.78}
				w={hw * 1.56}
				d={hw * 1.56}
				h={-(ht + castDrop)}
				P={P}
			/>
			<g style={{ translate: `0 ${r2(-lift)}px` }}>
				<Slab g={g} a={-hw} b={-hw} w={hw * 2} d={hw * 2} h={-ht} ht={ht} P={P} />
				<g transform={g.topMatrix(0, 0, 0)}>{children}</g>
			</g>
		</g>
	);
};

/** Screen-px from a plate's top-face centre down to its front-bottom apex. */
export const plateDrop = (hw: number, unit: number, ht: number) =>
	2 * hw * unit * ISO_T + ht;
