import { DEFS, TUNING, uri } from "./halftone-corners";
import { HalftoneDash } from "./halftone-dash";

/* HERO SCENE — Twenty's halftone-mountain move (see halftone-dash.tsx for the
 * ported renderer + pointer light) aimed at our own artwork: instead of
 * mountains, a field-service street corner. Two clusters anchored to the
 * hero's bottom corners — rooflines, a work van, a hedge row, low hills —
 * authored as grayscale SVGs where DARK areas grow dashes. Vertical gradients
 * taper the dash length toward each shape's top, and a white overlay dissolves
 * each cluster toward the page center so the copy, the particle mark, and the
 * job ledger keep clear air. Dash color rides the host's `color`, so
 * text-(--accent) themes it in both schemes; hovering lights the dashes up. */

/* Ramps and the data-URI helper come from halftone-corners.tsx, which every
 * section scene also draws with — one edit moves the whole page's halftone. */

/* Left corner: low hill, a gable house with a chimney, a tree, a hedge. */
const LEFT = uri(`<svg xmlns="http://www.w3.org/2000/svg" width="620" height="380" viewBox="0 0 620 380">
	<defs>${DEFS}
		<linearGradient id="f" x1="0" y1="0" x2="1" y2="0">
			<stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
			<stop offset="1" stop-color="#fff" stop-opacity="1"/>
		</linearGradient>
	</defs>
	<rect width="620" height="380" fill="#fff"/>
	<path d="M0 380 L0 214 Q84 168 148 208 L288 292 L430 342 L560 380 Z" fill="url(#g)"/>
	<rect x="278" y="192" width="20" height="52" fill="url(#h)"/>
	<path d="M150 380 L150 252 L142 252 L232 172 L322 252 L314 252 L314 380 Z" fill="url(#h)"/>
	<ellipse cx="402" cy="252" rx="50" ry="62" fill="url(#g)"/>
	<rect x="394" y="300" width="16" height="80" fill="url(#h)"/>
	<ellipse cx="500" cy="352" rx="62" ry="30" fill="url(#g)"/>
	<rect y="358" width="620" height="22" fill="#3a3a3a"/>
	<rect width="620" height="380" fill="url(#f)"/>
</svg>`);

/* Right corner (taller, the anchor of the pair): rising hill off the page
 * edge, a wide gable barn, the work van parked out front, a dotted sun. */
const RIGHT = uri(`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="430" viewBox="0 0 720 430">
	<defs>${DEFS}
		<linearGradient id="f" x1="1" y1="0" x2="0" y2="0">
			<stop offset="0.55" stop-color="#fff" stop-opacity="0"/>
			<stop offset="1" stop-color="#fff" stop-opacity="1"/>
		</linearGradient>
	</defs>
	<rect width="720" height="430" fill="#fff"/>
	<circle cx="560" cy="135" r="44" fill="#c6c6c6"/>
	<path d="M720 430 L720 150 Q640 118 560 190 L430 300 L300 372 L170 430 Z" fill="url(#g)"/>
	<path d="M360 430 L360 300 L350 300 L455 218 L560 300 L550 300 L550 430 Z" fill="url(#h)"/>
	<ellipse cx="322" cy="402" rx="52" ry="24" fill="url(#g)"/>
	<path d="M100 412 L100 366 L112 344 L150 344 L150 322 L268 322 L268 412 Z" fill="url(#h)"/>
	<circle cx="138" cy="412" r="17" fill="url(#h)"/>
	<circle cx="232" cy="412" r="17" fill="url(#h)"/>
	<rect y="406" width="720" height="24" fill="#3a3a3a"/>
	<rect width="720" height="430" fill="url(#f)"/>
</svg>`);

export function HeroHalftoneScene() {
	return (
		<>
			<HalftoneDash
				src={LEFT}
				rows={34}
				{...TUNING}
				className="pointer-events-none absolute bottom-0 left-0 hidden aspect-[620/380] w-[clamp(240px,34vw,560px)] text-(--accent) opacity-80 md:block"
			/>
			<HalftoneDash
				src={RIGHT}
				rows={40}
				{...TUNING}
				className="pointer-events-none absolute bottom-0 right-0 aspect-[720/430] w-[clamp(280px,42vw,690px)] text-(--accent) opacity-80"
			/>
		</>
	);
}
