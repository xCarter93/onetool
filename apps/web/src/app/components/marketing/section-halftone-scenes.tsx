import {
	DEFS,
	FADE_L,
	FADE_R,
	HalftoneCorners,
	uri,
} from "./halftone-corners";

/* Six section scenes, all drawn against the same chassis (halftone-corners.tsx)
 * and the same world the hero and the loop live in.
 *
 * What actually survives to the eye at 34/38 dash rows is the SKYLINE — the top
 * edge of the massed shapes — and nothing else. Ladders, chimneys, cones and
 * benches all disappear, and every scene built on the same rolling hill reads
 * as the same scene however different its furniture is. So each band gets a
 * categorically different profile, and the terrain is part of that difference
 * rather than a constant:
 *
 *   old way   irregular comb — stacks of clashing heights, gaps between
 *   try it    one dominant triangle over a low run
 *   what's in twin flat-topped masses at one height, a gap between (a gantry)
 *   compare   even comb — equal masses, equal gaps, a deliberate rhythm
 *   pricing   a clean diagonal ramp topped by one tall slab
 *   faq       a dome
 *
 * Authoring floor: a row is ~12 units of these 430-unit canvases, so nothing
 * under ~35 units of height registers. Solid fills only, no outlines, no
 * lettering. Every cluster is white base → terrain in `g` → structures in `h`
 * → ground bar → dissolve toward the page centre. */

const GROUND_L = `<rect y="408" width="620" height="22" fill="#3a3a3a"/>`;
const GROUND_R = `<rect y="408" width="720" height="22" fill="#3a3a3a"/>`;

const leftSvg = (body: string) =>
	uri(`<svg xmlns="http://www.w3.org/2000/svg" width="620" height="430" viewBox="0 0 620 430">
	<defs>${DEFS}${FADE_L}</defs>
	<rect width="620" height="430" fill="#fff"/>
	${body}
	${GROUND_L}
	<rect width="620" height="430" fill="url(#f)"/>
</svg>`);

const rightSvg = (body: string) =>
	uri(`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="430" viewBox="0 0 720 430">
	<defs>${DEFS}${FADE_R}</defs>
	<rect width="720" height="430" fill="#fff"/>
	${body}
	${GROUND_R}
	<rect width="720" height="430" fill="url(#f)"/>
</svg>`);

/* ------------------------------------------------------- 1. the old way ---- */
/* Irregular comb. No hill at all — the flat yard, with the lock-up and a
 * sloped-lid skip as the two masses that anchor it and stacked crates filling
 * between them at clashing heights. The profile is the section's argument: five
 * places to look, not one of them level with another. */

const OLD_WAY_LEFT = leftSvg(`
	<path d="M24 412 L24 268 L128 238 L128 412 Z" fill="url(#h)"/>
	<rect x="152" y="316" width="84" height="96" fill="url(#h)"/>
	<rect x="258" y="266" width="92" height="146" fill="url(#h)"/>
	<rect x="282" y="232" width="48" height="36" fill="url(#h)"/>
	<rect x="372" y="344" width="72" height="68" fill="url(#h)"/>
	<rect x="466" y="298" width="82" height="114" fill="url(#h)"/>`);

const OLD_WAY_RIGHT = rightSvg(`
	<rect x="46" y="352" width="72" height="60" fill="url(#h)"/>
	<rect x="140" y="270" width="90" height="142" fill="url(#h)"/>
	<rect x="252" y="330" width="78" height="82" fill="url(#h)"/>
	<rect x="352" y="228" width="98" height="184" fill="url(#h)"/>
	<rect x="378" y="194" width="52" height="36" fill="url(#h)"/>
	<path d="M520 412 L520 236 L716 186 L716 412 Z" fill="url(#h)"/>
	<rect x="566" y="298" width="104" height="114" fill="#c8c8c8"/>`);

export function OldWayHalftoneScene() {
	return <HalftoneCorners left={OLD_WAY_LEFT} right={OLD_WAY_RIGHT} />;
}

