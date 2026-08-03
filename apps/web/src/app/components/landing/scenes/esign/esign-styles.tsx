import { SIGNATURE_MS } from "./esign-data";

/**
 * The one piece of choreography the shared kit does not already own: the
 * handwriting reveal.
 *
 * WHY A CLIP WIPE. The signature is HTML text in Caveat, not a traced path, so
 * there is no stroke to draw. Even if it were traced, Motion's `pathLength`
 * overwrites `strokeDasharray` outright (playbook failure mode #1) and the
 * flourishes in a signature are exactly where a destroyed dash pattern shows.
 * A left-to-right `clip-path: inset()` wipe at constant velocity is the pen
 * travelling: one property, one small element, no measurement, no JavaScript.
 * The inset overshoots by 4% on both sides so Caveat's ascenders and the tail
 * of the "g" are never shaved by the clip box.
 *
 * WHY A SCOPED <style> RATHER THAN globals.css. This keyframe exists for one
 * scene; the blueprint kit's shared classes (.bp-draw/.bp-fade-in/.bp-rise/
 * .bp-stamp) stay the vocabulary everything else uses. React 19 hoists a
 * <style> carrying `href` + `precedence` into <head> and dedupes by href, so
 * rendering the scene twice (rail + a standalone shell) emits one rule.
 *
 * Both failure floors that .bp-* classes get from the kit are reproduced here,
 * because an element that starts fully clipped and never unclips is permanently
 * invisible:
 *  - reduced motion  -> no animation, no clip.
 *  - no JavaScript   -> <DrawIn> never adds .bp-in, so <noscript> unclips.
 */
const ESIGN_CSS = [
	/* Fully clipped from the right. */
	".esign-write{clip-path:inset(-4% 100% -4% -4%)}",
	`.bp-in .esign-write{animation:esign-write ${SIGNATURE_MS}ms linear var(--bp-delay,0s) forwards}`,
	"@keyframes esign-write{to{clip-path:inset(-4% -4% -4% -4%)}}",
	"@media (prefers-reduced-motion:reduce){.esign-write,.bp-in .esign-write{animation:none!important;clip-path:none}}",
].join("");

export function EsignStyles() {
	return (
		<>
			<style href="landing-esign-scene" precedence="medium">
				{ESIGN_CSS}
			</style>
			<noscript>
				<style>{".esign-write{clip-path:none}"}</style>
			</noscript>
		</>
	);
}
