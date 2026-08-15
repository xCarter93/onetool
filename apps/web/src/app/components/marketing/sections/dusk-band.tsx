import Image from "next/image";
import { Container, Eyebrow } from "../primitives";

/* DUSK BAND — the 6:41 AM band's closing mirror, placed before Pricing so the
 * page reads as one working day. Caption sits right where the dawn band's sat
 * left; the wash walks in from the right accordingly. */

const WASH =
	"linear-gradient(260deg, color-mix(in srgb, var(--paper) 92%, transparent) 0%, color-mix(in srgb, var(--paper) 55%, transparent) 34%, transparent 62%)";

export function DuskBand() {
	return (
		<section className="relative border-b border-(--rule)">
			<figure className="relative h-[clamp(280px,38vw,520px)] overflow-hidden">
				<Image
					src="/landing/crew-dusk.jpg"
					alt="Two crew members pushing mowers up a suburban street toward a low golden sunset, their trailer and truck parked at the curb"
					fill
					sizes="100vw"
					className="object-cover saturate-[0.72]"
					style={{ objectPosition: "center 55%" }}
				/>
				<div
					aria-hidden="true"
					className="absolute inset-0"
					style={{ background: WASH }}
				/>
				<figcaption className="absolute inset-0 flex items-center">
					<Container className="flex w-full justify-end">
						<div className="max-w-[22rem] text-right">
							<Eyebrow className="justify-end">5:48 PM</Eyebrow>
							<p className="mt-3 text-[clamp(24px,3vw,38px)] font-semibold leading-[1.1] tracking-[-0.03em] text-balance text-(--ink)">
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