/* --------------------------------------------------- 2. try it yourself ---- */
/* One dominant triangle. The property the simulated quote is written against:
 * a long low fence run on the left, and on the right a single gable that goes
 * nearly to the top of the canvas — the only peak of its kind on the page. */

const TRY_IT_LEFT = leftSvg(`
	<path d="M0 430 L0 356 Q120 322 210 354 L350 390 L490 410 L620 430 Z" fill="url(#g)"/>
	<rect x="60" y="330" width="300" height="18" fill="url(#h)"/>
	<rect x="60" y="378" width="300" height="18" fill="url(#h)"/>
	<rect x="60" y="306" width="22" height="106" fill="url(#h)"/>
	<rect x="130" y="306" width="22" height="106" fill="url(#h)"/>
	<rect x="200" y="306" width="22" height="106" fill="url(#h)"/>
	<rect x="270" y="306" width="22" height="106" fill="url(#h)"/>
	<rect x="338" y="306" width="22" height="106" fill="url(#h)"/>
	<rect x="418" y="300" width="20" height="112" fill="url(#h)"/>
	<rect x="396" y="254" width="78" height="48" rx="11" fill="url(#h)"/>`);

const TRY_IT_RIGHT = rightSvg(`
	<path d="M720 430 L720 366 Q620 336 540 364 L400 394 L230 414 L60 430 Z" fill="url(#g)"/>
	<path d="M400 412 L400 250 L384 250 L560 96 L736 250 L720 250 L720 412 Z" fill="url(#h)"/>
	<rect x="498" y="314" width="88" height="98" fill="#c8c8c8"/>
	<rect x="250" y="322" width="18" height="90" fill="url(#h)"/>
	<rect x="194" y="264" width="128" height="60" fill="url(#h)"/>`);

export function TryItHalftoneScene() {
	return <HalftoneCorners left={TRY_IT_LEFT} right={TRY_IT_RIGHT} />;
}

/* ------------------------------------------------------ 3. what's inside ---- */
/* A gantry: two flat-topped masses levelled with each other and a clear gap
 * between, standing on terraced ground rather than a hill. The yard behind the
 * work — a loaded rack, the workshop, the water tower on its legs. */

const WORK_LEFT = leftSvg(`
	<path d="M0 430 L0 300 L150 300 L150 340 L300 340 L300 380 L450 380 L450 412 L620 412 L620 430 Z" fill="url(#g)"/>
	<rect x="30" y="194" width="216" height="22" fill="url(#h)"/>
	<rect x="30" y="246" width="216" height="18" fill="url(#h)"/>
	<rect x="40" y="194" width="20" height="106" fill="url(#h)"/>
	<rect x="216" y="194" width="20" height="106" fill="url(#h)"/>
	<rect x="326" y="254" width="106" height="86" fill="url(#h)"/>`);

const WORK_RIGHT = rightSvg(`
	<path d="M720 430 L720 300 L470 300 L470 348 L250 348 L250 392 L0 392 L0 430 Z" fill="url(#g)"/>
	<rect x="424" y="178" width="292" height="122" fill="url(#h)"/>
	<rect x="500" y="222" width="152" height="78" fill="#c8c8c8"/>
	<rect x="150" y="178" width="132" height="86" fill="url(#h)"/>
	<rect x="164" y="264" width="20" height="128" fill="url(#h)"/>
	<rect x="248" y="264" width="20" height="128" fill="url(#h)"/>
	<rect x="164" y="314" width="104" height="16" fill="url(#h)"/>`);

export function WorkHalftoneScene() {
	return <HalftoneCorners left={WORK_LEFT} right={WORK_RIGHT} />;
}

/* ------------------------------------------------------------ 4. compare ---- */
/* Even comb — equal masses at equal spacing, which is the only regular rhythm
 * on the page and reads instantly against the old way's irregular one. The
 * section's own argument: one truck out on its own, four identical vans for
 * the same money.  */

