import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import type {
	TransitionPresentation,
	TransitionPresentationComponentProps,
} from "@remotion/transitions";

export interface BlueprintSweepProps {
	/** Hairline colour — pass the theme's `t.border`. */
	line: string;
	/** Lateral drift, in composition px. */
	drift?: number;
	// Remotion constrains presentation props to Record<string, unknown>.
	[key: string]: unknown;
}

const DEFAULT_DRIFT = 12;

/**
 * A vertical hairline crosses the content area left→right. Behind it the
 * outgoing scene is clipped away and the incoming one is revealed, each with a
 * small lateral drift so the cut has direction without any slide.
 *
 * Motion is ease-out (charter curve) inside the sweep, so the transition can be
 * driven by `linearTiming` and still land softly. No overshoot.
 */
const BlueprintSweep: React.FC<
	TransitionPresentationComponentProps<BlueprintSweepProps>
> = ({ children, presentationDirection, presentationProgress, passedProps }) => {
	const drift = passedProps.drift ?? DEFAULT_DRIFT;
	const exiting = presentationDirection === "exiting";
	// Sweep position as a percentage of the content width.
	const sweep = interpolate(presentationProgress, [0, 1], [0, 100], {
		easing: Easing.bezier(0.23, 1, 0.32, 1),
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	const u = sweep / 100;

	return (
		<AbsoluteFill>
			<AbsoluteFill
				style={{
					// Outgoing keeps what is still RIGHT of the line; incoming shows
					// what the line has already passed.
					clipPath: exiting
						? `inset(0 0 0 ${sweep}%)`
						: `inset(0 ${100 - sweep}% 0 0)`,
					translate: `${(exiting ? u : u - 1) * drift}px 0`,
				}}
			>
				{children}
			</AbsoluteFill>

			{/* Drawn once, on the entering layer, and outside the clip so the full
			    hairline stays visible as it travels. */}
			{exiting ? null : (
				<AbsoluteFill>
					<div
						style={{
							position: "absolute",
							top: 0,
							bottom: 0,
							left: `${sweep}%`,
							width: 1.5,
							backgroundColor: passedProps.line,
							opacity: interpolate(
								presentationProgress,
								[0, 0.08, 0.9, 1],
								[0, 1, 1, 0],
								{ extrapolateLeft: "clamp", extrapolateRight: "clamp" },
							),
						}}
					/>
				</AbsoluteFill>
			)}
		</AbsoluteFill>
	);
};

export const blueprintSweep = (
	props: BlueprintSweepProps,
): TransitionPresentation<BlueprintSweepProps> => ({
	component: BlueprintSweep,
	props,
});
