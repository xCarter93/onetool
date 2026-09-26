import { SCENE_COUNT } from "./chapters";

export const STEP_BAND = 0.08;

// Enter at the chapter's clock time; a reverse dead band prevents boundary flicker.
export function stepIndex(
	current: number,
	x: number,
	band = STEP_BAND,
	count = SCENE_COUNT,
): number {
	let next = current;
	while (next < count - 1 && x >= next + 1) next++;
	while (next > 0 && x < next - band) next--;
	return next;
}
