"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Eyebrow, GridBackdrop, Lede, PlusCorners, Section } from "../primitives";
import { InkButton, SheetButton } from "../marketing-nav";
import { RoughMark } from "../rough-mark";
import { usePrefersReducedMotion } from "../use-reduced-motion";

/* FINAL CTA — the page's last plus-corner card (comp lines 616–638). Copy is
 * verbatim. The only client state here is the demo modal; the lattice and the
 * hand-drawn underline are self-contained islands. CSS/canvas motion only —
 * the marketing layout has no LazyMotion provider. */

const BlinkingSquares = dynamic(
	() => import("@/components/react-bits/blinking-squares"),
	{ ssr: false }
);

/* Heavy (phone input + flag set): the chunk loads on the first "Book a demo"
 * click, then stays mounted so closing keeps its transition. */
const ScheduleDemoModal = dynamic(
	() => import("@/app/components/landing/schedule-demo-modal"),
	{ ssr: false }
);

// The canvas cannot resolve CSS custom properties — brand sky, kept literal.
const LATTICE_DARK = "#00a6f4";
const LATTICE_LIGHT = "#0284c7";

/**
 * The night-squares lattice under the card: 34px-ish cells blinking toward the
 * bottom edge, alpha capped at .085 so it stays furniture behind the grid
 * (comp tuning per design-import/particles.NOTE.md). A rAF canvas ignores the
 * stylesheet's reduced-motion kill switch, so it is gated in JS — and mounted
 * only near the viewport, since this card sits at the foot of a long page.
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
			{ rootMargin: "25% 0px" }
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
					gridSize={15}
					squareColor={resolvedTheme === "dark" ? LATTICE_DARK : LATTICE_LIGHT}
					squareSize={0.34}
					opacity={0.085}
					intensity={1}
					minBrightness={0.35}
					twinkleSpeed={0.7}
					twinkleStrength={0.9}
					fadeStart={0.2}
					fadeEnd={1}
					falloff={2.2}
					dpr={1.5}
				/>
			) : null}
		</div>
	);
}

export function FinalCta() {
	const [demoMounted, setDemoMounted] = useState(false);
	const [demoOpen, setDemoOpen] = useState(false);

	const openDemo = () => {
		setDemoMounted(true);
		setDemoOpen(true);
	};

	return (
		<Section pad="tight">
			<div className="relative rounded-[20px] border border-(--rule-2) bg-(--sheet) shadow-(--lp-shadow)">
				<NightLattice />
				<PlusCorners />
				<GridBackdrop
					size={34}
					mask="none"
					opacity={0.5}
					className="rounded-[19px]"
				/>

				<div className="relative grid justify-items-center gap-5 px-[clamp(24px,4vw,72px)] py-[clamp(40px,6vw,88px)] text-center">
					<Eyebrow>Free plan · no card required</Eyebrow>

					<h2 className="max-w-[18ch] text-[clamp(30px,4.4vw,54px)] font-semibold leading-[1.03] tracking-[-0.04em] text-balance">
						Send your first quote{" "}
						<RoughMark type="underline" className="whitespace-nowrap">
							before lunch
						</RoughMark>
						.
					</h2>

					<Lede className="max-w-[38rem]">
						Add a client, build a quote, send it for signature. You can be doing
						that ten minutes from now — nothing to install, and nobody you have
						to talk to first.
					</Lede>

					<div className="mt-2 flex flex-wrap justify-center gap-3">
						<InkButton href="/sign-up">
							Start free{" "}
							<span aria-hidden="true" className="text-[15px]">
								→
							</span>
						</InkButton>
						{/* Sheet-on-sheet would vanish: the comp's secondary CTA is paper. */}
						<SheetButton href="#loop" className="bg-(--paper)">
							See how it works
						</SheetButton>
					</div>

					<p className="mt-1 text-[14.5px] text-(--ink-3)">
						Want a walkthrough instead?{" "}
						<button
							type="button"
							onClick={openDemo}
							className="rounded-sm font-medium text-(--ink-2) underline underline-offset-2 transition-colors hover:text-(--ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)"
						>
							Book a demo
						</button>{" "}
						and we&apos;ll reach out shortly.
					</p>
				</div>
			</div>

			{demoMounted && (
				<ScheduleDemoModal
					isOpen={demoOpen}
					onClose={() => setDemoOpen(false)}
				/>
			)}
		</Section>
	);
}
