import { ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/money";
import { PrimaryButton, SecondaryButton } from "../buttons";
import { LaunchOfferNote } from "../launch-offer-note";
import { MotionToggle } from "../motion-toggle";
import { CheckItem, Container } from "../primitives";
import { DAY, INVOICE_STEP, PAID_STEP, SIGNED_STEP, through } from "./day";
import { HeroMatrix } from "./hero-matrix";
import { HeroStage } from "./hero-stage";
import { JOB, JOB_TOTAL } from "./job";
import { JobStage } from "./job-stage";

const MARKS = [
	{ step: 0, label: "Sent", edge: "start" },
	{ step: SIGNED_STEP, label: "Signed" },
	{ step: PAID_STEP, label: "Paid", edge: "end" },
];

/** The job's clock as a dimension line under the sheet: quote sent to paid. */
function Timeline() {
	return (
		<div className="lp-timeline">
			<div className="lp-timeline-track" aria-hidden="true">
				<span className="lp-timeline-rail" />
				<span className="lp-timeline-fill" />
				{DAY.map(({ at }) => (
					<span key={at} className="lp-timeline-tick" style={{ left: `${at * 100}%` }} />
				))}
				<span className="lp-timeline-head" />
				{MARKS.map(({ step, label, edge }) => (
					<span
						key={label}
						className="lp-timeline-mark"
						data-on={through(step)}
						data-edge={edge}
						style={{ left: `${DAY[step].at * 100}%` }}
					>
						<strong>{label}</strong> {DAY[step].clock}
					</span>
				))}
			</div>
			<MotionToggle className="-ml-2" />
			<p className="lp-timeline-note">Sample job · quote to paid in 5 h 40 min</p>
		</div>
	);
}

export function Hero() {
	return (
		<section className="lp-hero" aria-labelledby="hero-title">
			<HeroStage className="lp-hero-stage">
				<Container className="lp-hero-inner">
					<div className="lp-hero-copy">
						<h1 id="hero-title" className="lp-display">
							<span className="lp-beat" data-on="0">
								Quote it.
							</span>{" "}
							<span className="lp-beat" data-on={through(SIGNED_STEP, INVOICE_STEP - 1)}>
								Get it signed.
							</span>{" "}
							<span className="lp-beat" data-on={through(INVOICE_STEP)}>
								Get paid.
							</span>
						</h1>
						<p className="lp-lede max-w-[34rem]">
							The job app for cleaning, landscaping, HVAC and trade crews. Quotes, e-signatures, scheduling,
							routes, invoices and card payments, from the office or the truck.
						</p>
						<div className="flex flex-wrap gap-3">
							<PrimaryButton href="/sign-up">
								Start free
								<ArrowRight aria-hidden="true" size={18} />
							</PrimaryButton>
							<SecondaryButton href="#how">See how it works</SecondaryButton>
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
						<HeroMatrix />
						<JobStage />
						<Timeline />
					</div>
				</Container>
			</HeroStage>
			<p className="sr-only">
				Illustration: one job for Ridgeline Home Services on a sample Tuesday. Quote {JOB.quote} for a fall
				property cleanup, {formatCurrency(JOB_TOTAL)}, goes to {JOB.contact} at {DAY[0].clock}. She signs it on
				her phone at {DAY[SIGNED_STEP].clock}. Crew A finishes the job at {DAY[SIGNED_STEP + 1].clock}, invoice{" "}
				{JOB.invoice} goes out at {DAY[INVOICE_STEP].clock}, and she pays it by card at {DAY[PAID_STEP].clock}.
			</p>
		</section>
	);
}
