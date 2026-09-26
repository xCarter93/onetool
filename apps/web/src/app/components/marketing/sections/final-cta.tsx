"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Eyebrow, GridBackdrop, Lede, Section } from "../primitives";
import { AmbientLayer } from "../ambient";
import { PrimaryButton, SecondaryButton } from "../marketing-nav";
import { RoughMark } from "../rough-mark";
import { usePrefersReducedMotion } from "../use-reduced-motion";

const BlinkingSquares = dynamic(
	() => import("@/components/react-bits/blinking-squares"),
	{ ssr: false },
);

const RisingLines = dynamic(
	() => import("@/components/react-bits/rising-lines"),
	{ ssr: false },
);

const ScheduleDemoForm = dynamic(() =>
	import("@/app/components/landing/schedule-demo-modal").then(
		(m) => m.ScheduleDemoForm,
	),
);

// Canvas colors cannot read CSS custom properties.
const LATTICE_DARK = "#00a6f4";
const LATTICE_LIGHT = "#0284c7";

const GRID_CELL = 34;

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
					/* Keep lit squares inside the grid rules. */
					squareSize={0.94}
					opacity={0.105}
					intensity={1}
					minBrightness={0.4}
					twinkleSpeed={0.7}
					twinkleStrength={0.9}
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
	return (
		<Section pad="tight" divider className="overflow-hidden">
			<AmbientLayer
				opacity={0.4}
				fullBleed
				className="mix-blend-multiply dark:mix-blend-normal"
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

			<div className="relative rounded-[20px] border border-(--rule-2) bg-(--sheet)">
				<NightLattice />
				<GridBackdrop
					size={34}
					mask="none"
					opacity={0.5}
					className="rounded-[19px]"
				/>

				<div className="relative grid items-center gap-[clamp(32px,4vw,60px)] px-[clamp(24px,4vw,64px)] py-[clamp(40px,6vw,80px)] lg:grid-cols-[1fr_minmax(0,440px)]">
					<div className="max-w-[34rem]">
						<h2 className="max-w-[18ch] text-[clamp(30px,4.4vw,54px)] font-semibold leading-[1.03] tracking-[-0.04em] text-balance">
							Send your first quote{" "}
							<RoughMark type="underline" className="whitespace-nowrap">
								before lunch
							</RoughMark>
							.
						</h2>

						<Lede>
							Add a client, build a quote, and send it for signature.
							Your free account is ready as soon as you sign up.
						</Lede>

						<div className="mt-7 flex flex-wrap gap-3">
							<PrimaryButton href="/sign-up">
								Start free{" "}
								<span aria-hidden="true" className="text-[15px]">
									→
								</span>
							</PrimaryButton>
							<SecondaryButton href="#day" className="bg-(--paper)">
								See how it works
							</SecondaryButton>
						</div>
					</div>

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
