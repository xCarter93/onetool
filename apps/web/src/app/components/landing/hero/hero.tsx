import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";
import { CtaButton } from "../cta-button";
import { KeywordMark } from "../blueprint";
import { ParticleMark } from "./particle-mark";

/**
 * G-001 — the cover sheet.
 *
 * Server component end to end. The only JavaScript below this line is the CTA
 * (a client component for its hover arrow) and the particle mark plate; the
 * copy side enters on the CSS `.enter` stagger.
 *
 * Anatomy is the drawing-set chassis: a two-cell split (copy | part detail)
 * over a two-cell caption band (positioning line | facts), every cell edge
 * landing on the sheet rail. No background layers of its own — the SheetStack
 * lattice is the page's only paper.
 */

const APP_STORE_URL =
	"https://apps.apple.com/us/app/onetool-small-business-crm/id6757319255";

/**
 * Anchor for the quiet CTA. `#how-it-works` is the A-101 sticky scene rail
 * (landing/scenes/scene-rail.tsx). The navbar's "How it Works" link points at
 * the same one.
 */
const SCENES_ANCHOR = "#how-it-works";

/** Every one of these is enforced product behaviour, not a marketing claim. */
const FACTS = ["No credit card", "Free plan forever", "Cancel anytime"];

/**
 * Sheet facts, not metrics. Each pair states a capability the product actually
 * ships — nothing here is a counted number, because none of the countable ones
 * would be true yet.
 */
const SHEET_FACTS = [
	{ label: "Quote → Invoice", value: "One click" },
	{ label: "Client portal", value: "Built in" },
	{ label: "E-signatures", value: "Included" },
];

/** `--enter-delay` is a custom property; CSSProperties has no index signature. */
const delay = (ms: number) => ({ "--enter-delay": `${ms}ms` }) as CSSProperties;

export default function Hero() {
	return (
		<section id="home" className="relative">
			<div className="grid grid-cols-1 lg:grid-cols-2">
				<div className="flex min-h-130 flex-col justify-center px-6 py-16 sm:px-10 sm:py-20 lg:min-h-160 lg:border-r lg:border-bp-guide-strong lg:px-14 lg:py-24">
					<p
						style={delay(300)}
						className="enter text-[10px] font-semibold uppercase tracking-[0.18em] text-bp-anno"
					>
						G-001 · Cover
					</p>

					<h1
						style={delay(380)}
						className="enter mt-6 text-4xl font-medium leading-[1.05] tracking-tighter text-foreground sm:text-5xl lg:text-[4rem] xl:text-[5rem]"
					>
						Run the whole <KeywordMark>job</KeywordMark>{" "}
						<span className="text-muted-foreground">from your phone.</span>
					</h1>

					<div
						style={delay(520)}
						className="enter mt-10 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-4"
					>
						<CtaButton href="/sign-up" className="w-full sm:w-auto">
							Start free
						</CtaButton>
						{/*
						 * Quiet outline. A control boundary is NOT artwork: this uses
						 * --border, never a --bp-* hairline, which would fail the 3:1
						 * non-text requirement (burned three times already in this repo).
						 */}
						<Link
							href={SCENES_ANCHOR}
							className="inline-flex h-12 w-full items-center justify-center rounded-lg border border-border bg-card px-6 text-base font-medium text-foreground transition-colors duration-200 hover:bg-muted motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto"
						>
							See how it works
						</Link>

						<a
							href={APP_STORE_URL}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Download OneTool on the App Store"
							className="inline-block self-start rounded-md transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:self-auto"
						>
							{/* Two badges swapped by CSS rather than next-themes, so the hero
							    stays a server component and never flashes the wrong badge. */}
							<Image
								src="/app-store-badge-black.svg"
								alt="Download on the App Store"
								width={132}
								height={44}
								className="h-11 w-auto dark:hidden"
								priority
								unoptimized
							/>
							{/* No priority here: only one badge renders per theme, and a
							    high-priority preload for the hidden one wastes the request. */}
							<Image
								src="/app-store-badge-white.svg"
								alt=""
								aria-hidden="true"
								width={132}
								height={44}
								className="hidden h-11 w-auto dark:block"
								unoptimized
							/>
						</a>
					</div>

					<ul
						style={delay(620)}
						className="enter mt-9 flex flex-wrap items-center gap-x-5 gap-y-2"
					>
						{FACTS.map((fact) => (
							<li
								key={fact}
								className="flex items-center gap-1.5 text-xs text-muted-foreground"
							>
								<Check aria-hidden="true" className="size-3.5 text-bp-anno" />
								{fact}
							</li>
						))}
					</ul>
				</div>

				{/*
				 * The mark plate: the logo as particles that assemble on load and
				 * scatter under the pointer. Suppressed on phones only: a second
				 * full plate above the fold just pushes the real content down.
				 */}
				<div
					style={delay(200)}
					className="enter-fade relative hidden min-h-80 items-center justify-center px-6 py-12 sm:flex lg:min-h-160 lg:px-14"
				>
					<ParticleMark className="max-w-sm lg:max-w-lg" />
				</div>
			</div>

			{/* Opaque plate: the caption band interrupts the sheet lattice rather than
			    letting the graph paper read through the stats. */}
			<div className="relative grid grid-cols-1 border-t border-bp-guide-strong bg-bp-paper lg:grid-cols-2">
				<div className="border-b border-bp-guide-strong px-6 py-10 sm:px-10 lg:border-b-0 lg:border-r lg:px-14">
					<p
						style={delay(680)}
						className="enter max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg"
					>
						Quote it, schedule it, invoice it, get paid — one tool, one price.
					</p>
				</div>
				<div className="grid grid-cols-3 px-6 py-10 sm:px-10 lg:px-14">
					{SHEET_FACTS.map((fact, i) => (
						<div key={fact.label} style={delay(740 + i * 80)} className="enter">
							<p className="text-xs font-medium tracking-wide text-muted-foreground sm:text-sm">
								{fact.label}
							</p>
							<p className="mt-3 text-lg font-semibold tracking-tight text-foreground sm:text-2xl">
								{fact.value}
							</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
