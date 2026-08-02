import { Easing, interpolate, spring } from "remotion";

export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

const clamp = {
	extrapolateLeft: "clamp",
	extrapolateRight: "clamp",
} as const;

/** 0→1 progress starting at `from`, lasting `duration` frames. */
export const progress = (frame: number, from: number, duration: number) =>
	interpolate(frame, [from, from + duration], [0, 1], {
		...clamp,
		easing: EASE_OUT,
	});

export const fadeUp = (frame: number, from: number, duration = 14, dist = 16) => ({
	opacity: interpolate(frame, [from, from + duration], [0, 1], {
		...clamp,
		easing: EASE_OUT,
	}),
	translate: `0px ${interpolate(frame, [from, from + duration], [dist, 0], {
		...clamp,
		easing: EASE_OUT,
	})}px`,
});

export const pop = (
	frame: number,
	fps: number,
	from: number,
	{ damping = 14, stiffness = 160 } = {},
) =>
	spring({
		frame: frame - from,
		fps,
		config: { damping, stiffness },
		durationInFrames: 40,
	});

/** Characters of `text` visible at `frame`, typing at `cps` chars/sec. */
export const typed = (
	text: string,
	frame: number,
	fps: number,
	from: number,
	cps = 22,
) => {
	const chars = Math.max(0, Math.floor(((frame - from) / fps) * cps));
	return text.slice(0, chars);
};
