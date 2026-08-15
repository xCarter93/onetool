import type { CSSProperties } from "react";
import { HalftoneDash } from "../halftone-dash";
import { InkButton, SheetButton } from "../marketing-nav";
import { ParticleMark } from "../particle-mark";
import {
	CheckItem,
	Container,
	DimensionLine,
	Eyebrow,
	GridBackdrop,
	Lede,
	PlusCorners,
	Section,
	SectionHeading,
} from "../primitives";
import { RoughMark } from "../rough-mark";

/* HERO — comp lines 96–166. Grid + pointer-lit halftone field behind the
 * promise, the particle mark opposite it, and one real job travelling five
 * stages underneath. Server component: every moving part (halftone, particles,
 * hand annotations) is its own client island. */

/** The halftone only paints where the copy isn't. */
const HALFTONE_MASK =
	"radial-gradient(115% 90% at 82% 26%, #000 0%, transparent 70%)";

/** Entrance stagger — the comp's `animation-delay` on `.lp-rise`/`.lp-fade`. */
const at = (delay: string) => ({ "--lp-delay": delay }) as CSSProperties;

type Tone = "accent" | "dim" | "paid";

/* Static maps — Tailwind never sees interpolated fragments. The stage text
   takes --accent-ink where the dot takes --accent: brand sky is a fill color,
   not a text color (landing.css contrast contract). */
const DOT: Record<Tone, string> = {
	accent: "bg-(--accent)",
	dim: "bg-(--ink-3)",
	paid: "bg-(--paid)",
};
const STAGE: Record<Tone, string> = {
	accent: "text-(--accent-ink)",
	dim: "text-(--ink-3)",
	paid: "text-(--paid)",
};

const LEDGER: { stage: string; label: string; when: string; tone: Tone }[] = [
	{
		stage: "Quoted",
		label: "Furnace replacement, 3 line items",
		when: "Mon 8:14 AM",
		tone: "accent",
	},
	{
		stage: "Signed",
		label: "Approved from the client's phone",
		when: "Mon 6:47 PM",
		tone: "accent",
	},
	{
		stage: "Scheduled",
		label: "Crew B, two-hour window",
		when: "Wed 9:00 AM",
		tone: "dim",
	},
	{
		stage: "Invoiced",
		label: "Same numbers, no retyping",
		when: "Wed 4:30 PM",
		tone: "dim",
	},
	{
		stage: "Paid",
		label: "Card payment, straight to the bank",
		when: "Thu 4:02 PM",
		tone: "paid",
	},
];

