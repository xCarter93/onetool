import Image from "next/image";
import PerspectiveGrid from "@/components/react-bits/perspective-grid";
import { Iphone } from "@/components/ui/iphone";
import { AmbientLayer } from "../ambient";
import { CheckItem, Lede, Section, SectionHeading } from "../primitives";

import { AppStoreBadge } from "../story/app-store-badge";

export function OnTheJob() {
	return (
		<Section
			id="phone"
			divider
			className="overflow-hidden"
			containerClassName="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-center gap-[clamp(28px,4vw,64px)]"
		>
			{/* Disable the grid's opaque black fade on the paper background. */}
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
				<SectionHeading size="md" className="mt-0">
					Your whole day&rsquo;s work, in your pocket.
				</SectionHeading>
				<Lede className="max-w-[32rem]">
					The iOS app shows the same visits, clients and numbers as the web app, updated
					the moment anyone touches them. Write the visit up in the driveway and it is on
					the office screen before you turn the key.
				</Lede>
				<ul className="mt-7 grid max-w-[30rem] gap-[10px]">
					<CheckItem>Real-time sync between phone and web</CheckItem>
					<CheckItem>The day&rsquo;s visits, addresses and notes on your phone</CheckItem>
					<CheckItem>Switch between organisations on the go</CheckItem>
				</ul>
				<p className="mt-4 max-w-[30rem] text-[13px] leading-[1.6] text-(--ink-3)">
					The app needs an internet connection.
				</p>
				<AppStoreBadge className="mt-7 h-11" />
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

				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0"
					style={{
						background:
							"linear-gradient(180deg,color-mix(in srgb,var(--paper) 35%,transparent) 0%,transparent 34%,color-mix(in srgb,var(--paper) 55%,transparent) 100%)",
					}}
				/>

				{/* Height controls the phone size without changing its aspect ratio. */}
				<div className="absolute left-1/2 top-1/2 aspect-[433/882] h-[86%] -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_26px_54px_rgba(16,24,40,0.38)]">
					<Iphone
						src="/landing/app-today.webp"
						role="img"
						aria-label="The OneTool iOS app open on the day's schedule, with visits, overdue total and quotes waiting"
					/>
				</div>
			</div>
		</Section>
	);
}
