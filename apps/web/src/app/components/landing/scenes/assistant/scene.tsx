import { GuideLines } from "../../blueprint/guide-lines";
import { DrawIn } from "../../blueprint/draw-in";
import { cn } from "@/lib/utils";
import { ASSISTANT_LATTICE } from "./assistant-data";
import { AssistantPanel } from "./assistant-panel";

/**
 * A-101 act 3 — "Ask your business anything".
 *
 * Server component end to end; the single <DrawIn> observer is the only
 * JavaScript, and it does nothing but add one class. Every beat of the
 * choreography is a CSS `--bp-delay`, so the whole scene inherits the
 * reduced-motion terminal state and the <noscript> floor for free — and the
 * reduced-motion still is the full terminal transcript: both answers, the
 * resolved chips and the finished chart.
 *
 * Renders standalone. It carries no sheet code and no heading: the rail owns
 * scene identity and reads it from meta.ts, so putting either here would
 * duplicate the rail's own label.
 *
 * Two inks: the miniature uses the product's chart palette inside the panel,
 * because that is what the product looks like. Everything outside the panel —
 * the lattice, the leader, the callout — stays zinc and sky.
 */
export function AssistantScene({ className }: { className?: string }) {
	return (
		<DrawIn className={cn("relative mx-auto w-full max-w-3xl", className)}>
			{/*
			 * Quiet construction lattice. Static rather than wiped: the hero owns
			 * the page's one orchestrated draw-on moment, and inside a crossfading
			 * rail the paper should already be there while the transcript is what
			 * moves. Static also means no second client island.
			 *
			 * The panel is an opaque plate, so guides passing behind it are
			 * occluded rather than clashing, and the mask keeps them off the bands
			 * where the callout label sits.
			 */}
			<svg
				aria-hidden="true"
				focusable="false"
				className="pointer-events-none absolute inset-0 h-full w-full"
				style={{
					maskImage:
						"linear-gradient(to bottom, transparent, #000 12%, #000 84%, transparent)",
				}}
			>
				<GuideLines guides={ASSISTANT_LATTICE} />
			</svg>

			{/* Panel left, annotation gutter right — the annotated-drawing layout.
			    Below lg the gutter does not exist and the callout hides itself. */}
			<div className="relative flex justify-center lg:justify-start">
				<AssistantPanel />
			</div>
		</DrawIn>
	);
}

export default AssistantScene;
