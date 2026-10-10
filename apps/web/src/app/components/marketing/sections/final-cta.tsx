import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { DemoForm } from "../demo-form";
import { PrimaryButton } from "../buttons";
import { Container } from "../primitives";

export function FinalCta() {
	return (
		<section className="lp-final" aria-labelledby="final-title">
			<div className="lp-final-photo">
				<Image
					src="/landing/field/driveway.webp"
					alt="Dusk from a work van parked outside a house, the dashboard phone showing the day’s summary in OneTool"
					fill
					sizes="100vw"
					className="lp-final-img object-cover object-left"
				/>
				<Container className="lp-final-copy">
					<h2 id="final-title" className="lp-h2">
						<span className="block">The job&rsquo;s done.</span>
						<span className="block">So is the paperwork.</span>
					</h2>
					<p className="lp-lede mt-4 max-w-[32rem]">
						Start free in a couple of minutes. Add a client, send a quote and get it signed today.
					</p>
					<div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-7">
						<PrimaryButton href="/sign-up">
							Start free
							<ArrowRight aria-hidden="true" size={18} />
						</PrimaryButton>
						<a
							href="#book-a-demo"
							className="inline-flex min-h-11 items-center self-start rounded-sm text-base font-semibold text-(--ink) underline decoration-current/40 underline-offset-4 transition-[text-decoration-color] hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current sm:self-auto"
						>
							Book a demo
						</a>
					</div>
				</Container>
			</div>

			<Container className="lp-final-demo">
				<div id="book-a-demo">
					<h3 className="lp-h3">Book a walkthrough with our team.</h3>
					<p className="mt-3 max-w-[26rem] text-base leading-relaxed text-(--ink-2)">
						Leave your details and a real person gets back to you within a day to find a time.
					</p>
				</div>
				<div className="lp-form">
					<DemoForm idPrefix="final-cta-demo" layout="grid" />
				</div>
			</Container>
		</section>
	);
}
