import { CtaButton } from "@/app/components/landing/cta-button";
import { NightSquares } from "@/app/components/landing/night-squares";
import { ScheduleDemoForm } from "@/app/components/landing/schedule-demo-modal";

/**
 * Closing CTA plate. Theme-following — the page has no dedicated dark chapter
 * to hand off from, so a forced night sheet read as a one-off. The
 * blinking-squares lattice supplies the "runs after hours" note in both
 * themes instead (brand sky cells rising from the plate's bottom edge).
 * Server component; the demo form and the lattice are the only client
 * islands inside it.
 *
 * Copy here is agent-draft, pending Patrick.
 */
export function FinalCta() {
	return (
		<section className="p-6 sm:p-10 lg:p-14">
			{/* Double inset: the drafting plate, then the live sheet inside it.
			    Opaque so the page lattice stops at the plate edge. */}
			<div className="border border-bp-line bg-bp-paper p-2">
				<div className="relative overflow-hidden border border-bp-line bg-card">
					<NightSquares />
					<div className="relative grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,420px)]">
						<div className="flex min-h-80 flex-col justify-center px-8 py-12 sm:px-12 sm:py-16 lg:px-14 lg:py-20">
							<p className="text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-bp-anno">
								Free plan · no card required
							</p>
							<h2 className="mt-5 max-w-md text-3xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-4xl lg:text-[2.5rem]">
								Start your first job today
							</h2>
							<p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
								Set up your clients, send a quote, and get paid, all from one
								place. Nothing to install, and you can be quoting within the
								hour.
							</p>
							<div className="mt-10">
								<CtaButton href="/sign-up">Start free</CtaButton>
							</div>
						</div>

						<div className="p-2 pt-0 lg:p-4 lg:pl-0">
							{/* The form keeps its own raised sheet so inputs stay legible
							    over the lattice. */}
							<div className="relative border border-bp-line bg-background/95 px-6 py-7 backdrop-blur-sm sm:px-8 sm:py-9">
								<p className="text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-bp-anno">
									Schedule a demo
								</p>
								<p className="mt-3 text-sm leading-6 text-muted-foreground">
									Prefer a walkthrough first? We&apos;ll reach out shortly.
								</p>
								<ScheduleDemoForm idPrefix="final-cta-demo" className="mt-6" />
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
