import type { ReactNode } from "react";
import { CursorGrid } from "./cursor-grid";

/**
 * The sheet. ONE bordered column inset from the viewport, holding the whole
 * drawing set: navbar, every sheet, and the title block. The shell's own
 * `border-x` is the page's only vertical datum.
 *
 * Server component.
 *
 * NO `overflow-*`, NO `transform`, NO `isolate` on any wrapper here: the A-101
 * scene rail inside uses `position: sticky` and must keep the viewport as its
 * scroller (an overflow or transform ancestor silently steals it).
 */
export function SheetStack({ children }: { children: ReactNode }) {
	return (
		<div className="landing-ink relative mx-auto flex min-h-dvh w-[calc(100%-1.5rem)] max-w-[1560px] flex-col border-x border-bp-guide-strong sm:w-[calc(100%-2.5rem)] lg:w-[calc(100%-3rem)]">
			{/*
			 * The lattice. ONE layer for the whole stack: the drawing sits on
			 * continuous graph paper rather than per-section patches, so the grid
			 * never restarts at a seam. Two masks intersected — a top edge-fade so
			 * the grid does not hard-start under the navbar, and a horizontal dim
			 * across the middle where the content column runs. A DIM, not a hole:
			 * the guides still pass behind the copy, just quieter.
			 */}
			<div
				aria-hidden="true"
				className="bp-graphpaper pointer-events-none absolute inset-0"
				style={{
					maskImage:
						"linear-gradient(to bottom, transparent, #000 7rem), linear-gradient(to right, #000, rgba(0,0,0,0.42) 28%, rgba(0,0,0,0.42) 72%, #000)",
					maskComposite: "intersect",
					WebkitMaskComposite: "source-in",
				}}
			/>
			{/*
			 * The lattice answering the pointer. Its sizer is `absolute inset-0` of
			 * this same element, so it shares the printed layer's origin box exactly
			 * — cell k lands on printed line k. Keep it directly after the layer
			 * above: any wrapper between them would change its offset parent.
			 */}
			<CursorGrid />
			{children}
		</div>
	);
}

/**
 * Seam registration marks: two 7px squares straddling the shell rail where a
 * kept seam rule crosses it — the same furniture the navbar prints under its
 * own bottom edge. Render inside a `relative` element that draws a
 * `border-t` seam; only sections that KEEP a rule (opaque neighbours, no
 * cursor grid to misregister against) should pair with this.
 * `data-section-corner` keeps the nav-open CSS hiding them with the rest.
 */
export function SeamCorners() {
	return (
		<>
			<span
				aria-hidden="true"
				data-section-corner
				className="pointer-events-none absolute left-0 top-0 z-10 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 border border-bp-guide-strong bg-bp-paper"
			/>
			<span
				aria-hidden="true"
				data-section-corner
				className="pointer-events-none absolute right-0 top-0 z-10 h-[7px] w-[7px] -translate-y-1/2 translate-x-1/2 border border-bp-guide-strong bg-bp-paper"
			/>
		</>
	);
}

/**
 * One sheet in the stack. A plain <div>, not a <section> — every child section
 * renders its own landmark. The data attributes are what <SheetIndicator>
 * observes to name the sheet currently in view. Children own their padding.
 */
export function SheetSection({
	code,
	title,
	id,
	seam = false,
	children,
}: {
	/** e.g. "A-101". */
	code: string;
	title: string;
	id?: string;
	/**
	 * Draw a kept top seam (rule + registration squares) on this wrapper. The
	 * seam must live HERE, not on the child section: `.bp-section`'s
	 * content-visibility imposes paint containment, which clips the squares
	 * that straddle the shell rail to a fragment.
	 */
	seam?: boolean;
	children: ReactNode;
}) {
	return (
		<div
			id={id}
			data-sheet={code}
			data-sheet-title={title}
			className={
				seam
					? "relative border-t border-bp-guide-strong"
					: "relative"
			}
		>
			{seam ? <SeamCorners /> : null}
			{children}
		</div>
	);
}
