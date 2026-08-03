"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const FeatureAnimation = dynamic(
	() => import("./feature-animation").then((m) => m.FeatureAnimation),
	{
		ssr: false,
		loading: () => (
			// Reserve the plate at the composition's 1600×1000 ratio so nothing
			// below shifts when the Player mounts.
			<div className="aspect-8/5 w-full bg-muted" />
		),
	},
);

/**
 * Client boundary for the Remotion Player. Server sections render this;
 * the Player bundle loads only in the browser.
 */
export function FeatureAnimationLazy(
	props: ComponentProps<typeof FeatureAnimation>,
) {
	return <FeatureAnimation {...props} />;
}
