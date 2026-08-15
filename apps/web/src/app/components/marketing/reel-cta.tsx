"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { LP_SECONDARY } from "./marketing-nav";

/* The lightbox (and with it @remotion/player) loads only on first open, and
 * unmounts entirely on close. */
const ReelLightbox = dynamic(
	() => import("./reel-lightbox").then((m) => m.ReelLightbox),
	{ ssr: false }
);

/** Anywhere on the page (nav flyout, footer) can open the hero's reel. */
export const OPEN_REEL_EVENT = "onetool:open-reel";

export function openReelLightbox() {
	window.dispatchEvent(new CustomEvent(OPEN_REEL_EVENT));
}

/**
 * The hero's secondary CTA. A tiny client island so `sections/hero.tsx` stays a
 * server component: the button carries `SecondaryButton`'s exact styling (that
 * primitive only renders an anchor, and this opens an overlay rather than
 * navigating). Also the page's single listener for OPEN_REEL_EVENT.
 */
export function HeroReelCta() {
	const [open, setOpen] = useState(false);
	const [everOpened, setEverOpened] = useState(false);

	useEffect(() => {
		const onOpen = () => {
			setOpen(true);
			setEverOpened(true);
		};
		window.addEventListener(OPEN_REEL_EVENT, onOpen);
		return () => window.removeEventListener(OPEN_REEL_EVENT, onOpen);
	}, []);

	return (
		<>
			<button
				type="button"
				onClick={() => {
					setOpen(true);
					setEverOpened(true);
				}}
				className={cn(LP_SECONDARY, "h-[52px] px-[22px] text-[17px]")}
			>
				See a job run through it
			</button>
			{everOpened ? <ReelLightbox open={open} onOpenChange={setOpen} /> : null}
		</>
	);
}
