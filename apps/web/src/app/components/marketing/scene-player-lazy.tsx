"use client";

import dynamic from "next/dynamic";

/* Client shell so @remotion/player (statically imported by scene-player.tsx)
 * stays out of the landing's initial bundle and only loads when a scene card
 * mounts — the same split staging used via feature-animation-lazy. */
export const JobScenePlayer = dynamic(
	() => import("./scene-player").then((m) => m.JobScenePlayer),
	{ ssr: false }
);
