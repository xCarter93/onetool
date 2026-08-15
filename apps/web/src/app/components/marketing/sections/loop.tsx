import { Section } from "../primitives";
import { JobStack } from "../job-stack";

/* The loop: nine chapters of one job as a pinned scroll stack, each card
 * playing its reel chapter live. job-stack.tsx owns the cards, the copy, the
 * playback gating AND the section heading — the heading rides inside the
 * pinned stage so it stays in view for the whole runway, which it cannot do
 * from out here. */

export function Loop() {
	return (
		/* Full-bleed via the container, the hero's pattern: the pinned stage and
		   its halftone corners want the page's full width, not the 1280px
		   column. Deliberately NOT overflow-hidden on the Section — that would
		   make it the scrollport and kill the stage's position:sticky; the stage
		   already clips its own decor. */
		<Section id="loop" pad="none" containerClassName="max-w-none px-0">
			{/* Legacy anchor: the old page shipped #how-it-works. */}
			<span
				id="how-it-works"
				aria-hidden="true"
				className="absolute -top-px left-0 block"
			/>

			<JobStack />
		</Section>
	);
}
