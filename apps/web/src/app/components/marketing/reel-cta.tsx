"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// Keep the player mounted after its first open to avoid loading it again.
const ReelLightbox = dynamic(
	() => import("./reel-lightbox").then((m) => m.ReelLightbox),
	{ ssr: false }
);

/** Anywhere on the page (nav flyout, footer) can open the hero's reel. */
export const OPEN_REEL_EVENT = "onetool:open-reel";

export function openReelLightbox() {
	window.dispatchEvent(new CustomEvent(OPEN_REEL_EVENT));
}

/** Mounted once per page: owns the lightbox and is the single listener for OPEN_REEL_EVENT. */
export function ReelHost() {
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

	return everOpened ? <ReelLightbox open={open} onOpenChange={setOpen} /> : null;
}
