// Safe haptics: expo-haptics is a native module, so a JS bundle that ships
// before the next dev-client/TestFlight build would crash on a bare call.
// Resolve lazily and swallow — haptics are garnish, never gate UX on them
// (they also silently no-op in Low Power Mode / while the camera is active).
let mod: typeof import("expo-haptics") | null | undefined;

function haptics() {
	if (mod === undefined) {
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			mod = require("expo-haptics") as typeof import("expo-haptics");
		} catch {
			mod = null;
		}
	}
	return mod;
}

/** Light tick — fan satellites appearing, pickers snapping. */
export function hapticSelect() {
	try {
		haptics()?.selectionAsync().catch(() => {});
	} catch {
		// native module absent — old client build
	}
}

/** Soft impact — FAB open/close, sheet commit. */
export function hapticImpact() {
	try {
		const h = haptics();
		h?.impactAsync(h.ImpactFeedbackStyle.Light).catch(() => {});
	} catch {
		// native module absent — old client build
	}
}

/** Success notification — record created, payment recorded. */
export function hapticSuccess() {
	try {
		const h = haptics();
		h?.notificationAsync(h.NotificationFeedbackType.Success).catch(() => {});
	} catch {
		// native module absent — old client build
	}
}
