import { SheetCode } from "./blueprint/sheet-frame";
import { FeatureAnimationLazy } from "./feature-animation-lazy";

/**
 * A-100 — the big product moment directly under the cover sheet: the full
 * Showcase reel playing ambient in one wide drafted plate (Attio's
 * hero-screenshot slot, except ours moves). Controls stay on so a visitor
 * can scrub the tour.
 */
export function TourReel() {
	return (
		<section
			aria-label="Product tour"
			className="relative p-6 sm:p-10 lg:p-14"
		>
			<div className="flex flex-wrap items-baseline justify-between gap-4">
				<SheetCode code="A-100" label="The tour" />
				<p className="text-sm text-muted-foreground">
					Two minutes, quote to paid.
				</p>
			</div>
			<div className="mt-5 border border-bp-line bg-card">
				<FeatureAnimationLazy feature="showcase" controls />
			</div>
		</section>
	);
}
