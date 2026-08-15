import Image from "next/image";
import type { CSSProperties } from "react";
import PerspectiveGrid from "@/components/react-bits/perspective-grid";
import { AmbientLayer } from "../ambient";
import { IOSDevice } from "../ios-device";
import { CheckItem, Eyebrow, Lede, Section, SectionHeading } from "../primitives";

/* On the job — the offline story. A truck-cab photo, a "signal echo" of
 * concentric rings (the phone finding a bar again), and an iOS mock holding
 * the day plan. Apple's system grays/hexes live ONLY inside the phone frame:
 * device-mock realism, never workspace tokens. */

const APP_STORE_URL =
	"https://apps.apple.com/us/app/onetool-small-business-crm/id6757319255";

/** 8 rings, 210→700px. Accent for the innermost pair, ink beyond; the comp
 * seats them at 46% so the echo reads as coming from the phone, not the box. */
const RINGS: { size: number; color: string; opacity: number }[] = [
	{ size: 210, color: "var(--accent)", opacity: 0.24 },
	{ size: 280, color: "var(--accent)", opacity: 0.21 },
	{ size: 350, color: "var(--ink)", opacity: 0.16 },
	{ size: 420, color: "var(--ink)", opacity: 0.13 },
	{ size: 490, color: "var(--ink)", opacity: 0.11 },
	{ size: 560, color: "var(--ink)", opacity: 0.08 },
	{ size: 630, color: "var(--ink)", opacity: 0.06 },
	{ size: 700, color: "var(--ink)", opacity: 0.04 },
];

const RIPPLE_MASK = "linear-gradient(to bottom,#000 12%,transparent 86%)";

const DAY_PLAN: { time: string; who: string; what: string; tone: string }[] = [
	{
		time: "8:00",
		who: "Whitfield Property Group",
		what: "412 Ashfield Ct · furnace install",
		tone: "rgba(60,60,67,.6)",
	},
	{
		time: "10:30",
		who: "R. Alvarez",
		what: "88 Kerr Rd · diagnostic",
		tone: "#0A84FF",
	},
	{
		time: "1:15",
		who: "Northgate HOA",
		what: "Quarterly filters · 6 units",
		tone: "rgba(60,60,67,.6)",
	},
	{
		time: "3:00",
		who: "Bramley Cafe",
		what: "Rooftop unit · callback",
		tone: "rgba(60,60,67,.6)",
	},
];

/* iOS mock atoms — grouped-list metrics from the comp. */
const IOS_MUTED = "text-[rgba(60,60,67,0.6)]";
const IOS_HAIRLINE = "border-b-[0.5px] border-[rgba(60,60,67,0.18)]";
const IOS_GROUP_LABEL = `px-4 pb-[7px] text-[13px] font-semibold uppercase tracking-[0.06em] ${IOS_MUTED}`;
const IOS_GROUP = "overflow-hidden rounded-[26px] bg-white";
const IOS_ROW_TITLE = "text-[17px] tracking-[-0.02em] text-black";
const IOS_ROW_META = `text-[14px] tracking-[-0.01em] ${IOS_MUTED}`;

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
					Works in the truck. Works with one bar. Works with none.
				</SectionHeading>
				<Lede className="max-w-[32rem]">
					The iOS app keeps your day on the device, so a basement with no signal
					doesn&rsquo;t stop you writing up the visit. When you come back into range it
					syncs — no &ldquo;retry&rdquo;, no lost notes.
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

				{/* signal echo: the phone syncing the moment it comes back into range */}
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0"
					style={{ WebkitMaskImage: RIPPLE_MASK, maskImage: RIPPLE_MASK }}
				>
					{RINGS.map((ring, i) => {
						const style: CSSProperties = {
							width: ring.size,
							height: ring.size,
							translate: "-50% -50%",
							border: `1px solid ${ring.color}`,
							opacity: ring.opacity,
							animation: `lp-ripple 3.2s var(--lp-ease) ${i * 60}ms infinite`,
						};
						return (
							<span
								key={ring.size}
								className="absolute left-1/2 top-[46%] rounded-full"
								style={style}
							/>
						);
					})}
				</div>

				{/* paper gradient — settles the photo back into the page */}
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0"
					style={{
						background:
							"linear-gradient(180deg,color-mix(in srgb,var(--paper) 35%,transparent) 0%,transparent 34%,color-mix(in srgb,var(--paper) 55%,transparent) 100%)",
					}}
				/>

				<div
					className="absolute left-1/2 top-[44px] w-[402px]"
					style={{
						transform: "translateX(-50%) scale(.68)",
						transformOrigin: "top center",
					}}
				>
					<IOSDevice time="7:12" noService>
						<div className="grid gap-[22px] px-4 pb-10">
							<div className="flex items-center gap-[10px] rounded-[14px] bg-[rgba(255,159,10,0.14)] px-[14px] py-[11px]">
								<span
									aria-hidden="true"
									className="h-[9px] w-[9px] flex-none rounded-full bg-[#FF9F0A]"
								/>
								<span className="text-[14.5px] font-[590] tracking-[-0.01em] text-[#8A5A00]">
									Offline — everything saved on this phone
								</span>
							</div>

							<div>
								<p className={IOS_GROUP_LABEL}>Tuesday · 4 visits · 38 mi</p>
								<div className={IOS_GROUP}>
									{DAY_PLAN.map((visit) => (
										<div
											key={visit.time}
											className={`flex min-h-[64px] items-center gap-3 px-4 py-[10px] ${IOS_HAIRLINE}`}
										>
											<span
												className="w-[52px] flex-none text-[15px] font-[590] tabular-nums"
												style={{ color: visit.tone }}
											>
												{visit.time}
											</span>
											<span className="grid min-w-0 flex-1 gap-[2px]">
												<span className={`truncate ${IOS_ROW_TITLE}`}>
													{visit.who}
												</span>
												<span className={`truncate ${IOS_ROW_META}`}>
													{visit.what}
												</span>
											</span>
											<svg
												aria-hidden="true"
												width="8"
												height="14"
												viewBox="0 0 8 14"
												className="flex-none"
											>
												<path
													d="M1 1l6 6-6 6"
													stroke="rgba(60,60,67,.3)"
													strokeWidth="2"
													fill="none"
													strokeLinecap="round"
													strokeLinejoin="round"
												/>
											</svg>
										</div>
									))}
									<div className="flex min-h-[52px] items-center justify-between px-4">
										<span className="text-[17px] font-[590] tracking-[-0.02em] text-[#0A84FF]">
											Add a visit
										</span>
										<span
											aria-hidden="true"
											className="text-[19px] leading-none text-[#0A84FF]"
										>
											+
										</span>
									</div>
								</div>
							</div>

							<div>
								<p className={IOS_GROUP_LABEL}>Waiting to sync</p>
								<div className={IOS_GROUP}>
									<div
										className={`flex min-h-[52px] items-center justify-between px-4 ${IOS_HAIRLINE}`}
									>
										<span className={IOS_ROW_TITLE}>Visit notes</span>
										<span className={IOS_ROW_META}>2 saved</span>
									</div>
									<div className="flex min-h-[52px] items-center justify-between px-4">
										<span className={IOS_ROW_TITLE}>Photos</span>
										<span className={IOS_ROW_META}>5 saved</span>
									</div>
								</div>
								<p className={`px-4 pt-2 text-[13px] leading-[1.35] ${IOS_MUTED}`}>
									Uploads by itself the moment you have a bar.
								</p>
							</div>
						</div>
					</IOSDevice>
				</div>
			</div>
		</Section>
	);
}
