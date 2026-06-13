// Pure launch-splash dismissal gate (no React/RN — runs in node Vitest).
// Inputs: `ready` (resources loaded) + `floorElapsed` (brand-beat floor passed).
// Dismiss = max(readiness, floor) hybrid: only when BOTH hold, never sooner.
// FLOOR_MS = progress-bar completion (1250ms delay + 2100ms fill); CEILING_MS = hard
// deadlock override so the gate never traps the user if readiness never resolves.

export const FLOOR_MS = 3350;
export const CEILING_MS = 8000;

export function computeDismiss(ready: boolean, floorElapsed: boolean): boolean {
	return ready && floorElapsed;
}

export function shouldForceDismiss(elapsedMs: number): boolean {
	return elapsedMs >= CEILING_MS;
}
