import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { CtaButton } from "../cta-button";
import { Crosshair, KeywordMark } from "../blueprint";
import { HeroScene } from "./hero-scene";

/**
 * G-001 — the cover sheet.
 *
 * Server component end to end. The only JavaScript below this line is the CTA
 * (a client component for its hover arrow), the lattice wipe, and the vertex
 * ticks — everything else, including the entire choreography, is CSS driven by
 * the one <DrawIn> observer inside the scene.
 */

const APP_STORE_URL =
	"https://apps.apple.com/us/app/onetool-small-business-crm/id6757319255";

/**
 * Anchor for the quiet CTA. `#how-it-works` is now the A-101 sticky scene rail
 * (landing/scenes/scene-rail.tsx), which took over the id from the retired
 * HowItWorks section. The navbar's "How it Works" link points at the same one.
 */
const SCENES_ANCHOR = "#how-it-works";

/** Every one of these is enforced product behaviour, not a marketing claim. */
const FACTS = ["No credit card", "Free plan forever", "Cancel anytime"];

export default function Hero() {
	return (
		<section id="home" className="relative isolate overflow-hidden">
			{/*
			 * Drafting environment — the sheet the cover is drawn on. Pure texture:
			 * every layer is aria-hidden, token-driven, and carries no fact. The
			 * scene's own lattice stays inside <HeroScene>; this is the paper.
			 */}
			<div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
				{/*
				 * Top-third sky wash. The gradient's peak sits above the viewport
				 * edge, so by the time it reaches the headline it is already well
				 * under the 8% ceiling — a tint, never a line. #00A6F4 as a *fill*
				 * is exactly where the brand blue is allowed on light paper.
				 */}
				<div
					className="absolute inset-x-0 top-0 h-[46%]"
					style={{
						backgroundImage:
							"radial-gradient(80% 62% at 50% -12%, color-mix(in oklch, var(--bp-ink) 8%, transparent), transparent 72%)",
						maskImage: "linear-gradient(to bottom, #000 45%, transparent)",
					}}
				/>
				{/*
				 * Graph paper across the whole sheet. Two masks intersected: an
				 * overall fade (edges/bottom) and an elliptical hole punched over the
				 * copy block — guides never run under text. Browsers without
				 * mask-composite fall back to the union (grid everywhere at 8%),
				 * which degrades soft, not broken.
				 */}
				<div
					className="bp-graphpaper absolute inset-0"
					style={{
						maskImage:
							"radial-gradient(130% 100% at 50% 0%, #000 40%, transparent 84%), radial-gradient(44rem 26rem at 50% 17rem, transparent 56%, #000 82%)",
						maskComposite: "intersect",
						WebkitMaskComposite: "source-in",
					}}
				/>
				{/*
				 * Structural margin guides at the content-column edges, terminating
				 * raggedly via their own gradients, with two registration crosshairs
				 * at genuine datums (sheet origin, and the corner the scene drains
				 * toward). Hidden on phones — the column is the viewport there.
				 */}
				<div className="absolute inset-y-0 left-1/2 hidden w-full max-w-5xl -translate-x-1/2 sm:block">
					<span
						className="absolute inset-y-0 left-4 w-px lg:left-8"
						style={{
							background:
								"linear-gradient(to bottom, transparent, var(--bp-guide-strong) 7%, var(--bp-guide-strong) 88%, transparent)",
						}}
					/>
					<span
						className="absolute inset-y-0 right-4 w-px lg:right-8"
						style={{
							background:
								"linear-gradient(to bottom, transparent, var(--bp-guide-strong) 7%, var(--bp-guide-strong) 88%, transparent)",
						}}
					/>
					<svg
						width={24}
						height={24}
						className="absolute left-4 top-24 -translate-x-1/2 lg:left-8"
						focusable="false"
					>
						<Crosshair x={12} y={12} r={10} />
					</svg>
					<svg
						width={24}
						height={24}
						className="absolute bottom-16 right-4 translate-x-1/2 lg:right-8"
						focusable="false"
					>
						<Crosshair x={12} y={12} r={10} />
					</svg>
				</div>
			</div>

			<div className="mx-auto max-w-3xl px-4 pt-28 text-center sm:px-6 sm:pt-32 lg:px-8 lg:pt-40">
				<Link
					href={APP_STORE_URL}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
				>
					<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-bp-anno">
						New
					</span>
					<span aria-hidden="true" className="h-3 w-px bg-border" />
					OneTool for iPhone is on the App Store
					<ArrowUpRight aria-hidden="true" className="size-3.5" />
				</Link>

				<h1 className="mt-8 text-balance text-4xl font-medium leading-[1.05] tracking-[-0.02em] text-foreground sm:text-5xl lg:text-6xl">
					Run the whole <KeywordMark>job</KeywordMark>
					<br />
					<span className="text-muted-foreground">from your phone.</span>
				</h1>

				<p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
					Quote it, schedule it, invoice it, get paid — one tool, one price.
				</p>

				<div className="mt-9 flex w-full flex-col items-stretch gap-3 sm:mx-auto sm:w-auto sm:flex-row sm:items-center sm:justify-center">
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
				</div>

				<div className="mt-7 flex justify-center">
					<a
						href={APP_STORE_URL}
						target="_blank"
						rel="noopener noreferrer"
						aria-label="Download OneTool on the App Store"
						className="inline-block rounded-md transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
						<Image
							src="/app-store-badge-white.svg"
							alt=""
							aria-hidden="true"
							width={132}
							height={44}
							className="hidden h-11 w-auto dark:block"
							priority
							unoptimized
						/>
					</a>
				</div>

				<ul className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
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

			<HeroScene />
		</section>
	);
}
