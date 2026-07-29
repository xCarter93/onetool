/**
 * The ONE blueprint SVG sprite. Server component, zero JS.
 *
 * SVG fragment ids are document-global: render a hatched panel three times and
 * three `id="bp-hatch-45"` land in the DOM, all `url(#bp-hatch-45)` references
 * resolve to whichever is first in document order, and the moment that first
 * instance unmounts every other consumer silently loses its fill. Hoisting
 * every shape-independent def into a single sprite is the fix — fragment refs
 * are document-scoped, so `url(#bp-hatch-45)` resolves from any other <svg> on
 * the page.
 *
 * Mount EXACTLY ONCE, in app/(marketing)/layout.tsx. A second mount reintroduces
 * the duplicate-id bug through the back door.
 *
 * Per-instance defs (clipPath, mask, title ids) cannot live here — they depend
 * on the instance's own geometry. Those go through use-bp-id.ts.
 */

/** Hatch fill refs. Import these rather than retyping the url(#…) strings. */
export const BP_FILL = {
	/** 16px tile, 45deg — the default region fill. */
	hatch45: "url(#bp-hatch-45)",
	/** 16px tile, 135deg — stack with hatch45 for a cross-hatch. */
	hatch135: "url(#bp-hatch-135)",
	/** 8px tile — emphasis only, one region per composition. */
	hatchDense: "url(#bp-hatch-dense)",
} as const;

/** Arrowhead marker. `orient="auto-start-reverse"` lets one def serve both ends. */
export const BP_MARKER_ARROW = "url(#bp-arrow)";

export function BlueprintDefs() {
	return (
		<>
			<svg
				aria-hidden="true"
				focusable="false"
				width={0}
				height={0}
				// Zero-size + absolute + overflow hidden, NOT display:none. Paint
				// servers inside a display:none host have historically failed to
				// resolve in some engines.
				style={{
					position: "absolute",
					width: 0,
					height: 0,
					overflow: "hidden",
				}}
			>
				<defs>
					{/*
					 * patternUnits="userSpaceOnUse" is mandatory — the default
					 * (objectBoundingBox, 0-1 fractions) makes hatch density vary with
					 * each shape's size. The tile must be square and the line must span
					 * the full tile height at x=0, or the pattern seams visibly under
					 * patternTransform rotation.
					 *
					 * currentColor is forbidden inside a paint server: it resolves
					 * against the server's own position in the tree (here, this hidden
					 * sprite), not against the referencing element. var() in a CSS
					 * style object is the safe form.
					 */}
					<pattern
						id="bp-hatch-45"
						patternUnits="userSpaceOnUse"
						width={16}
						height={16}
						patternTransform="rotate(45)"
					>
						<line
							x1={0}
							y1={0}
							x2={0}
							y2={16}
							style={{ stroke: "var(--bp-hatch)", strokeWidth: "var(--lw-med)" }}
						/>
					</pattern>
					<pattern
						id="bp-hatch-135"
						patternUnits="userSpaceOnUse"
						width={16}
						height={16}
						patternTransform="rotate(135)"
					>
						<line
							x1={0}
							y1={0}
							x2={0}
							y2={16}
							style={{ stroke: "var(--bp-hatch)", strokeWidth: "var(--lw-med)" }}
						/>
					</pattern>
					<pattern
						id="bp-hatch-dense"
						patternUnits="userSpaceOnUse"
						width={8}
						height={8}
						patternTransform="rotate(45)"
					>
						<line
							x1={0}
							y1={0}
							x2={0}
							y2={8}
							style={{ stroke: "var(--bp-hatch)", strokeWidth: "var(--lw-med)" }}
						/>
					</pattern>

					{/*
					 * markerUnits="userSpaceOnUse" — the default (strokeWidth) makes an
					 * arrowhead on a 1px hairline microscopic. Markers cannot be
					 * restyled per reference, so the system keeps exactly one.
					 */}
					<marker
						id="bp-arrow"
						viewBox="0 0 8 8"
						refX={8}
						refY={4}
						markerWidth={8}
						markerHeight={8}
						markerUnits="userSpaceOnUse"
						orient="auto-start-reverse"
					>
						<path d="M0 0 L8 4 L0 8 Z" style={{ fill: "var(--bp-line-strong)" }} />
					</marker>
				</defs>
			</svg>

			{/*
			 * No-JS floor. .bp-draw ships hidden (dashoffset 1) and <DrawIn> reveals
			 * it; if JS is blocked or the island errors the artwork would be
			 * permanently invisible. This lands every drawable mark on its terminal
			 * state instead.
			 */}
			<noscript>
				<style>{
					".bp-draw{stroke-dashoffset:0}.bp-fade-in,.bp-rise,.bp-stamp{opacity:1;translate:none;scale:1}"
				}</style>
			</noscript>
		</>
	);
}
