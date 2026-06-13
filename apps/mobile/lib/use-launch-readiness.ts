import { useAuth } from "@clerk/expo";

// Launch readiness — OPTION (a): fonts(loaded||error) + Clerk isLoaded ONLY.
// Convex readiness is intentionally best-effort: the overlay mounts ABOVE
// ConvexClerkProvider, so reading Convex auth here would throw (no provider).
// FLOOR_MS + CEILING_MS in lib/launch-gate.ts already bound dismissal, so Convex's
// initial connection is not a hard gate. fontError counts as font-ready so a font
// load failure can't strand the app on the hard ceiling.
export function useLaunchReadiness(
	fontsLoaded: boolean,
	fontError: Error | null
): boolean {
	const { isLoaded: clerkLoaded } = useAuth();
	const fontsReady = fontsLoaded || fontError != null;
	return fontsReady && clerkLoaded;
}
