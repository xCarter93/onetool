import { HeroHalftoneScene } from "../hero-halftone-scene";
import { LaunchOfferNote } from "../launch-offer-note";
import { PrimaryButton } from "../marketing-nav";
import { HeroParticleMorph } from "../hero-particle-morph";
import { HeroReelCta } from "../reel-cta";
import {
	at,
	CheckItem,
	Container,
	Eyebrow,
	GridBackdrop,
	Lede,
	Section,
	SectionHeading,
} from "../primitives";
import { RoughMark } from "../rough-mark";

/* HERO — comp lines 96–166, simplified at Patrick's direction: the faint
 * construction grid, the promise, and the particle morph opposite it.
 * Server component: every moving part is its own client island. */

export function Hero() {
	// No id="top" on the Section: page.tsx's root div owns that anchor.
	// overflow-hidden keeps the corner halftone scenes from widening the page
	// on narrow viewports.
	return (
		<Section
			pad="none"
			className="overflow-hidden"
			containerClassName="max-w-none px-0"
		>
			{/* legacy anchor: older links point at #home */}
			<span id="home" />

			<GridBackdrop />

			{/* ambient: Twenty-style halftone scene in the hero's bottom corners */}
			<HeroHalftoneScene />

			<Container className="relative grid grid-cols-[repeat(auto-fit,minmax(min(100%,400px),1fr))] items-center gap-[clamp(24px,4vw,64px)] pb-[clamp(40px,7vw,96px)] pt-[clamp(40px,7vw,96px)]">
				<div>
					{/* SectionHeading/Lede take className only, so the stagger delay rides
					    on a wrapper and the primitives keep their own type scale. */}
					<div className="lp-rise" style={at("60ms")}>
						<Eyebrow className="mb-4">
							You wear every hat. You only need OneTool.
						</Eyebrow>
						<SectionHeading
							as="h1"
							reveal={false}
							className="mt-0 max-w-[26ch] text-balance text-[clamp(44px,6.8vw,96px)] leading-[0.99] tracking-[-0.045em]"
						>
							Quote it. Get it signed.
							<br />
							<span className="text-(--ink-2)">Get paid</span>{" "}
							<RoughMark
								type="underline"
								delay={420}
								className="whitespace-nowrap"
							>
								before you
							</RoughMark>{" "}
							forget.
						</SectionHeading>
					</div>

					<div className="lp-rise mt-6" style={at("120ms")}>
						<Lede className="max-w-[34rem] text-[clamp(17px,1.4vw,20px)] leading-[1.55]">
							The whole job lives in one place: the client, the property, the
							quote, the crew, the invoice. Built to be run from a phone in
							the truck.
						</Lede>
					</div>

					<div
						className="lp-rise mt-8 flex flex-wrap items-center gap-3"
						style={at("180ms")}
					>
						<PrimaryButton href="/sign-up">
							Start free{" "}
							<span aria-hidden="true" className="text-[15px]">
								→
							</span>
						</PrimaryButton>
						<HeroReelCta />
					</div>

					<ul
						className="lp-rise mt-[26px] flex flex-wrap gap-x-[22px] gap-y-2"
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

				<div
					className="lp-fade relative flex min-h-[clamp(340px,46vw,680px)] items-center justify-center"
					style={at("100ms")}
				>
					<HeroParticleMorph className="max-w-[680px]" />
				</div>
			</Container>
		</Section>
	);
}