const COMPARE_LEFT = leftSvg(`
	<path d="M150 412 L150 336 L196 288 L286 288 L286 336 L420 336 L420 412 Z" fill="url(#h)"/>
	<circle cx="206" cy="410" r="24" fill="url(#h)"/>
	<circle cx="378" cy="410" r="24" fill="url(#h)"/>
	<rect x="440" y="330" width="150" height="60" fill="url(#h)"/>
	<circle cx="520" cy="404" r="18" fill="url(#h)"/>`);

const van = (x: number) => `
	<path d="M${x} 412 L${x} 352 L${x + 16} 320 L${x + 54} 320 L${x + 54} 292 L${x + 150} 292 L${x + 150} 412 Z" fill="url(#h)"/>
	<circle cx="${x + 32}" cy="410" r="18" fill="url(#h)"/>
	<circle cx="${x + 124}" cy="410" r="18" fill="url(#h)"/>`;

const COMPARE_RIGHT = rightSvg(`
	${van(88)}
	${van(260)}
	${van(432)}
	${van(604)}`);

export function CompareHalftoneScene() {
	return <HalftoneCorners left={COMPARE_LEFT} right={COMPARE_RIGHT} />;
}

/* ------------------------------------------------------------ 5. pricing ---- */
/* A clean diagonal. The ground itself is the motif here — one straight ramp
 * climbing out of the left margin and off the right edge, with the shopfront
 * you grow into planted at the top of it. */

const PRICING_LEFT = leftSvg(`
	<path d="M0 430 L0 400 L620 236 L620 430 Z" fill="url(#g)"/>
	<path d="M60 400 L60 344 L48 344 L116 290 L184 344 L172 344 L172 400 Z" fill="url(#h)"/>`);

const PRICING_RIGHT = rightSvg(`
	<path d="M720 430 L720 190 L0 400 L0 430 Z" fill="url(#g)"/>
	<rect x="470" y="118" width="240" height="182" fill="url(#h)"/>
	<rect x="452" y="226" width="276" height="36" fill="#a0a0a0"/>
	<rect x="516" y="262" width="148" height="38" fill="#c8c8c8"/>
	<rect x="386" y="138" width="18" height="184" fill="url(#h)"/>
	<path d="M404 146 L484 168 L404 192 Z" fill="url(#h)"/>`);

export function PricingHalftoneScene() {
	return <HalftoneCorners left={PRICING_LEFT} right={PRICING_RIGHT} />;
}

/* ---------------------------------------------------------------- 6. faq ---- */
/* Domes. The only curves on the page, set against very low rolling ground so
 * nothing competes with them — the polytunnels you walk up to and ask. Both
 * clusters are arcs on purpose: this band's list runs all the way to the floor,
 * and a rounded mass stays out of the questions in a way a tall post or a
 * roofline does not. */

const FAQ_LEFT = leftSvg(`
	<path d="M0 430 L0 384 Q140 358 260 380 L420 402 L620 416 L620 430 Z" fill="url(#g)"/>
	<path d="M40 412 L40 300 A150 150 0 0 1 340 300 L340 412 Z" fill="url(#h)"/>
	<rect x="158" y="316" width="64" height="96" fill="#c8c8c8"/>
	<rect x="392" y="348" width="110" height="64" fill="url(#h)"/>`);

const FAQ_RIGHT = rightSvg(`
	<path d="M720 430 L720 388 Q600 362 470 384 L300 404 L80 418 L0 430 Z" fill="url(#g)"/>
	<path d="M420 412 L420 292 A150 150 0 0 1 720 292 L720 412 Z" fill="url(#h)"/>
	<rect x="536" y="316" width="70" height="96" fill="#c8c8c8"/>
	<rect x="236" y="330" width="150" height="82" fill="url(#h)"/>`);

export function FaqHalftoneScene() {
	return <HalftoneCorners left={FAQ_LEFT} right={FAQ_RIGHT} />;
}
