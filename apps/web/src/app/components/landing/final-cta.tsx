import { BP_FILL } from "@/app/components/landing/blueprint";
import { CtaButton } from "@/app/components/landing/cta-button";
import { ScheduleDemoForm } from "@/app/components/landing/schedule-demo-modal";

/**
 * Closing CTA plate. Server component — no motion, it sits well below the fold.
 * The demo form is the only client island inside it.
 *
 * The hatch fill comes from the single <BlueprintDefs/> sprite mounted in
 * (marketing)/layout.tsx; never re-declare the pattern locally.
 *
 * Copy here is agent-draft, pending Patrick.
 */
export function FinalCta() {
	return (
		<section className="p-6 sm:p-10 lg:p-14">
			{/* Double inset: the drafting plate, then the sheet inside it. Opaque so
			    the page lattice stops at the plate edge. */}
			<div className="border border-bp-line bg-bp-paper p-2">
				<div className="grid grid-cols-1 border border-bp-line lg:grid-cols-[1fr_minmax(0,420px)]">
					<div className="flex min-h-80 flex-col justify-center px-8 py-12 sm:px-12 sm:py-16 lg:border-r lg:border-bp-line lg:px-14 lg:py-20">
						<p className="text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-bp-anno">
							Free plan · no card required
						</p>
						<h2 className="mt-5 max-w-md text-3xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-4xl lg:text-[2.5rem]">
							Start your first job today
						</h2>
						<p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
							Set up your clients, send a quote, and get paid — all from one
							place. Nothing to install, and you can be quoting within the hour.
						</p>
						<div className="mt-10">
							<CtaButton href="/sign-up">Get Started</CtaButton>
						</div>
					</div>

					<div className="relative border-t border-bp-line p-2 lg:border-t-0">
						{/* Hatch reads as a thin ring around the opaque form sheet. */}
						<svg
							aria-hidden="true"
							className="pointer-events-none absolute inset-0 h-full w-full"
						>
							<rect width="100%" height="100%" fill={BP_FILL.hatch45} />
						</svg>
						<div className="relative border border-bp-line bg-bp-paper px-6 py-7 sm:px-8 sm:py-9">
							<p className="text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-bp-anno">
								Schedule a demo
							</p>
							<p className="mt-3 text-sm leading-6 text-muted-foreground">
								Prefer a walkthrough first? We&apos;ll reach out within 24
								hours.
							</p>
							<ScheduleDemoForm idPrefix="final-cta-demo" className="mt-6" />
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
