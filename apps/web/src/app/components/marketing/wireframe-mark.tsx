"use client";

import dynamic from "next/dynamic";

/* Client shell so the three.js bundle stays out of the server graph and only
 * loads when the hero mounts. The canvas gates itself on IntersectionObserver
 * and prefers-reduced-motion. */
export const WireframeMark = dynamic(() => import("./wireframe-mark-canvas"), {
	ssr: false,
});
