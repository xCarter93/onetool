import type { ReactNode } from "react";

/**
 * keyword-mark — the "selection window" device (PRD §3).
 *
 * One key word inside a heading, rendered as a literal CAD selection window:
 * a faint brand-sky tint over the word (the selection highlight), a hairline
 * dashed frame floating just outside it, and four tiny solid corner handles.
 * The lettering keeps the heading's own ink — a solid plate with knocked-out
 * type reads as a logo chip, not as drafting.
 *
 * The dashes are the rare ones that pass the inevitability test — a dashed
 * rectangle with handles around an object *means* "the object under
 * consideration" in every CAD tool the audience's suppliers use.
 *
 * Discipline (PRD §3): headline sizes ONLY; max one per heading, <=3 uses
 * page-wide; never inside a two-tone muted clause; never combined with another
 * in-heading decoration. Dashes are STATIC — the one marching-dash-per-viewport
 * budget belongs to the scenes. Corners are near-square on purpose: rounding
 * is what turns this back into a pill.
 *
 * All metrics are em-based so the device scales with the heading it sits in.
 */
const HANDLES = [
	"-left-[0.16em] -top-[0.16em]",
	"-right-[0.16em] -top-[0.16em]",
	"-left-[0.16em] -bottom-[0.16em]",
	"-right-[0.16em] -bottom-[0.16em]",
] as const;

export function KeywordMark({
	children,
	className = "",
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		// mx must exceed the frame's -inset overhang (0.12em) or the dashed
		// rectangle sits flush against the neighbouring words.
		<span className={`relative mx-[0.3em] inline-block ${className}`}>
			<span
				className="relative z-[1] inline-block rounded-[0.06em] px-[0.22em] pb-[0.04em]"
				style={{
					background: "color-mix(in oklch, var(--primary) 12%, transparent)",
				}}
			>
				{children}
			</span>
			<span
				aria-hidden="true"
				className="pointer-events-none absolute -inset-[0.12em] border border-dashed border-(--bp-ink)"
			/>
			{HANDLES.map((pos) => (
				<span
					key={pos}
					aria-hidden="true"
					className={`pointer-events-none absolute ${pos} z-[2] size-[0.09em] bg-(--bp-ink)`}
				/>
			))}
		</span>
	);
}
