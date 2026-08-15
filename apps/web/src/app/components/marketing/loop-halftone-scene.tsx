import { DEFS, uri } from "./halftone-corners";
import { HalftoneDash } from "./halftone-dash";

/* LOOP SCENE — the hero's halftone technique (halftone-dash.tsx) aimed at its
 * own artwork: the service street the job actually runs on, a pole and a house
 * on one side, the work van under a tree on the other. Anchored to the two
 * BOTTOM corners of the pinned stage and dissolved upward (fade="top"), so the
 * field frames the chapter cards along the floor and the sides and never
 * climbs behind them. A horizontal white overlay dissolves each cluster toward
 * the page centre. Dash colour rides the host's `color`; the pointer lights the
 * dashes, same as the hero. */

/* Ramps and the data-URI helper come from halftone-corners.tsx, shared with the
 * hero and every section scene. */

/* Left corner: the pole carries the height at the page edge, its wires sweep
 * off into the dissolve, and a gable house and hedge sit it on the ground. */
const LEFT = uri(`<svg xmlns="http://www.w3.org/2000/svg" width="620" height="430" viewBox="0 0 620 430">
	<defs>${DEFS}
		<linearGradient id="f" x1="0" y1="0" x2="1" y2="0">
			<stop offset="0.45" stop-color="#fff" stop-opacity="0"/>
			<stop offset="1" stop-color="#fff" stop-opacity="1"/>
		</linearGradient>
	</defs>
	<rect width="620" height="430" fill="#fff"/>
	<path d="M0 430 L0 300 Q96 262 178 302 L318 366 L470 404 L620 430 Z" fill="url(#g)"/>
	<rect x="52" y="44" width="17" height="362" fill="url(#h)"/>
	<rect x="6" y="98" width="110" height="12" fill="url(#h)"/>
	<rect x="16" y="160" width="90" height="10" fill="url(#h)"/>
	<path d="M60 110 Q220 156 400 152 L620 178" stroke="#242424" stroke-width="6" fill="none"/>
	<path d="M60 170 Q222 216 402 212 L620 238" stroke="#242424" stroke-width="6" fill="none"/>
	<path d="M186 430 L186 316 L178 316 L262 244 L346 316 L338 316 L338 430 Z" fill="url(#h)"/>
	<rect x="298" y="262" width="18" height="44" fill="url(#h)"/>
	<ellipse cx="452" cy="396" rx="76" ry="32" fill="url(#g)"/>
	<rect y="408" width="620" height="22" fill="#3a3a3a"/>
	<rect width="620" height="430" fill="url(#f)"/>
</svg>`);

/* Right corner: the work van with a ladder racked on the roof holds the page
 * edge, a tree stands behind it and fades toward the middle of the page. */
const RIGHT = uri(`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="430" viewBox="0 0 720 430">
	<defs>${DEFS}
		<linearGradient id="f" x1="1" y1="0" x2="0" y2="0">
			<stop offset="0.45" stop-color="#fff" stop-opacity="0"/>
			<stop offset="1" stop-color="#fff" stop-opacity="1"/>
		</linearGradient>
	</defs>
	<rect width="720" height="430" fill="#fff"/>
	<path d="M720 430 L720 300 Q620 258 534 302 L392 364 L236 402 L60 430 Z" fill="url(#g)"/>
	<ellipse cx="252" cy="250" rx="86" ry="100" fill="url(#g)"/>
	<rect x="242" y="330" width="20" height="90" fill="url(#h)"/>
	<path d="M394 412 L394 340 L418 300 L494 300 L494 262 L690 262 L690 412 Z" fill="url(#h)"/>
	<rect x="470" y="242" width="204" height="12" fill="url(#h)"/>
	<circle cx="456" cy="412" r="22" fill="url(#h)"/>
	<circle cx="634" cy="412" r="22" fill="url(#h)"/>
	<rect y="408" width="720" height="22" fill="#3a3a3a"/>
	<rect width="720" height="430" fill="url(#f)"/>
</svg>`);

export function LoopHalftoneScene() {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 overflow-hidden"
		>
			{/* Hidden on phones, like the hero's left cluster: at that width it would
			    sit under the card rather than beside it. */}
			<HalftoneDash
				src={LEFT}
				rows={34}
				cellRatio={2}
				power={1.1}
				minTone={0.05}
				light={0.9}
				lightRadius={0.55}
				fade="top"
				className="pointer-events-none absolute bottom-0 left-0 hidden aspect-[620/430] w-[clamp(240px,32vw,600px)] text-(--accent) opacity-[0.55] md:block"
			/>
			<HalftoneDash
				src={RIGHT}
				rows={38}
				cellRatio={2}
				power={1.1}
				minTone={0.05}
				light={0.9}
				lightRadius={0.55}
				fade="top"
				/* Small floor on purpose: on a phone the stage's bottom band is only
				   ~20vh, and a wider cluster would run into the centred progress rail. */
				className="pointer-events-none absolute bottom-0 right-0 aspect-[720/430] w-[clamp(190px,36vw,680px)] text-(--accent) opacity-[0.55]"
			/>
		</div>
	);
}
