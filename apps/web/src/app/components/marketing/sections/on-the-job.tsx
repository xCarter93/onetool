import Image from "next/image";
import PerspectiveGrid from "@/components/react-bits/perspective-grid";
import { Iphone } from "@/components/ui/iphone";
import { AmbientLayer } from "../ambient";
import { CheckItem, Eyebrow, Lede, Section, SectionHeading } from "../primitives";

/* On the job — the offline story. A truck-cab photo with the shipping iOS app
 * standing in front of it, in the shared Iphone frame the rest of the app
 * uses. The screen is a real capture, not a rebuilt mock. */

const APP_STORE_URL =
	"https://apps.apple.com/us/app/onetool-small-business-crm/id6757319255";

export function OnTheJob() {
	return (
		<Section
			id="phone"
			divider
			className="overflow-hidden"
			containerClassName="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-center gap-[clamp(28px,4vw,64px)]"
		>
			{/* The road ahead — an ink grid receding to the horizon, kept to a
			    whisper and masked away from the top so it never crowds the phone.
			    bottomFade="" is load-bearing: its default paints an opaque black DOM
			    gradient that would black out the paper. */}
			<AmbientLayer
				opacity={0.08}
				fullBleed
				style={{
					WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 55%)",
					maskImage: "linear-gradient(to bottom, transparent 0%, #000 55%)",
				}}
			>
				<PerspectiveGrid
					width="100%"
					height="100%"
					bottomFade=""
					color="#8a8782"
					lineThickness={1}
					speed={0.3}
					curve={0}
				/>
			</AmbientLayer>

			<div className="relative">
				<Eyebrow>On the job</Eyebrow>
				<SectionHeading size="md">
					Built to work in the truck, even with no signal at all.
				</SectionHeading>
				<Lede className="max-w-[32rem]">
					The iOS app keeps your day on the device, so a basement with no signal
					doesn&rsquo;t stop you writing up the visit. When you come back into range
					it syncs by itself, with nothing lost and nothing to retry.
				</Lede>
				<ul className="mt-7 grid max-w-[30rem] gap-[10px]">
					<CheckItem>Real-time sync between phone and web</CheckItem>
					<CheckItem>Offline day plan with addresses and notes</CheckItem>
					<CheckItem>Switch between organisations on the go</CheckItem>
				</ul>
				<a
					href={APP_STORE_URL}
					target="_blank"
					rel="noopener noreferrer"
					className="mt-7 inline-flex items-center gap-2 text-[16px] font-semibold text-(--accent-ink)"
				>
					Get it on the App Store <span aria-hidden="true">→</span>
				</a>
			</div>

			<div className="relative min-h-[clamp(400px,44vw,600px)] overflow-hidden rounded-[18px]">
				<Image
					src="/landing/truck-cab-phone.jpg"
					alt="A hand holding a phone above a paper job log on a clipboard, in the cab of a work truck"
					fill
					sizes="(min-width: 1024px) 50vw, 100vw"
					className="object-cover opacity-85"
					style={{ filter: "saturate(.62) contrast(.96)" }}
				/>

				{/* paper gradient — settles the photo back into the page */}
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0"
					style={{
						background:
							"linear-gradient(180deg,color-mix(in srgb,var(--paper) 35%,transparent) 0%,transparent 34%,color-mix(in srgb,var(--paper) 55%,transparent) 100%)",
					}}
				/>

				{/* Height-driven: the wrapper carries the frame ratio so the whole
				    device fits the photo no matter how the section reflows. Sizing the
				    Iphone on both axes would drop its ratio and letterbox the screen. */}
				<div className="absolute left-1/2 top-1/2 aspect-[433/882] h-[86%] -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_26px_54px_rgba(16,24,40,0.38)]">
					<Iphone
						className=""
						src="/landing/app-today.webp"
						role="img"
						aria-label="The OneTool iOS app open on the day's schedule, with visits, overdue total and quotes waiting"
					/>
				</div>
			</div>
		</Section>
	);
}
