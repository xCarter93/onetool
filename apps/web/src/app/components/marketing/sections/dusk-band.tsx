import Image from "next/image";
import FallingRays from "@/components/react-bits/falling-rays";
import { AmbientLayer } from "../ambient";
import { Container, Eyebrow } from "../primitives";

/* DUSK BAND — the 6:41 AM band's closing mirror, placed before Pricing so the
 * page reads as one working day. Caption sits right where the dawn band's sat
 * left; the wash walks in from the right accordingly. */

const WASH =
	"linear-gradient(260deg, color-mix(in srgb, var(--paper) 92%, transparent) 0%, color-mix(in srgb, var(--paper) 55%, transparent) 34%, transparent 62%)";

export function DuskBand() {
	return (
		<section className="relative">
			<figure className="relative h-[clamp(280px,38vw,520px)] overflow-hidden">
				<Image
					src="/landing/crew-dusk.jpg"
					alt="Two crew members pushing mowers up a suburban street toward a low golden sunset, their trailer and truck parked at the curb"
					fill
					sizes="100vw"
					className="object-cover saturate-[0.72]"
					style={{ objectPosition: "center 55%" }}
				/>
				{/* Day's end: the dawn band's rising streaks, inverted — light raining
				    down the frame. Same additive-glow family, same slot in the stack:
				    above the photo, under the wash and the caption. */}
				<AmbientLayer opacity={0.45}>
					<FallingRays color1="#ff8a50" color2="#c66a9e" rayCount={24} bgGlow={0.6} />
				</AmbientLayer>

				<div
					aria-hidden="true"
					className="absolute inset-0"
					style={{ background: WASH }}
				/>
				<figcaption className="absolute inset-0 flex items-center">
					<Container className="flex w-full justify-end">
						<div className="max-w-[22rem] text-right">
							<Eyebrow className="justify-end">5:48 PM</Eyebrow>
							<p className="mt-3 text-[clamp(26px,3.2vw,42px)] font-semibold leading-[1.1] tracking-[-0.03em] text-balance text-(--ink)">
								The paperwork already did itself.
							</p>
							<p className="mt-3 text-[15px] leading-[1.6] text-(--ink-2)">
								Invoices out, reminders queued, tomorrow routed.
							</p>
						</div>
					</Container>
				</figcaption>
			</figure>
		</section>
	);
}
