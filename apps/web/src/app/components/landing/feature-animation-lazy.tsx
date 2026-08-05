"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ComponentProps } from "react";

const FeatureAnimation = dynamic(
	() => import("./feature-animation").then((m) => m.FeatureAnimation),
	{
		ssr: false,
		loading: () => <Plate />,
	},
);

/**
 * The rail's persistent reel plate. Dynamic + `ssr: false` is what keeps
 * `@remotion/player` and every scene chunk out of the landing bundle: nothing
 * page-side imports the Player module statically.
 */
export const StoryReelPlayerLazy = dynamic(
	() => import("./feature-animation").then((m) => m.StoryReelPlayer),
	{ ssr: false, loading: () => <Plate /> },
);

/** Reserves the plate at the composition's 1600×1000 ratio so nothing below shifts. */
function Plate() {
	return <div className="aspect-8/5 w-full bg-muted" />;
}

/**
 * Client boundary for the Remotion Player, plus the mount gate for the stacked
 * (sub-lg) read: seven chapters are on the page, so mounting every Player up
 * front would boot seven scene chunks and seven frame loops on a phone. Each
 * one waits for its own IntersectionObserver hit and never unmounts after —
 * scrolling back up must not restart the scene.
 */
export function FeatureAnimationLazy(
	props: ComponentProps<typeof FeatureAnimation>,
) {
	const ref = useRef<HTMLDivElement>(null);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		const node = ref.current;
		if (!node) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry.isIntersecting) return;
				setMounted(true);
				observer.disconnect();
			},
			// Warm the chunk just before the plate reaches the viewport.
			{ rootMargin: "200px 0px" },
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	return <div ref={ref}>{mounted ? <FeatureAnimation {...props} /> : <Plate />}</div>;
}
