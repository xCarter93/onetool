import type { CSSProperties } from "react";

/**
 * Shared connector styling for the automations flow. Single source of truth so
 * every edge type stays consistent. Colors resolve from the `--flow-edge-*`
 * variables defined in flow-theme.css, so strokes, arrowheads, and pills all
 * read from the same palette in light and dark.
 *
 * Visual language:
 * - solid  = a built, configured flow segment
 * - dashed = a segment that doesn't exist yet (terminal "+" stubs, ghost lanes)
 * - orange = loop iteration lanes (each / loop-back / after-last / in-body)
 */

export interface EdgeStrokeOptions {
	/** Loop-accent (orange) lane. */
	loop?: boolean;
	/** Not-yet-built segment (terminal stub or ghost-card lane). */
	dashed?: boolean;
	/** Pointer is over the edge's interaction path. */
	hovered?: boolean;
	/** React Flow selection state. */
	selected?: boolean;
}

export function edgeStroke({
	loop,
	dashed,
	hovered,
	selected,
}: EdgeStrokeOptions): CSSProperties {
	const stroke = selected
		? "var(--flow-edge-selected)"
		: hovered
			? loop
				? "var(--flow-edge-loop-strong)"
				: "var(--flow-edge-strong)"
			: loop
				? "var(--flow-edge-loop)"
				: "var(--flow-edge)";
	return {
		stroke,
		strokeWidth: hovered || selected ? 2 : 1.5,
		strokeDasharray: dashed ? "5 4" : undefined,
		transition: "stroke 120ms ease, stroke-width 120ms ease",
	};
}
