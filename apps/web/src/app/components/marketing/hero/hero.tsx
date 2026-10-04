import { ArrowRight } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "../buttons";
import { LaunchOfferNote } from "../launch-offer-note";
import { MotionToggle } from "../motion-toggle";
import { Halftone } from "../halftone";
import { CheckItem, Container } from "../primitives";
import { DAY, FINAL_STEP, PAID_STEP, through } from "./day";
import { HeroStage } from "./hero-stage";
import { JobStage } from "./job-stage";

// The rewind beat lists no clock: the label clears while the playhead runs back.
function DayBar() {
	return (
		<div className="lp-daybar">
			<MotionToggle />
			<div className="lp-daybar-track" aria-hidden="true">
				<span className="lp-daybar-rail" />
				<span className="lp-daybar-fill" />
				{DAY.map(({ at }) => (
					<span key={at} className="lp-daybar-tick" style={{ left: `${at * 100}%` }} />
				))}
				<span className="lp-daybar-hours">
					<span style={{ left: 0 }}>8 AM</span>
					<span style={{ left: "44.44%" }}>12 PM</span>
					<span>5 PM</span>
				</span>
				<span className="lp-daybar-head">
					<span className="lp-daybar-clock lp-swap" data-on={String(FINAL_STEP)}>
						{DAY.map(({ clock }, step) => (
							<span key={clock} data-on={step}>
								{clock}
							</span>
						))}
					</span>
				</span>
			</div>
			<p className="lp-daybar-note">Sample day · Tue, Oct 6</p>
		</div>
	);
}

export function Hero() {
	return (
		<section className="lp-hero" aria-labelledby="hero-title">
			<Halftone scene="street" eager className="lp-hero-art" />
			<HeroStage className="lp-hero-stage">
				<Container className="lp-hero-inner">
					<div className="lp-hero-head">
						<h1 id="hero-title" className="lp-display">
							<span className="lp-beat" data-on="0 1">
								Quote it.
							</span>{" "}
							<span className="lp-beat" data-on={through(2, 4)}>
								Get it signed.
							</span>{" "}
							<span className="lp-beat" data-on={through(5)}>
								Get paid.
							</span>
						</h1>
						<div>
							<p className="lp-lede max-w-[34rem]">
								The job app for cleaning, landscaping, HVAC and trade crews. Quotes, e-signatures,
								scheduling, routes, invoices and card payments, from the office or the truck.
							</p>
							<div className="mt-8 flex flex-wrap gap-3">
								<PrimaryButton href="/sign-up">
									Start free
									<ArrowRight aria-hidden="true" size={18} />
								</PrimaryButton>
								<SecondaryButton href="#how">See how it works</SecondaryButton>
							</div>
						</div>
						<div className="lp-hero-trust">
							<ul className="flex flex-wrap gap-x-5 gap-y-2">
								<CheckItem>Free plan, no time limit</CheckItem>
								<CheckItem>No card to start</CheckItem>
								<CheckItem>14 days of Business, free</CheckItem>
							</ul>
							<LaunchOfferNote />
						</div>
					</div>

					<div className="lp-job">
						<DayBar />
						<JobStage />
					</div>
				</Container>
			</HeroStage>
			<p className="sr-only">
				Illustration: one job on a sample Tuesday for Ridgeline Home Services. Crew A leaves the yard at
				8:40 AM and finishes a power wash at Elm Street Plaza at 9:00. Rachel Whitfield signs Quote Q-001042
				for a fall property cleanup, $1,082.50, at 10:42 AM. The crew arrives at 11:00 and finishes at 1:30 PM.
				Invoice INV-002094 goes out at 1:40 PM and Rachel pays it by card from her phone at 1:52 PM, step
				{" "}{PAID_STEP + 1} of {DAY.length}. The Stripe payout lands Thursday.
			</p>
		</section>
	);
}
