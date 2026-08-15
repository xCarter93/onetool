import Image from "next/image";
import { Container, Eyebrow } from "../primitives";

/* FIELD BAND — comp lines 168–178. A full-bleed photograph, not a card: the
 * page pauses on the six-in-the-morning reality the product is aimed at. The
 * paper gradient walks in from the left so the caption sits on page color
 * rather than on the image, in either theme. */

const WASH =
	"linear-gradient(100deg, color-mix(in srgb, var(--paper) 92%, transparent) 0%, color-mix(in srgb, var(--paper) 55%, transparent) 34%, transparent 62%)";

export function FieldBand() {
	return (
		<section className="relative border-b border-(--rule)">
			<figure className="relative h-[clamp(280px,38vw,520px)] overflow-hidden">
				<Image
					src="/landing/field-dawn-van.jpg"
					alt="A white service van parked at a suburban curb before dawn, its rear doors open on a shelved rack of tools"
					fill
					sizes="100vw"
					className="object-cover saturate-[0.72]"
					style={{ objectPosition: "center 62%" }}
				/>
				<div
					aria-hidden="true"
					className="absolute inset-0"
					style={{ background: WASH }}
				/>
				<figcaption className="absolute inset-0 flex items-center">
					<Container className="w-full">
						<Eyebrow>6:41 AM</Eyebrow>
						<p className="mt-3 max-w-[20rem] text-[clamp(24px,3vw,38px)] font-semibold leading-[1.1] tracking-[-0.03em] text-balance text-(--ink)">
							{"You're already working. The paperwork should be too."}
						</p>
					</Container>
				</figcaption>
			</figure>
		</section>
	);
}
