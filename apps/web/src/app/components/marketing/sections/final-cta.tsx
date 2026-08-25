"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Eyebrow, GridBackdrop, Lede, PlusCorners, Section } from "../primitives";
import { AmbientLayer } from "../ambient";
import { PrimaryButton, SecondaryButton } from "../marketing-nav";
import { RoughMark } from "../rough-mark";
import { usePrefersReducedMotion } from "../use-reduced-motion";

/* FINAL CTA — the page's last plus-corner card (comp lines 616–638). Copy is
 * verbatim; the demo form is the real one the workspace posts to, re-inked by
 * the `lp-form` token bridge. The lattice and the hand-drawn underline are
 * self-contained islands. CSS/canvas motion only — the marketing layout has no
 * LazyMotion provider. */

const BlinkingSquares = dynamic(
	() => import("@/components/react-bits/blinking-squares"),
	{ ssr: false },
);

const RisingLines = dynamic(
	() => import("@/components/react-bits/rising-lines"),
	{ ssr: false },
);

/* Split (phone input + flag set) but still server-rendered: the form is always
 * on the page, so deferring its HTML would just pop the card's height. */
const ScheduleDemoForm = dynamic(() =>
	import("@/app/components/landing/schedule-demo-modal").then(
		(m) => m.ScheduleDemoForm,
	),
);

// The canvas cannot resolve CSS custom properties — brand sky, kept literal.
const LATTICE_DARK = "#00a6f4";
const LATTICE_LIGHT = "#0284c7";

/** The 34px rule grid the lattice has to register with (GridBackdrop below). */
const GRID_CELL = 34;

/**
 * The night-squares lattice under the card: it fills the drafting grid's own
 * cells, so a lit square is one ruled square rather than a dot floating inside
 * one. `cellSize` (not `gridSize`) is what keeps it registered — a cell count
 * divides the card, which drifts off the fixed 34px rules as the card resizes.
 * Alpha stays capped at .105 so a solid cell is still furniture behind the
 * grid. A rAF canvas ignores the stylesheet's reduced-motion kill switch, so it
 * is gated in JS — and mounted only near the viewport, since this card sits at
 * the foot of a long page.
 */
function NightLattice() {
	const ref = useRef<HTMLDivElement>(null);
	const [near, setNear] = useState(false);
	const reduced = usePrefersReducedMotion();
	const { resolvedTheme } = useTheme();

	useEffect(() => {
		const node = ref.current;
		if (!node) return;
		const io = new IntersectionObserver(
			([entry]) => setNear(entry.isIntersecting),
			{ rootMargin: "25% 0px" },
		);
		io.observe(node);
		return () => io.disconnect();
	}, []);

	return (
		<div
			ref={ref}
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 overflow-hidden rounded-[19px]"
		>
			{near && !reduced ? (
				<BlinkingSquares
					className="absolute inset-0"
					direction="bottom"
					cellSize={GRID_CELL}
					squareColor={resolvedTheme === "dark" ? LATTICE_DARK : LATTICE_LIGHT}
					/* 32 of 34px: the fill lands inside the rules instead of on them */
					squareSize={0.94}
					opacity={0.105}
					intensity={1}
					minBrightness={0.4}
					twinkleSpeed={0.7}
					twinkleStrength={0.9}
					/* ramp starts higher up the card so the lattice reads across the
						   whole CTA, not just along its bottom edge */
					fadeStart={0.1}
					fadeEnd={1}
					falloff={2.2}
					dpr={1.5}
				/>
			) : null}
		</div>
	);
}

export function FinalCta() {
	const { resolvedTheme } = useTheme();
	const dark = resolvedTheme === "dark";

	return (
		<Section pad="tight" divider className="overflow-hidden">
			{/* Brand sky coming up behind the last card, right above the footer. The
			    shader renormalises its colour to full brightness and carries the
			    intensity in alpha, so source-over it can only ADD light: right on a
			    dark ground, invisible on paper. Light mode multiplies the same sky
			    instead, so the glow darkens the sheet and reads as ink rising off the
			    horizon — and it needs the higher opacity because multiplying toward
			    paper is gentler than adding to dark. Waits for the resolved theme so a
			    dark page never flashes the paper treatment. Hexes stay literal; the
			    canvas cannot read the accent token. */}
			{resolvedTheme ? (
				<AmbientLayer
					opacity={dark ? 0.3 : 0.5}
					fullBleed
					className={dark ? undefined : "mix-blend-multiply"}
				>
					<RisingLines
						color="#4cc3f7"
						horizonColor="#00a6f4"
						haloColor="#bae6fd"
						riseIntensity={0.6}
						haloIntensity={3}
						horizonIntensity={0.4}
					/>
				</AmbientLayer>
			) : null}

			<div className="relative rounded-[20px] border border-(--rule-2) bg-(--sheet)">
				<NightLattice />
				<PlusCorners />
				<GridBackdrop
					size={34}
					mask="none"
					opacity={0.5}
					className="rounded-[19px]"
				/>

				<div className="relative grid items-center gap-[clamp(32px,4vw,60px)] px-[clamp(24px,4vw,64px)] py-[clamp(40px,6vw,80px)] lg:grid-cols-[1fr_minmax(0,440px)]">
					<div className="max-w-[34rem]">
						<Eyebrow>Free plan · no card required</Eyebrow>

						<h2 className="mt-4 max-w-[18ch] text-[clamp(30px,4.4vw,54px)] font-semibold leading-[1.03] tracking-[-0.04em] text-balance">
							Send your first quote{" "}
							<RoughMark type="underline" className="whitespace-nowrap">
								before lunch
							</RoughMark>
							.
						</h2>

						<Lede>
							Add a client, build a quote, send it for signature, and hang up a
							hat or two while you&apos;re at it. You can be doing that ten
							minutes from now. There is nothing to install, and nobody you
							have to talk to first.
						</Lede>

						<div className="mt-7 flex flex-wrap gap-3">
							<PrimaryButton href="/sign-up">
								Start free{" "}
								<span aria-hidden="true" className="text-[15px]">
									→
								</span>
							</PrimaryButton>
							{/* Sheet-on-sheet would vanish: the comp's secondary CTA is paper. */}
							<SecondaryButton href="#loop" className="bg-(--paper)">
								See how it works
							</SecondaryButton>
						</div>
					</div>

					{/* Recessed well on --paper so the fields read as inset into the
					    sheet rather than floating on it, and stay legible over the
					    lattice running behind the card. */}
					<div
						id="book-a-demo"
						className="lp-form rounded-[14px] border border-(--rule-2) bg-(--paper) p-[clamp(20px,3vw,30px)]"
					>
						<Eyebrow>Book a demo</Eyebrow>
						<p className="mt-3 text-[15px] leading-[1.6] text-(--ink-2) text-pretty">
							Want a walkthrough instead? Leave your details and a real person
							gets back to you within a day to find a time.
						</p>
						<ScheduleDemoForm idPrefix="final-cta-demo" className="mt-6" />
					</div>
				</div>
			</div>
		</Section>
	);
}