export function Hero() {
	return (
		<Section id="top" pad="none" containerClassName="max-w-none px-0">
			{/* legacy anchor: older links point at #home */}
			<span id="home" />

			<GridBackdrop />
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0"
				style={{
					WebkitMaskImage: HALFTONE_MASK,
					maskImage: HALFTONE_MASK,
					opacity: 0.62,
				}}
			>
				<HalftoneDash
					src="/landing/field-dawn-van.jpg"
					rows={56}
					cellRatio={1.1}
					power={1.2}
					maxBar={0.12}
					minTone={0.14}
					light={0.9}
					lightRadius={0.34}
					focus="bottom"
					exclude="[data-halftone-exclude]"
					className="h-full w-full text-(--accent)"
				/>
			</div>

			<Container className="relative grid grid-cols-[repeat(auto-fit,minmax(min(100%,400px),1fr))] items-center gap-[clamp(24px,4vw,64px)] pt-[clamp(40px,7vw,96px)]">
				<div data-halftone-exclude>
					<Eyebrow className="lp-rise">
						For HVAC, landscaping, cleaning &amp; trades
					</Eyebrow>

					{/* SectionHeading/Lede take className only, so the stagger delay rides
					    on a wrapper and the primitives keep their own type scale. */}
					<div className="lp-rise mt-5" style={at("60ms")}>
						<SectionHeading
							as="h1"
							className="mt-0 max-w-none text-[clamp(40px,6.4vw,76px)] leading-[0.99] tracking-[-0.045em]"
						>
							Quote it. Get it signed.
							<br />
							<span className="text-(--ink-2)">Get paid</span>{" "}
							<RoughMark type="underline" delay={420} className="whitespace-nowrap">
								before you
							</RoughMark>{" "}
							forget.
						</SectionHeading>
					</div>

					<div className="lp-rise mt-6" style={at("120ms")}>
						<Lede className="max-w-[34rem] text-[clamp(17px,1.4vw,20px)] leading-[1.55]">
							The whole job lives in one place — the client, the property, the
							quote, the crew, the invoice. Built to be run from a phone in a
							truck, not a desk at head office.
						</Lede>
					</div>

					<div
						className="lp-rise mt-8 flex flex-wrap items-center gap-3"
						style={at("180ms")}
					>
						<InkButton href="/sign-up">
							Start free{" "}
							<span aria-hidden="true" className="text-[15px]">
								→
							</span>
						</InkButton>
						<SheetButton href="#loop">See a job run through it</SheetButton>
					</div>

					<ul
						className="lp-rise mt-[26px] flex flex-wrap gap-x-[22px] gap-y-2"
						style={at("240ms")}
					>
						<CheckItem>Free forever plan</CheckItem>
						<CheckItem>No credit card</CheckItem>
						<CheckItem>Cancel anytime</CheckItem>
					</ul>
				</div>

				<div
					className="lp-fade relative flex min-h-[clamp(240px,32vw,420px)] items-center justify-center"
					style={at("100ms")}
				>
					<ParticleMark className="block max-w-[400px]" />
				</div>
			</Container>

			{/* the job ledger: one real job travelling */}
			<Container className="relative pb-[clamp(40px,5vw,72px)] pt-[clamp(36px,5vw,64px)]">
				<div className="mb-[14px] flex flex-wrap items-baseline justify-between gap-4">
					<p className="font-mono text-[11.5px] font-medium uppercase tracking-[0.06em] text-(--ink-3)">
						Example job · Whitfield residence, furnace replacement
					</p>
					<p className="font-mono text-[11.5px] tabular-nums text-(--ink-3)">
						Quoted Mon 8:14am → Paid Thu 4:02pm
					</p>
				</div>

				<div className="relative rounded-[14px] border border-(--rule-2) bg-(--sheet) shadow-(--lp-shadow)">
					<PlusCorners />

					<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,190px),1fr))]">
						{LEDGER.map((step, i) => (
							<div
								key={step.stage}
								className="lp-rise grid content-start gap-[9px] border-r border-(--rule) px-[18px] py-5"
								style={at(`${(0.25 + i * 0.12).toFixed(2)}s`)}
							>
								<div className="flex items-center gap-2">
									<span
										aria-hidden="true"
										className={`h-[7px] w-[7px] flex-shrink-0 rounded-full ${DOT[step.tone]}`}
									/>
									<span
										className={`font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] ${STAGE[step.tone]}`}
									>
										{step.stage}
									</span>
								</div>
								<p className="text-[15px] font-medium leading-[1.35] tracking-[-0.01em]">
									{step.label}
								</p>
								<p className="font-mono text-[11.5px] tabular-nums text-(--ink-3)">
									{step.when}
								</p>
							</div>
						))}
					</div>

					<div className="flex flex-wrap items-center justify-between gap-5 rounded-b-[13px] border-t border-(--rule) bg-(--paid-wash) px-[18px] py-4">
						<p className="text-sm text-(--ink-2)">
							{"Three days from “can you take a look?” to money in the bank."}
						</p>
						<p className="text-xl font-semibold tabular-nums tracking-[-0.02em] text-(--paid)">
							<RoughMark type="circle" color="var(--paid)" delay={180}>
								$4,180.00 paid
							</RoughMark>
						</p>
					</div>
				</div>

				{/* dimension line: the thing blueprint is actually good at measuring */}
				<DimensionLine label="3 days, 8 hrs" className="mt-[18px]" />
			</Container>
		</Section>
	);
}
