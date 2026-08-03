import { GuideLines } from "../../blueprint/guide-lines";
import { DrawIn } from "../../blueprint/draw-in";
import { ESIGN_LATTICE, QUOTE } from "./esign-data";
import { EsignStyles } from "./esign-styles";
import { PortalMiniature } from "./portal-miniature";

/**
 * A-101 act 2 — "Get signed faster". The stage only; the rail owns the sheet
 * code, the scrollspy tab and the heading (see ./meta.ts).
 *
 * SERVER COMPONENT, top to bottom. The entire choreography is CSS `--bp-delay`
 * values on the kit's `.bp-rise` / `.bp-fade-in` / `.bp-stamp` classes plus one
 * scoped clip-wipe keyframe, so the only JavaScript in the scene is <DrawIn>'s
 * single IntersectionObserver. No Motion island, no state, no effect.
 *
 * TERMINAL STATE IS THE TEST. Under `prefers-reduced-motion: reduce`, and with
 * JavaScript disabled entirely, every layer lands on its final state: the
 * signature is complete, the terms are checked, the receipt reads "Quote
 * approved — Approved by Marisol Vega", the badge reads "Accepted", the journey
 * reads "Signed by Marisol Vega", and the APPROVED stamp is on the paper. The
 * still is the scene.
 *
 * ONE ANNOTATION DEVICE. The stamp. The blueprint layer under the miniature is
 * a quiet terminating lattice and nothing else — no dimension strings, no
 * leader lines, no revision cloud. The opaque card faces occlude the guides
 * that pass beneath them, which is why no guide ever runs under text.
 */
export function EsignScene() {
	return (
		<DrawIn className="relative px-4 py-6 sm:px-6">
			<EsignStyles />

			{/*
			 * The lattice. Pixel-mapped (no viewBox) so `4 6` is literally 4px on
			 * and 6px off at every breakpoint — a scaled viewBox stretches dash
			 * rhythm even with vector-effect pinning the stroke width. Static: the
			 * scene's motion budget belongs to the signature and the stamp.
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
				<GuideLines guides={ESIGN_LATTICE} />
			</svg>

			{/*
			 * Every fact the miniature shows, in one narration. The miniature itself
			 * is aria-hidden below: it imitates tabs, a checkbox and a submit button,
			 * and a screen reader walking a fake form is worse than no artwork at
			 * all. This paragraph is the accessible scene.
			 */}
			<p className="sr-only">
				The client portal, quote {QUOTE.number} — {QUOTE.title} from{" "}
				{QUOTE.business}, sent to {QUOTE.client} on {QUOTE.sentOn} and valid
				until {QUOTE.validUntil}. Three line items: spring cleanup — beds,
				edging and haul-away, $950.00; weekly mowing April to October, 28
				visits, $3,500.00; mulch install, 6 cubic yards, $400.00. Total{" "}
				{QUOTE.total}. The quote starts at Awaiting decision. {QUOTE.client}{" "}
				types her name as an electronic signature, accepts the scope and terms,
				and approves the quote. It is stamped Approved: the status becomes
				Accepted and the quote journey reads Signed by {QUOTE.client},{" "}
				{QUOTE.approvedAt}.
			</p>

			<div className="relative" aria-hidden="true">
				<PortalMiniature />
			</div>
		</DrawIn>
	);
}
