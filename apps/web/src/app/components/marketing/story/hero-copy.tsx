import { ArrowDown, ArrowRight, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { LaunchOfferNote } from "../launch-offer-note";
import { LP_BUTTON_SIZE, LP_SECONDARY, PrimaryButton, SecondaryButton } from "../marketing-nav";
import { at, CheckItem, Lede, SectionHeading } from "../primitives";
import { openReelLightbox } from "../reel-cta";
import { RoughMark } from "../rough-mark";

export function HeroCopy({ onWatch }: { onWatch?: () => void }) {
	const watchLabel = (
		<>
			Watch the day
			<ArrowDown aria-hidden="true" size={16} />
		</>
	);
	return (
		<div className="flex flex-col items-center text-center">
			<div className="lp-rise" style={at("60ms")}>
				<p className="text-sm font-medium text-(--ink-2)">Built for the people who do the work.</p>
				<SectionHeading
					as="h1"
					reveal={false}
					className="mx-auto mt-4 max-w-[16ch] text-balance text-[clamp(40px,4.8vw,72px)] leading-[0.98] tracking-[-0.05em]"
				>
					One place to run{" "}
					<RoughMark type="underline" delay={420} className="whitespace-nowrap">
						the whole day.
					</RoughMark>
				</SectionHeading>
			</div>

			<div className="lp-rise mt-5" style={at("120ms")}>
				<Lede className="mx-auto max-w-[34rem] text-[clamp(17px,1.4vw,20px)] leading-[1.55]">
					Quotes, schedules and payments in one place.
					Keep the crew moving and the paperwork out of your evening.
				</Lede>
			</div>

			<div
				className="lp-rise mt-6 grid w-full max-w-[360px] grid-cols-1 gap-3 sm:flex sm:max-w-none sm:justify-center"
				style={at("180ms")}
			>
				<PrimaryButton href="/sign-up">
					Start free
					<ArrowRight aria-hidden="true" size={16} />
				</PrimaryButton>
				{onWatch ? (
					<button
						type="button"
						onClick={onWatch}
						className={cn(LP_SECONDARY, LP_BUTTON_SIZE.md)}
					>
						{watchLabel}
					</button>
				) : (
					<SecondaryButton href="#story-overview">{watchLabel}</SecondaryButton>
				)}
				<button
					type="button"
					onClick={openReelLightbox}
					className={cn(LP_SECONDARY, LP_BUTTON_SIZE.md)}
				>
					Watch the reel
					<Play aria-hidden="true" size={16} />
				</button>
			</div>

			<ul
				className="lp-rise mt-5 flex flex-wrap justify-center gap-x-[22px] gap-y-2"
				style={at("240ms")}
			>
				<CheckItem>Free forever plan</CheckItem>
				<CheckItem>No credit card</CheckItem>
				<CheckItem>14 days of Business, free</CheckItem>
			</ul>

			<div className="lp-rise" style={at("300ms")}>
				<LaunchOfferNote />
			</div>
		</div>
	);
}
