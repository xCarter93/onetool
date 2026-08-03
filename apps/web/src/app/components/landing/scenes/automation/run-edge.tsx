import type { CSSProperties } from "react";
import { RUN } from "./automation-data";

/**
 * The page's ONE marching-dash element (PRD motion budget), built local to this
 * scene rather than in the shared kit — the budget is exactly one, and a kit
 * primitive invites a second.
 *
 * WHAT IT IS. The product's own run animation: `flow-edge-running` in
 * flow-theme.css marches a `6 4` dash to `stroke-dashoffset: -10` over 700ms
 * linear. Here that pattern is confined to a short window travelling down the
 * true lane, so the run reads as a pulse arriving at each step rather than a
 * whole path buzzing.
 *
 * WHY NOT SVG. The true lane is a straight vertical run, so the window is just a
 * 2px-wide box with a repeating gradient: travel is one `translate`, marching is
 * one `background-position`. That avoids the two traps a clipped SVG stroke
 * would walk into — an animated `<rect>` inside `<defs>` needs a per-instance
 * fragment id (playbook failure mode #4), and a Motion `whileInView` on it never
 * fires at all, because an element inside `<defs>` is not rendered and so never
 * intersects the viewport.
 *
 * WHY A SCOPED <style> RATHER THAN globals.css. These keyframes exist for one
 * scene; the kit's shared classes stay the vocabulary everything else uses.
 * React 19 hoists a <style> carrying `href` + `precedence` into <head> and
 * dedupes by href, so rendering the scene twice emits one rule. It also puts the
 * pulse on the SAME `.bp-in` trigger as every other beat in the scene, which is
 * what keeps the rings and the pulse in step.
 *
 * FAILURE FLOORS. The pulse's safe state is "absent", which makes both floors
 * trivial: reduced motion kills the animation and the base rule holds it at
 * opacity 0; with no JavaScript `.bp-in` is never added and the same base rule
 * applies. Nothing is stranded visible and nothing is stranded invisible that
 * carried a fact — the run's outcome is told by the emerald rings, which are
 * plain `.bp-fade-in` and have the kit's own floors.
 *
 * `forwards`, not `both`: during the lead-in delay the element must stay at its
 * base opacity 0, or a static dashed segment sits on the canvas before the run
 * starts.
 */
const RUN_CSS = [
	`.automation-run{opacity:0;translate:0 ${RUN.from}px}`,
	`.bp-in .automation-run{animation:automation-run-travel ${RUN.travel}s linear var(--bp-delay,0s) forwards,automation-run-march ${RUN.dashPeriod}s linear var(--bp-delay,0s) ${RUN.dashPlays}}`,
	`@keyframes automation-run-travel{from{opacity:1;translate:0 ${RUN.from}px}to{opacity:1;translate:0 ${RUN.to}px}}`,
	`@keyframes automation-run-march{from{background-position:0 0}to{background-position:0 ${RUN.dashPeriodPx}px}}`,
	"@media (prefers-reduced-motion:reduce){.automation-run,.bp-in .automation-run{animation:none!important;opacity:0}}",
].join("");

export function RunPulse() {
	return (
		<>
			<style href="landing-automation-scene" precedence="medium">
				{RUN_CSS}
			</style>
			{/*
			 * Rendered before the cards, so the cards paint over it and the pulse
			 * passes behind each step exactly the way it does in the app.
			 */}
			<span
				aria-hidden="true"
				className="automation-run pointer-events-none absolute"
				style={
					{
						left: RUN.x - RUN.width / 2,
						top: 0,
						width: RUN.width,
						height: RUN.window,
						backgroundImage: `linear-gradient(to bottom, var(--primary) 0 ${RUN.dashOn}px, transparent ${RUN.dashOn}px ${RUN.dashPeriodPx}px)`,
						backgroundSize: `100% ${RUN.dashPeriodPx}px`,
						backgroundRepeat: "repeat-y",
						"--bp-delay": `${RUN.delay}s`,
					} as CSSProperties
				}
			/>
		</>
	);
}
