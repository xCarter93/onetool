"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

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
 * server component: the button carries `SheetButton`'s exact styling (that
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
				className="inline-flex h-[52px] items-center rounded-[11px] border border-(--rule-2) bg-(--sheet) px-[22px] text-[17px] font-medium text-(--ink) transition-colors hover:border-(--rule-3) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink) focus-visible:ring-offset-2 focus-visible:ring-offset-(--paper)"
			>
				See a job run through it
			</button>
			{everOpened ? <ReelLightbox open={open} onOpenChange={setOpen} /> : null}
		</>
	);
}
