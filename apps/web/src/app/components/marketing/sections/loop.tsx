import { Eyebrow, Lede, Section, SectionHeading } from "../primitives";
import { RoughMark } from "../rough-mark";
import { JobStack } from "../job-stack";

/* The loop: five steps of one job as a pinned scroll stack, each card playing
 * its reel chapter live (job-stack.tsx owns the cards, copy, and playback
 * gating). The old static keyframe mosaic lived here through wave 2. */

export function Loop() {
	return (
		<Section id="loop" containerClassName="pb-0">
			{/* Legacy anchor: the old page shipped #how-it-works. */}
			<span
				id="how-it-works"
				aria-hidden="true"
				className="absolute -top-px left-0 block"
			/>

			<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-end gap-[clamp(20px,4vw,56px)]">
				<div>
					<Eyebrow>The new way</Eyebrow>
					<SectionHeading>
						One loop. From the first call to{" "}
						<RoughMark type="highlight" color="var(--accent)">
							the money landing
						</RoughMark>
						.
					</SectionHeading>
				</div>
				<Lede>
					Nothing gets retyped between these steps. The quote becomes the visit
					becomes the invoice, off the same numbers. Scroll — this is one real
					job going through.
				</Lede>
			</div>

			{/* Full-bleed stack: the pinned stage needs the viewport, not the
			    container column. */}
			<div className="-mx-[clamp(20px,4vw,40px)] mt-[clamp(24px,4vw,48px)]">
				<JobStack />
			</div>
		</Section>
	);
}
